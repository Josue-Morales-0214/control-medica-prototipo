import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useArea } from '../contexts/AreaContext';
import { useData } from '../contexts/DataContext';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import Swal from 'sweetalert2';
import { showSuccessToast } from '../utils/toast';
import { format, addDays, subDays, endOfMonth, parseISO, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { CATEGORIAS_DETALLADAS, getMasterCategory, getMovementTimeMs } from '../utils/constants';
import { 
  FileBarChart, 
  Search, 
  Download, 
  ClipboardList,
  Sun,
  Sunset,
  Moon,
  Clock,
  UserCheck,
  TrendingDown,
  TrendingUp,
  Activity,
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';

const formatNombreInsumo = (str) => {
  if (!str) return '—';
  const lowercasePreps = new Set(['de', 'la', 'en', 'el', 'al', 'con', 'para', 'por', 'y', 'o', 'del', 'los', 'las']);
  const uppercaseUnits = new Set(['c', 'm', 'l', 'xl', 's', 'ac', '3m', '5%', '10%', '0.9%', 'ui', 'vam', 'uci', '20', '21', '22', '24']);
  
  return str.split(' ').map((word, idx) => {
    const wLower = word.trim().toLowerCase();
    if (!wLower) return '';
    if (uppercaseUnits.has(wLower)) return word.toUpperCase();
    if (idx > 0 && lowercasePreps.has(wLower)) return wLower;
    return wLower.charAt(0).toUpperCase() + wLower.slice(1);
  }).join(' ');
};

const Reportes = () => {
  const { userData, currentUser, isEnfermero } = useAuth();
  const { area } = useArea();
  const { 
    insumos: allInsumos, 
    movimientos: allMovs, 
    recentMovs, 
    lotes: allLotes,
    fetchMovimientosRango,
    clearReportsCache,
    getHeaderConfig
  } = useData();

  const [activeTab, setActiveTab] = useState('diario');
  
  // Si el rol es Enfermero, restringir únicamente a la pestaña 'diario'
  useEffect(() => {
    if (isEnfermero) {
      setActiveTab('diario');
    }
  }, [isEnfermero]);
  
  // State: Diario y por Turno
  const [fechaDiario, setFechaDiario] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [turnoDiario, setTurnoDiario] = useState('Todos'); // 'Todos', 'M', 'T', 'N'
  const [catDiario, setCatDiario] = useState('Ambos');
  const [movsDiarioHistorico, setMovsDiarioHistorico] = useState(null);
  const [loadingDiario, setLoadingDiario] = useState(false);

  // State: Periodo
  const [tipoInforme, setTipoInforme] = useState('semanal');
  const [catTurno, setCatTurno] = useState('Ambos');
  const [fechaIni, setFechaIni] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [alcance, setAlcance] = useState('movimientos');

  // State: Mensual
  const [mes, setMes] = useState((new Date().getMonth() + 1).toString());
  const [anio, setAnio] = useState(new Date().getFullYear().toString());
  const [catMensual, setCatMensual] = useState('Medicamento');

  const [loading, setLoading] = useState(false);
  const [ordenPreview, setOrdenPreview] = useState('codigo_asc');

  // Estados para datos históricos cargados bajo demanda desde Firestore
  const [movsPeriodo, setMovsPeriodo] = useState(null);
  const [loadingPeriodo, setLoadingPeriodo] = useState(false);

  const [movsMensual, setMovsMensual] = useState(null);
  const [loadingMensual, setLoadingMensual] = useState(false);

  // Carga reactiva: REPORTE DIARIO / TURNO (Si es fecha antigua > 7 días)
  useEffect(() => {
    if (activeTab !== 'diario' || !fechaDiario || !area) return;

    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 7);
    const hace7DiasStr = format(hace7Dias, 'yyyy-MM-dd');

    // Si la fecha cae dentro de los últimos 7 días, usaremos recentMovs (0 lecturas)
    if (fechaDiario >= hace7DiasStr) {
      setMovsDiarioHistorico(null);
      return;
    }

    let isMounted = true;
    const loadDiarioMovs = async () => {
      setLoadingDiario(true);
      const data = await fetchMovimientosRango(fechaDiario, fechaDiario);
      if (isMounted) {
        setMovsDiarioHistorico(data);
        setLoadingDiario(false);
      }
    };

    loadDiarioMovs();
    return () => { isMounted = false; };
  }, [activeTab, fechaDiario, area, fetchMovimientosRango]);

  // Carga reactiva bajo demanda: REPORTE POR PERIODO (Usa Caché Compartido)
  useEffect(() => {
    if (activeTab !== 'periodo' || !fechaIni || !area) return;

    let isMounted = true;
    const loadPeriodoMovs = async () => {
      setLoadingPeriodo(true);
      const hoyStr = format(new Date(), 'yyyy-MM-dd');
      const startStr = (fechaIni || '').slice(0, 10);
      const data = await fetchMovimientosRango(startStr, hoyStr);
      if (isMounted) {
        setMovsPeriodo(data);
        setLoadingPeriodo(false);
      }
    };

    loadPeriodoMovs();
    return () => { isMounted = false; };
  }, [activeTab, fechaIni, tipoInforme, area, fetchMovimientosRango]);

  // Carga reactiva bajo demanda: REPORTE MENSUAL SPS1062 (Usa Caché Compartido)
  useEffect(() => {
    if (activeTab !== 'mensual' || !mes || !anio || !area) return;

    let isMounted = true;
    const loadMensualMovs = async () => {
      setLoadingMensual(true);
      const monthInt = parseInt(mes);
      const yearInt = parseInt(anio);
      const dateStart = new Date(yearInt, monthInt - 1, 1);
      const startStr = format(dateStart, 'yyyy-MM-dd');
      const hoyStr = format(new Date(), 'yyyy-MM-dd');

      const data = await fetchMovimientosRango(startStr, hoyStr);
      if (isMounted) {
        setMovsMensual(data);
        setLoadingMensual(false);
      }
    };

    loadMensualMovs();
    return () => { isMounted = false; };
  }, [activeTab, mes, anio, area, fetchMovimientosRango]);

  // --------------------------------------------------------------------------
  // CÁLCULO EN TIEMPO REAL: REPORTE DIARIO / TURNO (Live Cache Preview)
  // --------------------------------------------------------------------------
  const movsDiariosLiveData = useMemo(() => {
    const baseMovs = movsDiarioHistorico !== null ? movsDiarioHistorico : (recentMovs || []);
    if (baseMovs.length === 0) return [];
    
    const catMap = {};
    (allInsumos || []).forEach(i => {
      catMap[i.codigo] = i.categoria;
    });

    const filtered = baseMovs.filter(m => {
      const matchArea = m.area === area;
      const matchFecha = (m.fecha || '').slice(0, 10) === fechaDiario;
      
      let matchTurno = true;
      let matchTipo = true;

      if (turnoDiario !== 'Todos') {
        const t = (m.turno || '').toUpperCase().trim();
        matchTurno = t === turnoDiario || (t === '' && turnoDiario === 'M');

        // 🎯 Al seleccionar un turno específico (M, T, N), se muestran ÚNICAMENTE los egresos (salidas)
        const typeLower = (m.tipo || '').toLowerCase();
        matchTipo = typeLower.includes('salida') || typeLower.includes('egreso');
      }

      let matchCat = true;
      if (catDiario !== 'Ambos') {
        const itemCat = catMap[m.codigo_insumo] || m.categoria || '';
        if (catDiario === 'Medicamento' || catDiario === 'Médico-quirúrgico') {
          matchCat = getMasterCategory(itemCat) === catDiario;
        } else {
          matchCat = itemCat === catDiario;
        }
      }

      return matchArea && matchFecha && matchTurno && matchTipo && matchCat;
    });

    return filtered.sort((a, b) => getMovementTimeMs(b) - getMovementTimeMs(a));
  }, [recentMovs, movsDiarioHistorico, allInsumos, area, fechaDiario, turnoDiario, catDiario]);

  // Métricas KPI en Vivo
  const totalEgresosDiario = movsDiariosLiveData.reduce((acc, m) => {
    const typeLower = (m.tipo || '').toLowerCase();
    const isSalida = typeLower.includes('salida') || typeLower.includes('egreso');
    return isSalida ? acc + Number(m.cantidad || 0) : acc;
  }, 0);

  const totalIngresosDiario = movsDiariosLiveData.reduce((acc, m) => {
    const typeLower = (m.tipo || '').toLowerCase();
    const isIngreso = typeLower.includes('entrada') || typeLower.includes('ingreso') || typeLower.includes('carga_inicial');
    return isIngreso ? acc + Number(m.cantidad || 0) : acc;
  }, 0);

  const responsablesUnicosDiario = Array.from(new Set(
    movsDiariosLiveData.map(m => m.usuario || m.registrado_por).filter(Boolean)
  ));

  // EXPORTAR EXCEL REPORTE DIARIO / TURNO
  const descargarExcelDiario = () => {
    if (movsDiariosLiveData.length === 0) {
      Swal.fire('Sin datos', 'No hay movimientos registrados para la fecha y turno seleccionados.', 'info');
      return;
    }

    const filename = `Reporte_Diario_${area}_${fechaDiario}_Turno_${turnoDiario}.xlsx`;

    const dataRows = movsDiariosLiveData.map((m, idx) => {
      const typeLower = (m.tipo || '').toLowerCase();
      const isIngreso = typeLower.includes('entrada') || typeLower.includes('ingreso') || typeLower.includes('carga_inicial');
      const hourStr = m.fecha_registro?.seconds 
        ? new Date(m.fecha_registro.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        : m.hora || '—';

      return {
        'No.': idx + 1,
        'Fecha': m.fecha,
        'Hora': hourStr,
        'Turno': m.turno || 'M',
        'Operación': isIngreso ? 'Ingreso' : 'Salida',
        'Código Insumo': m.codigo_insumo || '',
        'Nombre del Insumo': formatNombreInsumo(m.nombre_insumo),
        'Cantidad': Number(m.cantidad || 0),
        'Lote': m.lote || 'N/A',
        'Fecha Vencimiento': m.fecha_vencimiento || 'N/A',
        'Personal Responsable': m.usuario || m.registrado_por || 'Sistema',
        'Observación': m.observacion || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Diario");
    XLSX.writeFile(workbook, filename);
  };

  const getSugerida = () => {
    if (!fechaIni) return '-';
    try {
      const date = parseISO(fechaIni);
      if (isNaN(date.getTime())) return '-';
      const days = tipoInforme === 'quincenal' ? 14 : 6;
      return format(addDays(date, days), 'dd/MM/yyyy');
    } catch {
      return '-';
    }
  };

  // --------------------------------------------------------------------------
  // CÁLCULO EN TIEMPO REAL: REPORTE POR PERIODO (REACTIVO CON DATOS HISTÓRICOS REALES)
  // --------------------------------------------------------------------------
  const previewPeriodoData = useMemo(() => {
    if (!fechaIni || !tipoInforme) return { data: [], days: [], respsMap: {} };

    const dateStart = parseISO(fechaIni);
    if (isNaN(dateStart.getTime())) return { data: [], days: [], respsMap: {} };

    const daysCount = tipoInforme === 'quincenal' ? 14 : 6;
    const dateEnd = addDays(dateStart, daysCount);
    const startStr = format(dateStart, 'yyyy-MM-dd');
    const endStr = format(dateEnd, 'yyyy-MM-dd');
    const days = eachDayOfInterval({ start: dateStart, end: dateEnd });
    const hoyStr = format(new Date(), 'yyyy-MM-dd');

    let filteredInsumos = catTurno === 'Ambos' ? (allInsumos || []) : (allInsumos || []).filter(i => {
      if (catTurno === 'Medicamento' || catTurno === 'Médico-quirúrgico') {
        return getMasterCategory(i.categoria) === catTurno;
      }
      return i.categoria === catTurno;
    });

    // Usar datos cargados bajo demanda desde Firestore si están listos, de lo contrario usar caché local
    const baseMovs = movsPeriodo !== null ? movsPeriodo : (allMovs || []);

    const movsDesdeInicio = baseMovs.filter(m => 
      m.area === area && 
      (m.fecha || '').slice(0, 10) >= startStr && 
      (m.fecha || '').slice(0, 10) <= hoyStr
    );

    const movsDelPeriodo = movsDesdeInicio.filter(m => {
      const fStr = (m.fecha || '').slice(0, 10);
      return fStr >= startStr && fStr <= endStr;
    });

    const respsMap = {};
    days.forEach(day => {
      const dStr = format(day, 'yyyy-MM-dd');
      respsMap[dStr] = { M: [], T: [], N: [] };
      ['M', 'T', 'N'].forEach(turno => {
        const movs = movsDelPeriodo.filter(m => {
          const matchShift = (m.fecha || '').slice(0, 10) === dStr && (m.turno || 'M') === turno;
          const typeLower = (m.tipo || '').toLowerCase();
          const isSalida = typeLower.includes('salida') || typeLower.includes('egreso');
          return matchShift && isSalida;
        });
        const names = [];
        movs.forEach(m => {
          let name = m.usuario || m.registrado_por || 'Sistema';
          if (name.includes('@')) name = name.split('@')[0];
          const cleanName = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          if (cleanName && !names.includes(cleanName)) {
            names.push(cleanName);
          }
        });
        respsMap[dStr][turno] = names;
      });
    });

    const auditData = filteredInsumos.map(ins => {
      const insCodigoStr = String(ins.codigo || '').trim();
      const allMovsIns = movsDesdeInicio.filter(m => String(m.codigo_insumo || '').trim() === insCodigoStr);
      const movsPeriodoIns = allMovsIns.filter(m => {
        const fStr = (m.fecha || '').slice(0, 10);
        return fStr >= startStr && fStr <= endStr;
      });
      const movsPosteriores = allMovsIns.filter(m => {
        const fStr = (m.fecha || '').slice(0, 10);
        return fStr > endStr;
      });

      let stockFinalMes = Number(ins.stock_actual || 0);
      movsPosteriores.forEach(m => {
        const qty = Number(m.cantidad || 0);
        const type = (m.tipo || '').toUpperCase();
        const isAjuste = type === 'AJUSTE';
        const isAjustePos = isAjuste && m.tipo_ajuste === 'INCREMENTO';
        
        if (type.includes('ENTRADA') || type.includes('INGRESO') || type === 'CARGA_INICIAL' || isAjustePos) {
          stockFinalMes -= qty;
        } else {
          stockFinalMes += qty;
        }
      });

      let saldoInicialDelMes = 0;
      let ingresosDelMes = 0;
      let consumoDelMes = 0;
      const dailyData = {};
      days.forEach(day => { dailyData[format(day, 'yyyy-MM-dd')] = { M: 0, T: 0, N: 0 }; });

      let consumoMontoTotal = 0;
      let tienePreciosHistoricos = false;

      movsPeriodoIns.forEach(m => {
        const qty = Number(m.cantidad || 0);
        const type = (m.tipo || '').toUpperCase();
        const isAjuste = type === 'AJUSTE';
        const movPrice = m.precio_unitario !== undefined && m.precio_unitario !== null ? Number(m.precio_unitario) : null;
        
        if (type === 'CARGA_INICIAL') {
          saldoInicialDelMes += qty;
        } else if (type.includes('ENTRADA') || type.includes('INGRESO') || (isAjuste && m.tipo_ajuste === 'INCREMENTO')) {
          ingresosDelMes += qty;
        } else {
          consumoDelMes += qty;
          const priceToUse = movPrice !== null ? movPrice : Number(ins.precio_unitario || 0);
          consumoMontoTotal += qty * priceToUse;
          if (movPrice !== null) tienePreciosHistoricos = true;

          const dStr = m.fecha;
          if (dailyData[dStr]) {
            const shift = m.turno || 'M';
            const validShift = ['M', 'T', 'N'].includes(shift) ? shift : 'M';
            dailyData[dStr][validShift] += qty;
          }
        }
      });

      const stockInicialCalculado = stockFinalMes - ingresosDelMes + consumoDelMes;
      const precioUnitario = Number(ins.precio_unitario || 0);
      const montoTotal = consumoMontoTotal > 0 || tienePreciosHistoricos ? consumoMontoTotal : (consumoDelMes * precioUnitario);

      return {
        codigo: ins.codigo,
        nombre: ins.nombre,
        insumo: ins,
        precioUnitario,
        montoTotal,
        stockDB: Number(ins.stock_actual || 0),
        saldoInicial: stockInicialCalculado,
        inPeriodo: ingresosDelMes,
        outPeriodo: consumoDelMes,
        ingresos: ingresosDelMes,
        consumo: consumoDelMes,
        stockFinal: stockFinalMes,
        saldoFinal: stockFinalMes,
        dailyData,
        hasMovement: movsPeriodoIns.length > 0 || ingresosDelMes > 0 || consumoDelMes > 0
      };
    });

    let filtered = auditData;
    if (alcance === 'movimientos') {
      filtered = auditData.filter(d => d.hasMovement);
    } else if (alcance === 'auditoria') {
      filtered = auditData.filter(d => d.stockDB > 0 || d.hasMovement || d.saldoInicial !== 0);
    }

    const sorted = [...filtered].sort((a, b) => {
      if (ordenPreview === 'codigo_asc') return (parseInt(a.codigo) || 0) - (parseInt(b.codigo) || 0);
      if (ordenPreview === 'codigo_desc') return (parseInt(b.codigo) || 0) - (parseInt(a.codigo) || 0);
      if (ordenPreview === 'nombre_asc') return (a.nombre || '').localeCompare(b.nombre || '', 'es');
      if (ordenPreview === 'nombre_desc') return (b.nombre || '').localeCompare(a.nombre || '', 'es');
      return 0;
    });

    return { data: sorted, days, respsMap, dateStart, dateEnd, startStr, endStr };
  }, [allInsumos, allMovs, movsPeriodo, area, fechaIni, tipoInforme, catTurno, alcance, ordenPreview]);

  // --------------------------------------------------------------------------
  // CÁLCULO EN TIEMPO REAL: REPORTE MENSUAL SPS1062 (REACTIVO CON DATOS HISTÓRICOS REALES)
  // --------------------------------------------------------------------------
  const previewMensualData = useMemo(() => {
    if (!mes || !anio || !catMensual) return { data: [], startStr: '', endStr: '', dateStart: new Date() };

    const monthInt = parseInt(mes);
    const yearInt = parseInt(anio);
    const dateStart = new Date(yearInt, monthInt - 1, 1);
    const dateEnd = endOfMonth(dateStart);
    const startStr = format(dateStart, 'yyyy-MM-dd');
    const endStr = format(dateEnd, 'yyyy-MM-dd');
    const hoyStr = format(new Date(), 'yyyy-MM-dd');

    let filteredInsumos = (allInsumos || []).filter(i => {
      if (catMensual === 'Medicamento' || catMensual === 'Médico-quirúrgico') {
        return getMasterCategory(i.categoria) === catMensual;
      }
      return i.categoria === catMensual;
    });

    // Usar datos cargados bajo demanda desde Firestore si están listos, de lo contrario usar caché local
    const baseMovs = movsMensual !== null ? movsMensual : (allMovs || []);

    const movsDesdeInicio = baseMovs.filter(m => 
      m.area === area && 
      (m.fecha || '').slice(0, 10) >= startStr && 
      (m.fecha || '').slice(0, 10) <= hoyStr
    );

    const auditData = filteredInsumos.map(ins => {
      const insCodigoStr = String(ins.codigo || '').trim();
      const allMovsIns = movsDesdeInicio.filter(m => String(m.codigo_insumo || '').trim() === insCodigoStr);
      const movsPeriodoIns = allMovsIns.filter(m => {
        const fStr = (m.fecha || '').slice(0, 10);
        return fStr >= startStr && fStr <= endStr;
      });
      const movsPosteriores = allMovsIns.filter(m => {
        const fStr = (m.fecha || '').slice(0, 10);
        return fStr > endStr;
      });

      let stockFinalMes = Number(ins.stock_actual || 0);
      movsPosteriores.forEach(m => {
        const qty = Number(m.cantidad || 0);
        const type = (m.tipo || '').toUpperCase();
        const isAjuste = type === 'AJUSTE';
        const isAjustePos = isAjuste && m.tipo_ajuste === 'INCREMENTO';
        
        if (type.includes('ENTRADA') || type.includes('INGRESO') || type === 'CARGA_INICIAL' || isAjustePos) {
          stockFinalMes -= qty;
        } else {
          stockFinalMes += qty;
        }
      });

      let ingresosDelMes = 0;
      let consumoDelMes = 0;

      let consumoMontoTotal = 0;
      let tienePreciosHistoricos = false;

      movsPeriodoIns.forEach(m => {
        const qty = Number(m.cantidad || 0);
        const type = (m.tipo || '').toUpperCase();
        const isAjuste = type === 'AJUSTE';
        const movPrice = m.precio_unitario !== undefined && m.precio_unitario !== null ? Number(m.precio_unitario) : null;
        
        if (type === 'CARGA_INICIAL') {
          // Carga inicial
        } else if (type.includes('ENTRADA') || type.includes('INGRESO') || (isAjuste && m.tipo_ajuste === 'INCREMENTO')) {
          ingresosDelMes += qty;
        } else {
          consumoDelMes += qty;
          const priceToUse = movPrice !== null ? movPrice : Number(ins.precio_unitario || 0);
          consumoMontoTotal += qty * priceToUse;
          if (movPrice !== null) tienePreciosHistoricos = true;
        }
      });

      const stockInicialCalculado = stockFinalMes - ingresosDelMes + consumoDelMes;
      const precioUnitario = Number(ins.precio_unitario || 0);
      const montoTotal = consumoMontoTotal > 0 || tienePreciosHistoricos ? consumoMontoTotal : (consumoDelMes * precioUnitario);

      return {
        codigo: ins.codigo,
        nombre: ins.nombre,
        insumo: ins,
        precioUnitario,
        montoTotal,
        stockDB: Number(ins.stock_actual || 0),
        saldoInicial: stockInicialCalculado,
        inPeriodo: ingresosDelMes,
        outPeriodo: consumoDelMes,
        ingresos: ingresosDelMes,
        consumo: consumoDelMes,
        stockFinal: stockFinalMes,
        saldoFinal: stockFinalMes,
        hasMovement: movsPeriodoIns.length > 0 || ingresosDelMes > 0 || consumoDelMes > 0
      };
    });

    const filtered = auditData.filter(d => d.stockDB > 0 || d.hasMovement || d.saldoInicial !== 0);

    const sorted = [...filtered].sort((a, b) => {
      if (ordenPreview === 'codigo_asc') return (parseInt(a.codigo) || 0) - (parseInt(b.codigo) || 0);
      if (ordenPreview === 'codigo_desc') return (parseInt(b.codigo) || 0) - (parseInt(a.codigo) || 0);
      if (ordenPreview === 'nombre_asc') return (a.nombre || '').localeCompare(b.nombre || '', 'es');
      if (ordenPreview === 'nombre_desc') return (b.nombre || '').localeCompare(a.nombre || '', 'es');
      return 0;
    });

    return { data: sorted, startStr, endStr, dateStart };
  }, [allInsumos, allMovs, movsMensual, area, mes, anio, catMensual, ordenPreview]);

  // Helper para incrustar logo en ExcelJS de manera segura (limpia prefijo data:image/... base64 o soporta HTTP URLs)
  const addLogoToExcelSheet = async (workbook, sheet, logoSrc, tl = { col: 0, row: 0 }, br = { col: 2, row: 4 }) => {
    if (!logoSrc || typeof logoSrc !== 'string') return;
    try {
      let cleanBase64 = '';
      let ext = 'png';

      if (logoSrc.startsWith('data:image')) {
        const matchExt = logoSrc.match(/^data:image\/(\w+);base64,/);
        if (matchExt) {
          ext = matchExt[1] === 'jpeg' || matchExt[1] === 'jpg' ? 'jpeg' : 'png';
        }
        cleanBase64 = logoSrc.replace(/^data:image\/\w+;base64,/, '');
      } else if (logoSrc.startsWith('http://') || logoSrc.startsWith('https://')) {
        const response = await fetch(logoSrc);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        cleanBase64 = btoa(binary);
      } else {
        cleanBase64 = logoSrc.trim();
      }

      if (cleanBase64) {
        const imageId = workbook.addImage({
          base64: cleanBase64,
          extension: ext,
        });
        sheet.addImage(imageId, { tl, br });
      }
    } catch (errLogo) {
      console.error("Error al incrustar logo en Excel:", errLogo);
    }
  };

  // EXPORTAR EXCEL OFICIAL POR PERIODO
  const descargarTurnoOficial = async () => {
    const { data: finalReportItems, days: intervalDays, respsMap, dateStart, dateEnd, startStr, endStr } = previewPeriodoData;

    if (!finalReportItems || finalReportItems.length === 0) {
      Swal.fire('Sin Datos', 'No se encontraron movimientos en este periodo para el filtro seleccionado.', 'info');
      return;
    }

    setLoading(true);
    try {
      const dictLotes = {};
      (allLotes || []).forEach(l => {
        if (!dictLotes[l.codigo_insumo]) dictLotes[l.codigo_insumo] = [];
        dictLotes[l.codigo_insumo].push(l);
      });

      const itemsWithLotes = finalReportItems.map(item => {
        const insCodigoStr = String(item.codigo || '').trim();
        const insLotes = dictLotes[insCodigoStr] || [];
        const lotesStr = insLotes.map(l => `${l.lote} (${l.fecha_vencimiento || 'N/A'})`).join('\n');
        return { ...item, lotesStr };
      });

      const headerConfig = getHeaderConfig ? await getHeaderConfig(area) : {};

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Reporte de Turnos');

      // Incrustar logotipo institucional si existe
      const logoSrcTurnos = headerConfig?.logoBase64 || headerConfig?.logoUrl;
      if (logoSrcTurnos) {
        await addLogoToExcelSheet(workbook, sheet, logoSrcTurnos, { col: 0, row: 0 }, { col: 2, row: 3 });
      }

      const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
      const subHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      const zebraFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      const whiteFont = { color: { argb: 'FFFFFFFF' }, bold: true };
      const centerAlignment = { vertical: 'middle', horizontal: 'center' };
      const borderStyle = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      const dayDividerBorder = { ...borderStyle, right: {style:'medium'} };

      sheet.getColumn(1).width = 40;
      sheet.getColumn(2).width = 12;
      sheet.getColumn(3).width = 30;

      sheet.mergeCells('A1:AC1');
      const titleCell = sheet.getCell('A1');

      // Determinar título según la categoría seleccionada o mapeo personalizado del área
      let reportTitle = '';
      if (headerConfig?.titulos_por_categoria && headerConfig.titulos_por_categoria[catTurno]) {
        reportTitle = headerConfig.titulos_por_categoria[catTurno];
      } else if (catTurno === 'Médico-quirúrgico' || catTurno === 'Médicoquirúrgico' || catTurno === '(MQ) Medicoquirurjicos') {
        reportTitle = headerConfig?.titulo_periodo_mq || `REGISTRO DE MATERIAL MÉDICO QUIRÚRGICO DE ${area.toUpperCase()}`;
      } else if (catTurno === 'Medicamento' || catTurno === 'Todos') {
        reportTitle = headerConfig?.titulo_periodo_med || 'REGISTRO DE MEDICAMENTOS DEL CARRO DE URGENCIAS';
      } else {
        reportTitle = `REGISTRO Y CONTROL DE ${catTurno.toUpperCase()} - ${area.toUpperCase()}`;
      }

      titleCell.value = reportTitle;
      titleCell.font = { size: 16, bold: true };
      titleCell.alignment = centerAlignment;

      sheet.mergeCells('A2:AC2');
      const monthCell = sheet.getCell('A2');
      monthCell.value = format(dateStart, 'MMMM yyyy', { locale: es }).toUpperCase();
      monthCell.alignment = centerAlignment;

      sheet.mergeCells('A3:K3');
      sheet.getCell('A3').value = `Area: ${area}`;
      sheet.mergeCells('L3:AC3');
      sheet.getCell('L3').value = `Periodo: ${format(dateStart, 'dd/MM/yyyy')} al ${format(dateEnd, 'dd/MM/yyyy')} (${tipoInforme.toUpperCase()})`;
      sheet.getCell('L3').alignment = { horizontal: 'right' };

      sheet.mergeCells('A5:A6');
      sheet.getCell('A5').value = 'Insumo';
      sheet.mergeCells('B5:B6');
      sheet.getCell('B5').value = 'Stock inicial';
      sheet.mergeCells('C5:C6');
      sheet.getCell('C5').value = 'Lotes y Fechas Vencimiento';

      let currentCol = 4;
      intervalDays.forEach((day) => {
        const startCol = currentCol;
        const endCol = currentCol + 2;
        sheet.mergeCells(5, startCol, 5, endCol);
        sheet.getCell(5, startCol).value = format(day, 'dd/MM');
        
        sheet.getCell(6, currentCol).value = 'M';
        sheet.getCell(6, currentCol + 1).value = 'T';
        sheet.getCell(6, currentCol + 2).value = 'N';
        
        sheet.getColumn(currentCol).width = 4;
        sheet.getColumn(currentCol + 1).width = 4;
        sheet.getColumn(currentCol + 2).width = 4;

        for(let j=0; j<3; j++) {
           const c5 = sheet.getCell(5, currentCol + j);
           const c6 = sheet.getCell(6, currentCol + j);
           c5.fill = headerFill; c5.font = whiteFont; c5.alignment = centerAlignment;
           c6.fill = subHeaderFill; c6.font = { bold: true, size: 8 }; c6.alignment = centerAlignment;
           
           const border = j === 2 ? dayDividerBorder : borderStyle;
           c5.border = border;
           c6.border = border;
        }

        currentCol += 3;
      });

      sheet.mergeCells(5, currentCol, 6, currentCol);
      sheet.getCell(5, currentCol).value = 'Total\nSalidas';
      sheet.getColumn(currentCol).width = 10;
      
      sheet.mergeCells(5, currentCol + 1, 6, currentCol + 1);
      sheet.getCell(5, currentCol + 1).value = 'Ingresos\ntotales';
      sheet.getColumn(currentCol + 1).width = 10;

      sheet.mergeCells(5, currentCol + 2, 6, currentCol + 2);
      sheet.getCell(5, currentCol + 2).value = 'Stock\nFinal';
      sheet.getColumn(currentCol + 2).width = 10;

      sheet.mergeCells(5, currentCol + 3, 6, currentCol + 3);
      sheet.getCell(5, currentCol + 3).value = 'Estado';
      sheet.getColumn(currentCol + 3).width = 10;

      ['A5', 'B5', 'C5', currentCol, currentCol+1, currentCol+2, currentCol+3].forEach(ref => {
        const isCoord = typeof ref === 'number';
        const cell5 = isCoord ? sheet.getCell(5, ref) : sheet.getCell(ref);
        const cell6 = isCoord ? sheet.getCell(6, ref) : null;
        
        cell5.fill = headerFill; cell5.font = whiteFont; cell5.alignment = centerAlignment; cell5.border = borderStyle;
        if(cell6) {
           cell6.fill = subHeaderFill; cell6.font = { bold: true, size: 8 }; cell6.alignment = centerAlignment; cell6.border = borderStyle;
        }
      });

      let startRow = 7;
      itemsWithLotes.forEach((item, idx) => {
        const row = sheet.getRow(startRow);
        const isEven = idx % 2 === 1;
        
        row.getCell(1).value = item.nombre;
        row.getCell(2).value = item.saldoInicial;
        row.getCell(3).value = item.lotesStr;
        row.getCell(3).alignment = { wrapText: true, size: 8 };

        let col = 4;
        intervalDays.forEach((day) => {
          const dStr = format(day, 'yyyy-MM-dd');
          const dData = item.dailyData[dStr] || { M: 0, T: 0, N: 0 };
          
          for(let j=0; j<3; j++) {
             const val = j === 0 ? dData.M : j === 1 ? dData.T : dData.N;
             const cell = row.getCell(col + j);
             cell.value = val === 0 ? '-' : val;
             cell.border = j === 2 ? dayDividerBorder : borderStyle;
             if (isEven) cell.fill = zebraFill;
          }
          col += 3;
        });

        row.getCell(col).value = item.outPeriodo;
        row.getCell(col + 1).value = item.inPeriodo;
        row.getCell(col + 2).value = item.stockFinal;
        
        const statusCell = row.getCell(col + 3);
        const stockMin = parseFloat(item.insumo?.stock_minimo || 0);
        const isBajo = item.stockFinal <= stockMin;
        statusCell.value = isBajo ? 'Bajo' : 'OK';
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isBajo ? 'FFFEE2E2' : 'FFDCFCE7' }
        };
        statusCell.font = { color: { argb: isBajo ? 'FF991B1B' : 'FF166534' }, bold: true };

        [1,2,3, col, col+1, col+2].forEach(cNum => {
           const cell = row.getCell(cNum);
           cell.border = borderStyle;
           if (isEven) cell.fill = zebraFill;
           cell.alignment = { ...cell.alignment, vertical: 'middle' };
        });
        statusCell.border = borderStyle;
        
        startRow++;
      });

      // Sección de Responsables por Turno al final del informe Excel
      startRow += 1;

      const respRowStart = startRow + 1;
      const respRowEnd = startRow + 3;

      sheet.mergeCells(`A${respRowStart}:B${respRowEnd}`);
      const titleRespCell = sheet.getCell(`A${respRowStart}`);
      titleRespCell.value = 'Responsables del control de los insumos por cada turno.';
      titleRespCell.font = { bold: true, size: 9 };
      titleRespCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      for (let r = respRowStart; r <= respRowEnd; r++) {
        for (let c = 1; c <= 2; c++) {
          sheet.getCell(r, c).border = borderStyle;
        }
      }

      const turnosMeta = [
        { offset: 1, label: 'Mañana' },
        { offset: 2, label: 'Tarde' },
        { offset: 3, label: 'Noche' }
      ];

      turnosMeta.forEach(t => {
        const cell = sheet.getCell(startRow + t.offset, 3);
        cell.value = t.label;
        cell.font = { bold: true, size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = borderStyle;
      });

      let rCol = 4;
      intervalDays.forEach(day => {
        const dStr = format(day, 'yyyy-MM-dd');
        const dResps = respsMap[dStr] || { M: 'Sin registro', T: 'Sin registro', N: 'Sin registro' };

        const shiftsMap = [
          { offset: 1, val: dResps.M },
          { offset: 2, val: dResps.T },
          { offset: 3, val: dResps.N }
        ];

        shiftsMap.forEach(s => {
          const r = startRow + s.offset;
          sheet.mergeCells(r, rCol, r, rCol + 2);
          const cell = sheet.getCell(r, rCol);
          cell.value = s.val;
          cell.font = { size: 8 };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

          for (let j = 0; j < 3; j++) {
            sheet.getCell(r, rCol + j).border = borderStyle;
          }
        });

        rCol += 3;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Reporte_Oficial_${area}_${startStr}_a_${endStr}.xlsx`);
      showSuccessToast('Reporte oficial generado correctamente.');

    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Fallo técnico: ' + err.message, 'error');
    }
    setLoading(false);
  };

  // EXPORTAR EXCEL OFICIAL MENSUAL SPS1062
  const descargarMensualOficial = async () => {
    const { data: reportData, dateStart } = previewMensualData;

    if (!reportData || reportData.length === 0) {
      Swal.fire('Sin Datos', 'No hay datos para exportar con los filtros seleccionados.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const headerConfig = getHeaderConfig ? await getHeaderConfig(area) : {};

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('SPS1062');

      const logoSrc = headerConfig?.logoBase64 || headerConfig?.logoUrl;
      if (logoSrc) {
        await addLogoToExcelSheet(workbook, sheet, logoSrc, { col: 1, row: 0 }, { col: 2, row: 4 });
      }

      sheet.getColumn(1).width = 5;
      sheet.getColumn(2).width = 12;
      sheet.getColumn(3).width = 45;
      sheet.getColumn(4).width = 12;
      sheet.getColumn(5).width = 12;
      sheet.getColumn(6).width = 12;
      sheet.getColumn(7).width = 12;
      sheet.getColumn(8).width = 15;
      sheet.getColumn(9).width = 16;

      const borderThin = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

      sheet.mergeCells('A1:I1');
      sheet.getCell('I1').value = headerConfig?.codigo_formulario || 'SPS -1062';
      sheet.getCell('I1').alignment = { horizontal: 'right' };
      sheet.getCell('I1').font = { size: 9 };

      sheet.mergeCells('A2:I2');
      const instCell = sheet.getCell('A2');
      instCell.value = headerConfig?.institucion || 'Instituto Guatemalteco de Seguridad Social';
      instCell.font = { bold: true, size: 12 };
      instCell.alignment = { horizontal: 'center' };

      sheet.mergeCells('A3:I3');
      const subtCell = sheet.getCell('A3');
      const cleanCatName = catMensual === 'Medicamento' ? 'Medicamentos' : catMensual === 'Médico-quirúrgico' ? 'Material Medico quirurjico' : catMensual;
      const subtTpl = headerConfig?.subtitulo_sps || 'Control de existencias físicas de {categoria} en resguardo en servicio de enfermería.';
      subtCell.value = subtTpl.replace('{categoria}', cleanCatName);
      subtCell.alignment = { horizontal: 'center' };

      const underlineBorder = { bottom: { style: 'thin' } };

      const setMetaField = (rNum, label, val) => {
        // Label in Cell C, right-aligned (attached to right border of Col C)
        const lCell = sheet.getCell(`C${rNum}`);
        lCell.value = label;
        lCell.alignment = { horizontal: 'right', vertical: 'middle' };
        lCell.font = { size: 10 };

        // Value merged D:G, centered, bottom underline border only
        sheet.mergeCells(`D${rNum}:G${rNum}`);
        const vCell = sheet.getCell(`D${rNum}`);
        vCell.value = val;
        vCell.alignment = { horizontal: 'center', vertical: 'middle' };
        vCell.font = { size: 10 };

        ['D', 'E', 'F', 'G'].forEach(col => {
          sheet.getCell(`${col}${rNum}`).border = underlineBorder;
        });
      };

      let metaRow = 5;
      setMetaField(metaRow++, 'Unidad medica', headerConfig?.unidad_medica || 'Hospital General IGSS Sololá');
      setMetaField(metaRow++, 'Nombre del servicio', area);
      setMetaField(metaRow++, 'Jefe del servicio o encargado (a)', headerConfig?.jefe_servicio || '');

      // Custom fields (if any)
      (headerConfig?.campos_adicionales || []).forEach(f => {
        if (f.etiqueta) {
          setMetaField(metaRow++, f.etiqueta, f.valor || '');
        }
      });

      const mesAñoStr = format(dateStart, 'MMMM yyyy', { locale: es }).replace(/^\w/, c => c.toUpperCase());
      setMetaField(metaRow++, 'Mes y año correspondiente', mesAñoStr);

      const fechaImpStr = format(new Date(), 'd/MM/yyyy');
      setMetaField(metaRow++, 'Fecha de impresión del informe', fechaImpStr);

      // Blank row space before table
      metaRow += 1;
      const tableHeadRow = metaRow;

      const headers = ['No.', 'Código', 'Descripción del insumo', 'Saldo inicial', 'Ingresos', 'Consumo mensual', 'Saldo final', 'Precio unitario (Q.)', 'Monto total (Q.)'];
      headers.forEach((h, i) => {
        const cell = sheet.getCell(tableHeadRow, i + 1);
        cell.value = h;
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = borderThin;
      });

      let currentRow = tableHeadRow + 1;
      reportData.forEach((item, idx) => {
        sheet.getCell(currentRow, 1).value = idx + 1;
        sheet.getCell(currentRow, 2).value = item.codigo;
        sheet.getCell(currentRow, 3).value = item.nombre;
        sheet.getCell(currentRow, 4).value = item.saldoInicial;
        sheet.getCell(currentRow, 5).value = item.ingresos;
        sheet.getCell(currentRow, 6).value = item.consumo;
        sheet.getCell(currentRow, 7).value = item.saldoFinal;
        
        const cellPUnit = sheet.getCell(currentRow, 8);
        if (item.precioUnitario > 0) {
          cellPUnit.value = item.precioUnitario;
          cellPUnit.numFmt = '"Q."#,##0.00';
        } else {
          cellPUnit.value = 'Q. --';
        }

        const cellMonto = sheet.getCell(currentRow, 9);
        if (item.precioUnitario > 0) {
          cellMonto.value = item.montoTotal;
          cellMonto.numFmt = '"Q."#,##0.00';
        } else {
          cellMonto.value = 'Q. --';
        }

        for(let i=1; i<=9; i++) {
          const cell = sheet.getCell(currentRow, i);
          cell.border = borderThin;
          cell.font = { size: 10 };
          if(i !== 3) cell.alignment = { horizontal: 'center' };
        }
        currentRow++;
      });

      currentRow += 2;
      sheet.mergeCells(`C${currentRow}:H${currentRow}`);
      sheet.getCell(`C${currentRow}`).border = { bottom: {style:'thin'} };
      
      currentRow++;
      sheet.mergeCells(`A${currentRow}:I${currentRow}`);
      const footerCell = sheet.getCell(`A${currentRow}`);
      footerCell.value = 'NOMBRE Y FIRMA DEL RESPONSABLE';
      footerCell.alignment = { horizontal: 'center' };
      footerCell.font = { size: 9, bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      const catFile = catMensual === 'Medicamento' ? 'MEDICAMENTOS' : 'MQ';
      saveAs(new Blob([buffer]), `SPS1062_${area}_${catFile}_${anio}_${mes}.xlsx`);
      showSuccessToast('Reporte SPS1062 generado correctamente.');

    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Error al generar reporte: ' + err.message, 'error');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-3.5 animate-fade-in pb-2 lg:pb-0">
      
      {/* Header del Módulo */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1 shrink-0 animate-fade-in-up">
        <div className="flex items-center gap-3.5">
           <div className="w-11 h-11 bg-white shadow-sm rounded-2xl flex items-center justify-center border border-slate-100/60 shrink-0">
             <FileBarChart className="text-primary-600" size={20} />
           </div>
           <div>
             <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-tight">Reportes del Área: {area}</h1>
             <p className="text-slate-400 text-[11px] font-medium mt-0.5 flex items-center gap-1.5">
               <span>Generación de Informes Operativos y Oficiales</span>
               <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>
               <span className="text-emerald-600 font-semibold text-[10px] uppercase tracking-wider">Bitácora en Vivo</span>
             </p>
           </div>
        </div>

        {/* Pestañas de Navegación Segmentadas */}
        {!isEnfermero ? (
          <div className="bg-slate-200/80 p-1 rounded-2xl border border-slate-300/60 shadow-inner flex items-center gap-1 shrink-0 self-start sm:self-auto">
            <button 
              onClick={() => setActiveTab('diario')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all duration-200 ${
                activeTab === 'diario' 
                  ? 'bg-primary-600 text-white shadow-md' 
                  : 'text-slate-600 hover:text-slate-900 font-semibold hover:bg-slate-300/40'
              }`}
            >
              <Sun size={14} />
              <span>Diario / Por Turno</span>
            </button>

            <button 
              onClick={() => setActiveTab('periodo')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all duration-200 ${
                activeTab === 'periodo' 
                  ? 'bg-primary-600 text-white shadow-md' 
                  : 'text-slate-600 hover:text-slate-900 font-semibold hover:bg-slate-300/40'
              }`}
            >
              <Clock size={14} />
              <span>Por Periodo</span>
            </button>

            <button 
              onClick={() => setActiveTab('mensual')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all duration-200 ${
                activeTab === 'mensual' 
                  ? 'bg-[#0284c7] text-white shadow-md' 
                  : 'text-slate-600 hover:text-slate-900 font-semibold hover:bg-slate-300/40'
              }`}
            >
              <ClipboardList size={14} />
              <span>Mensual SPS1062</span>
            </button>
          </div>
        ) : (
          <div className="bg-primary-50 text-primary-700 border border-primary-200 px-3.5 py-1.5 rounded-xl flex items-center gap-2 font-bold text-xs shadow-xs shrink-0 self-start sm:self-auto">
            <Sun size={14} className="text-primary-600" />
            <span>Reporte Diario / Por Turno</span>
          </div>
        )}
      </header>

      {/* ==================================================================== */}
      {/* PESTAÑA 1: REPORTE DIARIO / TURNO */}
      {/* ==================================================================== */}
      {activeTab === 'diario' && (
        <div className="flex flex-col flex-1 min-h-0 gap-2 animate-fade-in pb-1">
          <section className="glass-card p-2.5 px-3 rounded-2xl border border-white/60 shadow-xs shrink-0">
             <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                {/* Fecha Operativa */}
                <div className="md:col-span-4 space-y-1">
                   <label className="text-[11px] font-semibold text-slate-600 block">Fecha del reporte</label>
                   <input 
                     type="date" 
                     value={fechaDiario}
                     onChange={e => setFechaDiario(e.target.value)}
                     className="w-full px-3 py-1.5 bg-slate-50/70 border border-slate-200/70 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-[#0284c7] transition-all shadow-inner"
                   />
                </div>

                {/* Selección de Turno (Mañana, Tarde, Noche, Todos) */}
                <div className="md:col-span-5 space-y-1">
                   <label className="text-[11px] font-semibold text-slate-600 block">Turno de trabajo</label>
                   <div className="flex bg-slate-100/70 p-0.5 rounded-xl border border-slate-200/60 shadow-inner gap-0.5">
                      {[
                        { id: 'Todos', label: 'Día Completo' },
                        { id: 'M', label: 'Mañana (M)', icon: Sun },
                        { id: 'T', label: 'Tarde (T)', icon: Sunset },
                        { id: 'N', label: 'Noche (N)', icon: Moon }
                      ].map(t => {
                        const Icon = t.icon;
                        const isSel = turnoDiario === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setTurnoDiario(t.id)}
                            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
                              isSel ? 'bg-[#0284c7] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {Icon && <Icon size={12} className={isSel ? 'text-amber-300' : 'text-slate-400'} />}
                            <span>{t.label}</span>
                          </button>
                        );
                      })}
                   </div>
                </div>

                {/* Categorías */}
                <div className="md:col-span-3 space-y-1">
                   <label className="text-[11px] font-semibold text-slate-600 block">Categoría de insumos</label>
                   <select 
                     value={catDiario} 
                     onChange={e => setCatDiario(e.target.value)}
                     className="w-full px-3 py-1.5 bg-slate-50/70 border border-slate-200/70 rounded-xl text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-[#0284c7] transition-all shadow-inner"
                   >
                      <option value="Ambos">Ambos (Todos)</option>
                      <option value="Medicamento">Medicamentos</option>
                      <option value="Médico-quirúrgico">Médico-quirúrgico</option>
                   </select>
                </div>
             </div>
          </section>

          {/* Tarjetas KPI de Resumen del Turno */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 shrink-0">
             <div className="glass-card p-2.5 px-3 rounded-2xl border border-white/60 shadow-2xs flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100 shrink-0">
                   <Activity size={16} />
                </div>
                <div>
                   <div className="text-[11px] font-medium text-slate-500">Movimientos</div>
                   <div className="text-base font-bold text-slate-800">{movsDiariosLiveData.length} <span className="text-[11px] text-slate-400 font-normal">registros</span></div>
                </div>
             </div>

             <div className="glass-card p-2.5 px-3 rounded-2xl border border-white/60 shadow-2xs flex items-center gap-3">
                <div className="w-9 h-9 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center border border-rose-100 shrink-0">
                   <TrendingDown size={16} />
                </div>
                <div>
                   <div className="text-[11px] font-medium text-slate-500">Total egresos</div>
                   <div className="text-base font-bold text-rose-600">{totalEgresosDiario} <span className="text-[11px] text-slate-400 font-normal">unidades</span></div>
                </div>
             </div>

             <div className="glass-card p-2.5 px-3 rounded-2xl border border-white/60 shadow-2xs flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100 shrink-0">
                   <TrendingUp size={16} />
                </div>
                <div>
                   <div className="text-[11px] font-medium text-slate-500">Total ingresos</div>
                   <div className="text-base font-bold text-emerald-600">{totalIngresosDiario} <span className="text-[11px] text-slate-400 font-normal">unidades</span></div>
                </div>
             </div>

             <div className="glass-card p-2.5 px-3 rounded-2xl border border-white/60 shadow-2xs flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center border border-amber-100 shrink-0">
                   <UserCheck size={16} />
                </div>
                <div>
                   <div className="text-[11px] font-medium text-slate-500">Responsables</div>
                   <div className="text-base font-bold text-slate-800">{responsablesUnicosDiario.length} <span className="text-[11px] text-slate-400 font-normal">{responsablesUnicosDiario.length === 1 ? 'persona' : 'personas'}</span></div>
                </div>
             </div>
          </div>

          {/* Tabla de Vista Previa en Tiempo Real */}
          <div className="flex flex-col flex-1 min-h-0 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm font-data mb-0">
            
            {/* Header de la Tabla con Botón de Exportación Directa */}
            <div className="p-2.5 px-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between shrink-0 flex-wrap gap-2">
               <div>
                  <h3 className="text-xs font-semibold text-slate-700">Detalle operativo en vivo</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                     Mostrando {movsDiariosLiveData.length} movimiento(s) para {fechaDiario} ({turnoDiario === 'M' ? 'Mañana • Solo Egresos' : turnoDiario === 'T' ? 'Tarde • Solo Egresos' : turnoDiario === 'N' ? 'Noche • Solo Egresos' : 'Día Completo • Historial General'})
                  </p>
               </div>

               <button
                 onClick={descargarExcelDiario}
                 disabled={movsDiariosLiveData.length === 0}
                 className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#0284c7] hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all shadow-xs"
               >
                  <Download size={14} />
                  <span>Exportar Excel del turno</span>
               </button>
            </div>

            {/* VISTA MÓVIL: Tarjetas de Movimientos del Día (< md) */}
            <div className="block md:hidden flex-1 overflow-y-auto min-h-0 space-y-3 p-3">
              {movsDiariosLiveData.length === 0 ? (
                <div className="py-12 text-center text-slate-400 italic text-xs font-medium bg-slate-50 rounded-xl p-4">
                  No hay movimientos registrados para la fecha y turno seleccionados.
                </div>
              ) : (
                movsDiariosLiveData.map((m) => {
                  const typeLower = (m.tipo || '').toLowerCase();
                  const isIngreso = typeLower.includes('entrada') || typeLower.includes('ingreso') || typeLower.includes('carga_inicial');
                  const hourStr = m.fecha_registro?.seconds 
                    ? new Date(m.fecha_registro.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                    : m.hora || '—';

                  return (
                    <div key={m.id} className="p-3.5 bg-white rounded-2xl border border-slate-100 shadow-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                          {hourStr}
                        </span>
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-lg border ${
                          isIngreso 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80' 
                            : 'bg-rose-50 text-rose-700 border-rose-200/80'
                        }`}>
                          {isIngreso ? 'Ingreso' : 'Salida'}
                        </span>
                      </div>

                      <div>
                        <h4 className="font-semibold text-sm text-slate-800 leading-snug">
                          {formatNombreInsumo(m.nombre_insumo)}
                        </h4>
                        <div className="text-xs font-mono text-primary-600 font-semibold mt-0.5">
                          Cod: {m.codigo_insumo}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Cantidad / Lote</span>
                          <span className="font-bold text-slate-800">{m.cantidad} u.</span>
                          <span className="text-slate-400 text-[11px]"> (Lote: {m.lote || 'N/A'})</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 block text-[10px]">Personal</span>
                          <span className="font-medium text-slate-700">{m.usuario || m.registrado_por || 'Sistema'}</span>
                        </div>
                      </div>

                      {m.observacion && (
                        <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-100 italic">
                          Nota: {m.observacion}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* VISTA ESCRITORIO: Tabla Completa (>= md) */}
            <div className="hidden md:flex flex-col flex-1 overflow-y-auto min-h-0">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
                  <tr className="bg-slate-50/50">
                    <th className="pl-4 pr-2 py-2.5 text-xs font-semibold text-slate-400 tracking-wide w-20">Hora</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center w-24">Operación</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 tracking-wide">Insumo médico / Medicamento</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center w-24">Cantidad</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center w-28">Lote</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 tracking-wide w-36">Personal</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-right pr-5">Observación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px]">
                  {movsDiariosLiveData.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-20 text-center text-slate-400 italic text-xs font-medium">
                        No hay movimientos registrados para la fecha y turno seleccionados.
                      </td>
                    </tr>
                  ) : (
                    movsDiariosLiveData.map((m) => {
                      const typeLower = (m.tipo || '').toLowerCase();
                      const isIngreso = typeLower.includes('entrada') || typeLower.includes('ingreso') || typeLower.includes('carga_inicial');
                      const hourStr = m.fecha_registro?.seconds 
                        ? new Date(m.fecha_registro.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                        : m.hora || '—';

                      return (
                        <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="pl-4 pr-2 py-3 font-mono text-xs font-semibold text-slate-500">
                             {hourStr}
                          </td>
                          <td className="px-3 py-3 text-center">
                             <span className={`inline-block text-[10px] font-semibold px-2.5 py-0.5 rounded-lg border ${
                               isIngreso 
                                 ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80' 
                                 : 'bg-rose-50 text-rose-700 border-rose-200/80'
                             }`}>
                                {isIngreso ? 'Ingreso' : 'Salida'}
                             </span>
                          </td>
                          <td className="px-3 py-3">
                             <div className="font-medium text-[13px] text-slate-800 leading-snug">
                                {formatNombreInsumo(m.nombre_insumo)}
                             </div>
                             <div className="text-[11px] font-mono text-primary-600 font-semibold mt-0.5">
                                Cod: {m.codigo_insumo}
                             </div>
                          </td>
                          <td className="px-3 py-3 text-center font-bold font-data text-xs text-slate-800">
                             {m.cantidad} u.
                          </td>
                          <td className="px-3 py-3 text-center font-mono text-xs text-slate-600">
                             {m.lote || 'N/A'}
                          </td>
                          <td className="px-3 py-3 text-slate-700 font-medium text-xs">
                             {m.usuario || m.registrado_por || 'Sistema'}
                          </td>
                          <td className="px-4 py-3 text-right pr-5 text-slate-400 text-xs italic truncate max-w-xs">
                             {m.observacion || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ==================================================================== */}
      {/* PESTAÑA 2: REPORTE POR PERIODO */}
      {/* ==================================================================== */}
      {activeTab === 'periodo' && (
        <div className="flex flex-col flex-1 min-h-0 gap-2 animate-fade-in pb-1">
          <section className="glass-card p-2.5 px-3 rounded-2xl border border-white/60 shadow-xs shrink-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {/* Tipo de Informe */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 block ml-1">Duración</label>
                <div className="flex bg-slate-50/80 p-0.5 rounded-xl border border-slate-200/60 shadow-inner">
                  {['semanal', 'quincenal'].map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setTipoInforme(t);
                        setFechaIni(format(subDays(new Date(), t === 'quincenal' ? 14 : 6), 'yyyy-MM-dd'));
                      }}
                      className={`flex-1 py-1.5 px-3 rounded-lg font-semibold text-xs transition-all ${tipoInforme === t ? 'bg-[#0284c7] text-white shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {t === 'semanal' ? 'Semanal' : 'Quincenal'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categorías */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 block ml-1">Categorías</label>
                <div className="relative">
                  <select 
                    value={catTurno || ''} 
                    onChange={e => setCatTurno(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs text-slate-700 outline-none focus:bg-white focus:border-[#0284c7] transition-all shadow-inner font-medium appearance-none"
                  >
                    <option value="Ambos">Ambos (Todo el stock)</option>
                    <optgroup label="Filtros Maestros">
                      <option value="Medicamento">Todos los medicamentos</option>
                      <option value="Médico-quirúrgico">Todo médico-quirúrgico</option>
                    </optgroup>
                    <optgroup label="Categorías Detalladas">
                      {CATEGORIAS_DETALLADAS.map(cat => (
                        <option key={cat} value={cat}>{cat.includes(')') ? cat.split(')')[0] + ')' : cat}</option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400 text-[8px]">▼</div>
                </div>
              </div>

              {/* Fecha Inicio */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 block ml-1">Fecha de Inicio</label>
                <div className="relative">
                  <input
                    type="date"
                    value={fechaIni}
                    onChange={(e) => setFechaIni(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-[#0284c7] transition-all shadow-inner"
                  />
                  {fechaIni && (
                    <div className="text-[10px] font-semibold text-sky-600 mt-0.5 ml-1">
                      Fin: {getSugerida()}
                    </div>
                  )}
                </div>
              </div>

              {/* Alcance del Informe */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 block ml-1">Alcance</label>
                <div className="flex bg-slate-50/80 p-0.5 rounded-xl border border-slate-200/60 shadow-inner">
                  {[
                    { id: 'movimientos', label: 'Solo Movs' },
                    { id: 'auditoria', label: 'Auditoría' },
                    { id: 'todo', label: 'Catálogo' }
                  ].map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setAlcance(a.id)}
                      className={`flex-1 py-1.5 px-1 rounded-lg font-semibold text-[10px] transition-all ${alcance === a.id ? 'bg-[#0284c7] text-white shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ordenación */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 block ml-1">Ordenación</label>
                <select
                  value={ordenPreview}
                  onChange={e => setOrdenPreview(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs text-slate-700 outline-none focus:bg-white focus:border-[#0284c7] transition-all shadow-inner font-medium"
                >
                  <option value="codigo_asc">Código (Menor a Mayor)</option>
                  <option value="codigo_desc">Código (Mayor a Menor)</option>
                  <option value="nombre_asc">Nombre (A ➔ Z)</option>
                  <option value="nombre_desc">Nombre (Z ➔ A)</option>
                </select>
              </div>
            </div>
          </section>

          {/* Tabla de Vista Previa Reactiva en Vivo */}
          <section id="audit-table" className="glass-card p-3 rounded-2xl border border-white/60 shadow-md animate-fade-in-up mb-0 font-data flex flex-col flex-1 min-h-0">
             <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2 gap-2 flex-wrap shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-bold text-slate-700 tracking-wide">
                    Vista previa ({previewPeriodoData.data.length} registros)
                  </h3>
                  {loadingPeriodo ? (
                    <span className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60 flex items-center gap-1 animate-pulse">
                      <RefreshCw size={12} className="animate-spin text-amber-600" />
                      <span>Consultando historial...</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500 font-medium bg-slate-100/80 px-2 py-0.5 rounded-full border border-slate-200/60 flex items-center gap-1">
                      <span className="text-blue-600 font-bold text-[10px]">ℹ️</span>
                      <span className="text-[10px]">Reflejo exacto del Excel. <b>S.Ini</b> = Stock hoy − entradas + salidas</span>
                    </span>
                  )}
                </div>

                <button 
                  onClick={descargarTurnoOficial} 
                  disabled={loading || loadingPeriodo || previewPeriodoData.data.length === 0} 
                  className="hidden md:flex py-1.5 px-3.5 bg-[#0284c7] hover:bg-sky-700 disabled:opacity-50 text-white font-semibold text-xs items-center justify-center gap-2 rounded-xl transition-all shadow-xs active:scale-95"
                >
                  <Download size={14} /> {loading ? 'PROCESANDO...' : 'Descargar Excel oficial'}
                </button>
             </div>

             {/* VISTA MÓVIL: Tarjeta Ejecutiva de Descarga por Período (< md) */}
             <div className="block md:hidden bg-white p-5 rounded-2xl border border-slate-100 shadow-sm text-center space-y-3 font-data my-2">
               <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100">
                 <FileSpreadsheet size={24} />
               </div>
               <div>
                 <h3 className="font-bold text-base text-slate-800">Descarga de Reporte por Período</h3>
                 <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                   La vista previa con desglose detallado de turnos y backtracking está optimizada para pantallas de escritorio. Puedes descargar la hoja en Excel directamente desde este botón.
                 </p>
               </div>
               <button
                 onClick={descargarTurnoOficial}
                 disabled={loading || loadingPeriodo || previewPeriodoData.data.length === 0}
                 className="w-full py-3 bg-[#0284c7] hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-2"
               >
                 <Download size={16} />
                 <span>{loading ? 'PROCESANDO...' : 'Descargar Excel oficial'}</span>
               </button>
             </div>

             {/* VISTA ESCRITORIO: Tabla Completa por Período (>= md) */}
             <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl flex-1 min-h-0 overflow-y-auto">
               <table className="w-full text-left border-collapse min-w-[1000px]">
                 <thead className="sticky top-0 z-20 shadow-xs">
                   <tr className="bg-[#0f172a] text-white text-[11px] font-semibold tracking-wide border-b border-slate-700">
                     <th className="p-2 border-r border-slate-700 text-left sticky left-0 bg-[#0f172a] z-20 w-48 max-w-[200px]" rowSpan={2}>
                       Insumo / Medicamento
                     </th>
                     <th className="p-1.5 border-r border-slate-700 bg-[#0f172a] text-center font-bold" colSpan={2}>
                       Auditoría (Backtracking)
                     </th>
                     {previewPeriodoData.days.map((day, idx) => (
                       <th key={idx} className="p-1.5 border-r border-slate-700 text-center bg-[#0f172a] text-white font-bold" colSpan={3}>
                         {format(day, 'EEE dd/MM', { locale: es })}
                       </th>
                     ))}
                     <th className="p-1.5 border-r border-slate-700 text-center bg-[#0f172a] font-bold w-14" rowSpan={2}>
                       Ingr.
                     </th>
                     <th className="p-1.5 border-r border-slate-700 text-center bg-[#0f172a] font-bold w-14" rowSpan={2}>
                       Egr.
                     </th>
                     <th className="p-1.5 text-center bg-[#0f172a] font-bold w-20" rowSpan={2}>
                       Saldo Final
                     </th>
                   </tr>

                   <tr className="bg-slate-100 border-b border-slate-300 text-[10px] font-bold text-slate-600 tracking-tight">
                     <th className="p-1 text-center border-r border-slate-200 text-slate-400 w-12">Hoy</th>
                     <th className="p-1 text-center border-r border-slate-300 text-blue-700 bg-blue-50/50 w-14 font-extrabold">S.Ini</th>
                     {previewPeriodoData.days.map((_, dIdx) => (
                        <React.Fragment key={dIdx}>
                          <th className="p-1 text-center border-r border-slate-200 text-slate-500 w-8">M</th>
                          <th className="p-1 text-center border-r border-slate-200 text-slate-500 w-8">T</th>
                          <th className="p-1 text-center border-r-2 border-slate-300 text-slate-500 w-8">N</th>
                        </React.Fragment>
                      ))}
                   </tr>
                 </thead>

                 <tbody className="divide-y divide-slate-200 text-xs font-data">
                   {previewPeriodoData.data.map((item, idx) => {
                     const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';
                     const saldoFinalVal = item.stockFinal ?? item.saldoFinal ?? 0;
                     return (
                       <tr key={idx} className={`hover:bg-blue-50/20 transition-colors ${rowBg}`}>
                         <td className={`p-2 border-r border-slate-200 sticky left-0 z-10 w-48 max-w-[200px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] ${rowBg}`}>
                           <div className="font-semibold text-slate-800 tracking-tight text-[11px] leading-snug truncate" title={item.nombre}>
                             {formatNombreInsumo(item.nombre)}
                           </div>
                           <div className="text-[10px] text-slate-400 font-mono italic mt-0.5">
                             Cod: {item.codigo}
                           </div>
                         </td>

                         {/* Auditoría (Backtracking) */}
                         <td className="p-2 text-center text-slate-500 font-mono text-xs border-r border-slate-100">{item.stockDB}</td>
                         <td className={`p-2 text-center font-bold font-mono text-xs border-r border-slate-200 bg-blue-50/30 ${item.saldoInicial < 0 ? 'text-rose-600 bg-rose-50' : 'text-blue-700'}`}>
                           {item.saldoInicial}
                         </td>

                         {/* Turnos por Día */}
                         {previewPeriodoData.days.map((day, dIdx) => {
                           const dStr = format(day, 'yyyy-MM-dd');
                           const dData = item.dailyData[dStr] || { M: 0, T: 0, N: 0 };
                           return (
                             <React.Fragment key={dIdx}>
                               <td className={`p-1 text-center font-mono text-xs border-r border-slate-100 ${dData.M > 0 ? 'font-bold text-slate-800' : 'text-slate-300'}`}>
                                 {dData.M > 0 ? dData.M : '-'}
                               </td>
                               <td className={`p-1 text-center font-mono text-xs border-r border-slate-100 ${dData.T > 0 ? 'font-bold text-slate-800' : 'text-slate-300'}`}>
                                 {dData.T > 0 ? dData.T : '-'}
                               </td>
                               <td className={`p-1 text-center font-mono text-xs border-r-2 border-slate-200 ${dData.N > 0 ? 'font-bold text-slate-800' : 'text-slate-300'}`}>
                                 {dData.N > 0 ? dData.N : '-'}
                               </td>
                             </React.Fragment>
                           );
                         })}

                         <td className="p-2 text-center text-emerald-600 font-bold font-mono text-xs border-r border-slate-100">
                           +{item.inPeriodo}
                         </td>
                         <td className="p-2 text-center text-rose-600 font-bold font-mono text-xs border-r border-slate-100">
                           -{item.outPeriodo}
                         </td>
                         <td className={`p-2 text-center font-bold font-mono text-xs bg-slate-50/50 ${saldoFinalVal < 0 ? 'text-rose-600 bg-rose-50' : 'text-slate-900'}`}>
                           {saldoFinalVal}
                         </td>
                       </tr>
                     );
                   })}
                  </tbody>
                </table>
              </div>

              {/* Tabla de Responsables Compacta Integrada */}
              {previewPeriodoData.days.length > 0 && (
                <div className="hidden md:block border-t border-slate-200/80 pt-3 mt-2 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-bold text-slate-700 tracking-tight flex items-center gap-1.5">
                      <span className="h-2 w-2 bg-[#0284c7] rounded-full"></span>
                      <span>Responsables identificados por turno</span>
                    </h4>
                    <span className="text-[10px] text-slate-400 font-medium">Trazabilidad de enfermería</span>
                  </div>
                  <div className="overflow-x-auto border border-slate-300 rounded-xl bg-white shadow-2xs">
                    <table className="w-full text-[10px] border-collapse min-w-[800px]">
                      <thead>
                        <tr className="bg-[#0f172a] text-white font-bold text-[10px] border-b border-slate-700">
                          <th className="p-1.5 text-center w-24 border-r border-slate-700">Turno</th>
                          {previewPeriodoData.days.map((day, dIdx) => (
                            <th key={dIdx} className="p-1.5 text-center border-r border-slate-700 font-bold">
                              {format(day, 'EEE dd/MM', { locale: es })}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {[
                          { key: 'M', label: 'Mañana' },
                          { key: 'T', label: 'Tarde' },
                          { key: 'N', label: 'Noche' }
                        ].map((shift, tIdx) => {
                          return (
                            <tr key={tIdx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-2 font-bold bg-[#0f172a] text-white text-[11px] text-center border-r border-slate-700 w-24">
                                {shift.label}
                              </td>
                              {previewPeriodoData.days.map((day, dIdx) => {
                                const dStr = format(day, 'yyyy-MM-dd');
                                const resps = previewPeriodoData.respsMap[dStr]?.[shift.key] || [];
                                return (
                                  <td key={dIdx} className="p-1.5 text-center border-r border-slate-200 align-middle">
                                    {resps.length > 0 ? (
                                      <div className="flex flex-col gap-1 items-center justify-center">
                                        {resps.map((name, nIdx) => (
                                          <span key={nIdx} className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-sky-50 text-sky-700 border border-sky-200/80 shadow-2xs truncate max-w-[110px]" title={name}>
                                            {name}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-slate-300 font-mono text-[11px]">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

             {previewPeriodoData.data.length === 0 && !loadingPeriodo && (
               <div className="p-12 text-center flex flex-col items-center gap-2">
                 <Search size={36} className="text-slate-300" />
                 <div className="text-slate-400 font-medium text-xs">No se encontraron datos que coincidan con los filtros seleccionados.</div>
               </div>
             )}
          </section>
        </div>
      )}

      {/* ==================================================================== */}
      {/* PESTAÑA 3: MENSUAL GENERAL (SPS1062) */}
      {/* ==================================================================== */}
      {activeTab === 'mensual' && (
        <div className="flex flex-col flex-1 min-h-0 gap-2 animate-fade-in pb-1">
          <section className="glass-card p-2.5 px-3 rounded-2xl border border-white/60 shadow-xs shrink-0">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
               <div className="space-y-1">
                 <label className="text-[11px] font-semibold text-slate-500 block ml-1">Mes</label>
                 <select value={mes} onChange={e => setMes(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs text-slate-700 outline-none focus:bg-white focus:border-[#0284c7] transition-all shadow-inner font-medium">
                   <option value="1">Enero</option><option value="2">Febrero</option><option value="3">Marzo</option>
                   <option value="4">Abril</option><option value="5">Mayo</option><option value="6">Junio</option>
                   <option value="7">Julio</option><option value="8">Agosto</option><option value="9">Septiembre</option>
                   <option value="10">Octubre</option><option value="11">Noviembre</option><option value="12">Diciembre</option>
                 </select>
               </div>
               <div className="space-y-1">
                 <label className="text-[11px] font-semibold text-slate-500 block ml-1">Año</label>
                 <input type="number" min="2020" max="2050" value={anio} onChange={e => setAnio(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs text-slate-700 outline-none focus:bg-white focus:border-[#0284c7] transition-all shadow-inner font-medium" />
               </div>
               <div className="space-y-1">
                 <label className="text-[11px] font-semibold text-slate-500 block ml-1">Categoría</label>
                 <select value={catMensual} onChange={e => setCatMensual(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs text-slate-700 outline-none focus:bg-white focus:border-[#0284c7] transition-all shadow-inner font-medium">
                   <optgroup label="Filtros Maestros">
                     <option value="Medicamento">Todos los medicamentos</option>
                     <option value="Médico-quirúrgico">Todo médico-quirúrgico</option>
                   </optgroup>
                   <optgroup label="Categorías Detalladas">
                     {CATEGORIAS_DETALLADAS.map(cat => (
                       <option key={cat} value={cat}>{cat.includes(')') ? cat.split(')')[0] + ')' : cat}</option>
                     ))}
                   </optgroup>
                 </select>
               </div>
               <div className="space-y-1">
                 <label className="text-[11px] font-semibold text-slate-500 block ml-1">Ordenación del Informe</label>
                 <select
                   value={ordenPreview}
                   onChange={e => setOrdenPreview(e.target.value)}
                   className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs text-slate-700 outline-none focus:bg-white focus:border-[#0284c7] transition-all shadow-inner font-medium"
                 >
                   <option value="codigo_asc">Código (Menor a Mayor)</option>
                   <option value="codigo_desc">Código (Mayor a Menor)</option>
                   <option value="nombre_asc">Nombre (A ➔ Z)</option>
                   <option value="nombre_desc">Nombre (Z ➔ A)</option>
                 </select>
               </div>
            </div>
          </section>

          {/* Tabla de Vista Previa SPS1062 Reactiva en Vivo */}
          <section id="audit-table" className="glass-card p-3 rounded-2xl border border-white/60 shadow-md animate-fade-in-up mb-0 font-data flex flex-col flex-1 min-h-0">
             <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2 gap-2 flex-wrap shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-bold text-slate-700 tracking-wide">
                    Vista previa SPS1062 ({previewMensualData.data.length} registros)
                  </h3>
                  {loadingMensual ? (
                    <span className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60 flex items-center gap-1 animate-pulse">
                      <RefreshCw size={12} className="animate-spin text-amber-600" />
                      <span>Consultando mensualidad...</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500 font-medium bg-slate-100/80 px-2 py-0.5 rounded-full border border-slate-200/60 flex items-center gap-1">
                      <span className="text-sky-600 font-bold text-[10px]">ℹ️</span>
                      <span className="text-[10px]">Reflejo exacto del informe oficial SPS1062</span>
                    </span>
                  )}
                </div>

                <button 
                  onClick={descargarMensualOficial} 
                  disabled={loading || loadingMensual || previewMensualData.data.length === 0} 
                  className="hidden md:flex py-1.5 px-3.5 bg-[#0284c7] hover:bg-sky-700 disabled:opacity-50 text-white font-semibold text-xs items-center justify-center gap-2 rounded-xl transition-all shadow-xs active:scale-95"
                >
                  <Download size={14} /> {loading ? 'PROCESANDO...' : 'Descargar SPS1062'}
                </button>
             </div>

             {/* VISTA MÓVIL: Tarjeta Ejecutiva de Descarga SPS1062 (< md) */}
             <div className="block md:hidden bg-white p-5 rounded-2xl border border-slate-100 shadow-sm text-center space-y-3 font-data my-2">
               <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto border border-sky-100">
                 <FileSpreadsheet size={24} />
               </div>
               <div>
                 <h3 className="font-bold text-base text-slate-800">Descarga de Reporte Oficial SPS1062</h3>
                 <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                   La vista previa celda por celda de 90+ columnas está optimizada para pantallas de escritorio. Puedes descargar la plantilla oficial en Excel directamente desde este botón.
                 </p>
               </div>
               <button
                 onClick={descargarMensualOficial}
                 disabled={loading || loadingMensual || previewMensualData.data.length === 0}
                 className="w-full py-3 bg-[#0284c7] hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-2"
               >
                 <Download size={16} />
                 <span>{loading ? 'PROCESANDO...' : 'DESCARGAR SPS1062 EN EXCEL'}</span>
               </button>
             </div>

             {/* VISTA ESCRITORIO: Tabla Completa SPS1062 (>= md) */}
             <div className="hidden md:block overflow-x-auto border border-slate-100 rounded-xl flex-1 min-h-0 overflow-y-auto">
               <table className="w-full text-left border-collapse min-w-[1000px]">
                 <thead className="sticky top-0 z-20 shadow-xs">
                   <tr className="bg-slate-800 text-white text-[11px] font-bold tracking-wider border-b border-slate-700">
                     <th className="p-2.5 border-r border-slate-700 text-left w-48 max-w-[200px]">Insumo / Descripción</th>
                     <th className="p-2 text-center border-r border-slate-700 w-20">Stock Hoy</th>
                     <th className="p-2.5 text-center border-r border-slate-700 bg-blue-950/60 text-blue-200 w-24 font-bold">Saldo Inicial</th>
                     <th className="p-2 text-center border-r border-slate-700 w-20 text-emerald-400">Ingresos</th>
                     <th className="p-2 text-center border-r border-slate-700 w-20 text-rose-400">Consumo</th>
                     <th className="p-2.5 text-center border-r border-slate-700 bg-slate-900 w-24 font-bold">Saldo Final</th>
                     <th className="p-2 text-center border-r border-slate-700 w-24">P. Unitario (Q.)</th>
                     <th className="p-2.5 text-center bg-emerald-900/60 text-emerald-300 w-28 font-bold">Monto Total (Q.)</th>
                   </tr>
                 </thead>

                 <tbody className="divide-y divide-slate-100 text-xs font-data">
                   {previewMensualData.data.map((item, idx) => {
                     const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';
                     const saldoFinalVal = item.stockFinal ?? item.saldoFinal ?? 0;
                     const consumoVal = Number(item.outPeriodo || item.consumo || 0);
                     const pUnitVal = Number(item.precioUnitario || item.insumo?.precio_unitario || 0);
                     const montoTotalVal = consumoVal * pUnitVal;
                     return (
                       <tr key={idx} className={`hover:bg-blue-50/20 transition-colors ${rowBg}`}>
                         <td className={`p-2 border-r border-slate-200 sticky left-0 z-10 w-48 max-w-[200px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] ${rowBg}`}>
                           <div className="font-semibold text-slate-800 tracking-tight text-[11px] leading-snug truncate" title={item.nombre}>
                             {formatNombreInsumo(item.nombre)}
                           </div>
                           <div className="text-[10px] text-slate-400 font-mono italic mt-0.5">
                             Cod: {item.codigo}
                           </div>
                         </td>

                         <td className="p-2 text-center font-mono text-slate-500 border-r border-slate-100 text-xs">{item.stockDB}</td>
                         <td className={`p-2 text-center font-bold font-mono border-r border-slate-200 text-xs ${item.saldoInicial < 0 ? 'text-rose-600 bg-rose-50' : 'text-blue-700'}`}>
                           {item.saldoInicial}
                         </td>
                         <td className="p-2 text-center font-mono border-r border-slate-100 text-emerald-600 font-semibold text-xs">+{item.inPeriodo || item.ingresos}</td>
                         <td className="p-2 text-center font-mono border-r border-slate-100 text-rose-600 font-semibold text-xs">-{consumoVal}</td>
                         <td className={`p-2 text-center font-bold font-mono border-r border-slate-100 text-xs ${saldoFinalVal < 0 ? 'text-rose-600 bg-rose-50' : 'text-slate-900'}`}>
                           {saldoFinalVal}
                         </td>
                         <td className={`p-2 text-center font-mono border-r border-slate-100 text-xs ${pUnitVal > 0 ? 'text-slate-600' : 'text-slate-400 font-normal'}`}>
                           {pUnitVal > 0 ? `Q. ${pUnitVal.toFixed(2)}` : 'Q. --'}
                         </td>
                         <td className={`p-2 text-center font-mono border-r border-slate-100 text-xs ${pUnitVal > 0 ? 'font-bold text-emerald-700 bg-emerald-50/40' : 'text-slate-400 font-normal bg-slate-50/30'}`}>
                           {pUnitVal > 0 ? `Q. ${montoTotalVal.toFixed(2)}` : 'Q. --'}
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>

             {previewMensualData.data.length === 0 && !loadingMensual && (
               <div className="p-12 text-center flex flex-col items-center gap-2">
                 <Search size={36} className="text-slate-300" />
                 <div className="text-slate-400 font-medium text-xs">No se encontraron datos que coincidan con los filtros seleccionados.</div>
               </div>
             )}
          </section>
        </div>
      )}

    </div>
  );
};

export default Reportes;
