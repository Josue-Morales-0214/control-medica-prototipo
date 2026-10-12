import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useArea } from '../contexts/AreaContext';
import { useData } from '../contexts/DataContext';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, doc, runTransaction, serverTimestamp, increment } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  Search, 
  Stethoscope,
  Sun,
  Sunset,
  Moon,
  RotateCcw,
  X,
  PackagePlus,
  Sparkles,
  Lock,
  Star,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const Movimientos = () => {
  const { userData, currentUser, isAdmin, isSupervisor, isEnfermero } = useAuth();
  const { area } = useArea();
  const { insumos, logAudit, getLotesByInsumo, addReportCacheItem } = useData();
  const location = useLocation();

  const [tipo, setTipo] = useState(isEnfermero ? 'SALIDA' : 'SALIDA'); // 'SALIDA' | 'ENTRADA'
  
  // Seguridad: Forzar salida si es enfermero
  useEffect(() => {
    if (isEnfermero && tipo === 'ENTRADA') {
      setTipo('SALIDA');
    }
  }, [isEnfermero, tipo]);
  
  // Lotes filtrados localmente para el insumo seleccionado
  const [lotesDisponibles, setLotesDisponibles] = useState([]);

  /**
   * Auto-detecta la fecha operativa y el turno según la hora del reloj local:
   * - 07:00 a 14:59 -> Turno M (Mañana), Fecha: Hoy
   * - 15:00 a 22:59 -> Turno T (Tarde), Fecha: Hoy
   * - 23:00 a 23:59 -> Turno N (Noche), Fecha: Hoy
   * - 00:00 a 06:59 -> Turno N (Noche), Fecha: AYER (Continuación de turno de noche)
   */
  const getAutoTurnoAndFecha = () => {
    const now = new Date();
    const hours = now.getHours();

    let turno = 'M';
    let dateObj = new Date(now);

    if (hours >= 7 && hours < 15) {
      turno = 'M';
    } else if (hours >= 15 && hours < 23) {
      turno = 'T';
    } else if (hours === 23) {
      turno = 'N';
    } else {
      // 00:00 a 06:59: Madrugada del turno de noche -> La fecha operativa es AYER
      turno = 'N';
      dateObj.setDate(dateObj.getDate() - 1);
    }

    const offset = dateObj.getTimezoneOffset() * 60000;
    const fechaStr = (new Date(dateObj.getTime() - offset)).toISOString().slice(0, 10);

    return { turno, fecha: fechaStr };
  };

  // Form State
  const [form, setForm] = useState(() => {
    const auto = getAutoTurnoAndFecha();
    return {
      codigo_insumo: '',
      nombre_insumo: '',
      lote: '',
      fecha: auto.fecha,
      fecha_vencimiento: '',
      cantidad: '',
      turno: auto.turno,
      observacion: ''
    };
  });
  
  // Unified Smart Search State
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(false);
  const [showObs, setShowObs] = useState(false);
  const [showLotesExpand, setShowLotesExpand] = useState(false);

  // Lógica de fechas permitidas:
  // - Días 1 y 2 del mes: Se permite retroceder hasta 2 días (cruce con mes anterior)
  // - Día 3 en adelante: El límite es el día 1 del mes en curso (dentro del mismo mes)
  const getLocalDateStr = (date) => {
    const offset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 10);
    return localISOTime;
  };

  const today = new Date();
  const currentDayOfMonth = today.getDate();

  let minDateObj;
  if (currentDayOfMonth <= 2) {
    // Cruce de mes: permitir hasta 2 días de atraso hacia el mes anterior
    minDateObj = new Date(today);
    minDateObj.setDate(minDateObj.getDate() - 2);
  } else {
    // Dentro del mes actual: no se puede tocar el mes anterior. Límite es el 1 del mes actual.
    minDateObj = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  const maxDate = getLocalDateStr(today);
  const minDate = getLocalDateStr(minDateObj);
  
  // Únicamente insumos activos para la selección y búsquedas en Movimientos (Opción A)
  const activeInsumos = useMemo(() => {
    return (insumos || []).filter(i => i.activo !== false);
  }, [insumos]);

  // ⚡️ Lógica de Pre-llenado desde Inventario (MODIFICADA)
  useEffect(() => {
    if (location.state?.preSelectInsumo) {
      const { codigo, nombre } = location.state.preSelectInsumo;
      const targetInsumo = (insumos || []).find(i => String(i.codigo) === String(codigo));
      
      if (targetInsumo && targetInsumo.activo === false) {
        Swal.fire('Insumo Desactivado', `El insumo [${codigo}] ${nombre} se encuentra desactivado en el catálogo. Habilítelo para poder registrar movimientos.`, 'warning');
        window.history.replaceState({}, document.title);
        return;
      }
      
      // Forzamos estados de UI
      setTipo('ENTRADA');
      setIsInitialLoad(true);
      
      // Búsqueda inteligente unificada
      setSearchQuery(`[${codigo}] ${nombre}`);
      
      // Llenamos el formulario directamente
      setForm(prev => ({
        ...prev,
        codigo_insumo: codigo,
        nombre_insumo: nombre,
        lote: '',
        fecha_vencimiento: ''
      }));

      // Limpiamos el estado de navegación para evitar bucles si el usuario recarga
      window.history.replaceState({}, document.title);
    }
  }, [location.state, insumos]);

  // Manejador de Búsqueda Inteligente Unificada (Nombre o Código)
  useEffect(() => {
    if (!searchQuery || searchQuery.trim() === '') {
       setForm(prev => ({
         ...prev,
         codigo_insumo: '',
         nombre_insumo: '',
         lote: '',
         fecha_vencimiento: ''
       }));
       setLotesDisponibles([]);
       return;
    }

    const rawQuery = searchQuery.trim().toLowerCase();
    const queryStr = rawQuery.replace(/\s*\((desactivado|inactivo)\)/i, '').trim();
    
    // Buscar coincidencia en insumos (incluyendo desactivados para mostrar advertencia)
    const match = (insumos || []).find(i => {
      const formatted = `[${i.codigo}] ${i.nombre}`.toLowerCase();
      const codeStr = String(i.codigo).toLowerCase();
      const nameStr = (i.nombre || '').toLowerCase();
      
      return formatted === queryStr || codeStr === queryStr || nameStr === queryStr || queryStr.includes(formatted) || queryStr.includes(codeStr);
    });

    if (match && match.codigo !== form.codigo_insumo) {
       handleInsumoChange(match.codigo, match.nombre);
    }
  }, [searchQuery, insumos]);

  const handleResetForm = () => {
    const auto = getAutoTurnoAndFecha();
    setSearchQuery('');
    setForm(prev => ({
      ...prev,
      codigo_insumo: '',
      nombre_insumo: '',
      lote: '',
      fecha: auto.fecha,
      fecha_vencimiento: '',
      cantidad: '',
      turno: auto.turno,
      observacion: ''
    }));
    setLotesDisponibles([]);
  };

  const selectedInsumo = insumos.find(i => String(i.codigo) === String(form.codigo_insumo));
  const currentStock = Number(selectedInsumo?.stock_actual || 0);
  const hasHistory = currentStock > 0 || (lotesDisponibles && lotesDisponibles.length > 0);

  const showInsumoActivoModal = (codigo, nombre, stockVal) => {
    Swal.fire({
      title: 'Insumo con Historial Registrado',
      html: `
        <div class="text-left text-xs space-y-2.5 text-slate-700">
          <p>El insumo <strong>[${codigo}] ${nombre}</strong> ya cuenta con historial de lotes y movimientos registrados en esta área (${stockVal} u. en stock actual).</p>
          <div class="bg-sky-50 p-3 rounded-xl border border-sky-200 text-sky-900 font-medium leading-relaxed">
            💡 <strong>Información:</strong> Para recargas e ingresos de insumos existentes en el catálogo del área, el sistema conmuta automáticamente al modo <strong>Reabastecimiento / Pedido</strong>.
          </div>
        </div>
      `,
      icon: 'info',
      confirmButtonText: 'De acuerdo',
      confirmButtonColor: '#0284c7',
      allowOutsideClick: true,
      allowEscapeKey: true
    });
  };

  const handleInsumoChange = async (codigo, nombre) => {
    setForm(prev => ({ ...prev, codigo_insumo: codigo, nombre_insumo: nombre || '', lote: '', fecha_vencimiento: '' }));
    
    if (codigo) {
       // ECONOMÍA DE LECTURAS: Solo pedimos los lotes de ESTE insumo
       const data = await getLotesByInsumo(codigo);
       
       let filteredLotes = [];
       if (tipo === 'SALIDA') {
          filteredLotes = data.filter(l => (l.cantidad || 0) > 0);
       } else {
          filteredLotes = [...data];
       }

       // 🥇 ORDENAMIENTO: Primero lotes con existencia (>0), luego por fecha de vencimiento (FEFO)
       filteredLotes.sort((a, b) => {
          const stockA = (a.cantidad || 0) > 0 ? 0 : 1;
          const stockB = (b.cantidad || 0) > 0 ? 0 : 1;
          if (stockA !== stockB) return stockA - stockB;

          const dateA = a.fecha_vencimiento || '9999-12-31';
          const dateB = b.fecha_vencimiento || '9999-12-31';
          return dateA.localeCompare(dateB);
       });

       setLotesDisponibles(filteredLotes);

       // Auto-seleccionar por defecto el lote más próximo a vencer (Sugerencia FEFO)
       if (tipo === 'SALIDA' && filteredLotes.length > 0) {
          const fefoLote = filteredLotes[0];
          setForm(prev => ({
             ...prev,
             lote: fefoLote.lote,
             fecha_vencimiento: fefoLote.fecha_vencimiento || ''
          }));
       }
    }
  };

  const handleLoteSelect = (loteValue) => {
    const selected = lotesDisponibles.find(l => l.lote === loteValue);
    setForm(prev => ({
      ...prev,
      lote: loteValue,
      fecha_vencimiento: selected?.fecha_vencimiento || ''
    }));
  };

  const currentLoteObj = lotesDisponibles.find(l => String(l.lote) === String(form.lote));
  const stockLote = Number(currentLoteObj?.cantidad || 0);
  const stockBase = lotesDisponibles.length > 0 
    ? lotesDisponibles.reduce((acc, l) => acc + (Number(l.cantidad) || 0), 0) 
    : currentStock;
  const cantidadNum = Number(form.cantidad || 0);
  const isSalida = tipo === 'SALIDA';
  const isExceededLote = isSalida && form.lote && cantidadNum > stockLote;
  const isFirstFefoLote = isSalida && lotesDisponibles.length > 0 && String(lotesDisponibles[0]?.lote) === String(form.lote);

  const formatFechaLocal = (fechaStr) => {
    if (!fechaStr) return '—';
    const parts = fechaStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return fechaStr;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.codigo_insumo || !form.lote || !form.cantidad) {
      Swal.fire('Atención', 'Por favor complete todos los campos obligatorios.', 'warning');
      return;
    }

    // Validación de Insumo Activo (Opción A: Bloqueo Total de Movimientos para Insumos Desactivados)
    if (selectedInsumo && selectedInsumo.activo === false) {
      Swal.fire({
        title: 'Insumo Desactivado',
        text: 'Este insumo se encuentra desactivado en el catálogo. Habilítelo desde el módulo de Inventario para poder registrar movimientos.',
        icon: 'warning',
        confirmButtonColor: '#0284c7'
      });
      return;
    }

    // Validación de Stock Excedido en el Lote Seleccionado
    if (isSalida && cantidadNum > stockLote) {
      Swal.fire({
        title: 'Stock del Lote Excedido',
        html: `
          <div class="text-left text-xs space-y-2">
            <p>La cantidad ingresada (<strong>${cantidadNum} u.</strong>) supera el stock disponible en el <strong>Lote ${form.lote}</strong> (<strong>${stockLote} u.</strong> disponibles).</p>
            <div class="bg-rose-50 p-2.5 rounded-xl border border-rose-200 text-rose-800 font-medium">
              💡 Por favor reduzca la cantidad a despachar a un máximo de <strong>${stockLote} u.</strong> o seleccione otro lote disponible.
            </div>
          </div>
        `,
        icon: 'error',
        confirmButtonText: 'Corregir Cantidad',
        confirmButtonColor: '#e11d48'
      });
      return;
    }

    // Guardia de Seguridad al presionar "Registrar Ingreso": Prevenir Carga Inicial si tiene historial/lotes o stock previo
    if (tipo !== 'SALIDA' && isInitialLoad && hasHistory) {
      setIsInitialLoad(false);
      showInsumoActivoModal(form.codigo_insumo, form.nombre_insumo || selectedInsumo?.nombre || '', currentStock);
      return;
    }

    // Validación de fecha y justificación para egresos (SALIDA)
    if (tipo === 'SALIDA') {
      const selectedDate = form.fecha;
      const yesterdayObj = new Date();
      yesterdayObj.setDate(yesterdayObj.getDate() - 1);
      const yesterdayDateStr = getLocalDateStr(yesterdayObj);

      // Si la fecha es anterior a ayer (ej. hace 2 días o más)
      if (selectedDate < yesterdayDateStr) {
        if (!form.observacion || form.observacion.trim().length < 10) {
          Swal.fire({
            title: 'Justificación Obligatoria',
            text: 'Para registrar egresos de días anteriores a ayer, es obligatorio ingresar una nota explicativa de al menos 10 caracteres en la sección "Añadir Notas / Obs."',
            icon: 'warning',
            confirmButtonText: 'Entendido'
          });
          setShowObs(true); // Abrir la sección de observaciones de forma interactiva
          return;
        }
      }
    }

    setLoading(true);
    let createdMovPayload = null;

    try {
      await runTransaction(db, async (transaction) => {
        const amount = parseInt(form.cantidad);
        if (amount <= 0) throw new Error("La cantidad debe ser mayor a 0");

        const insumoRef = doc(db, 'insumos', `${area}_${form.codigo_insumo}`);
        const insumoDoc = await transaction.get(insumoRef);
        
        if (!insumoDoc.exists()) throw new Error("El Insumo seleccionado no existe.");
        
        // Identificador unico del lote por Area, Insumo y NombreLote (Para unificar existencias del mismo lote)
        const loteIdSeguro = form.lote.replace(/[^a-zA-Z0-9_-]/g, '_');
        const loteRef = doc(db, 'lotes', `${area}_${form.codigo_insumo}_${loteIdSeguro}`);
        const loteDoc = await transaction.get(loteRef);

        const currentInsumoStock = insumoDoc.data().stock_actual || 0;
        
        let initialLoteStock = 0;
        if (loteDoc.exists()) {
           initialLoteStock = loteDoc.data().cantidad || 0;
        } else if (tipo === 'SALIDA') {
           throw new Error("El lote seleccionado no existe o está agotado.");
        }

        if (tipo === 'SALIDA' && initialLoteStock < amount) {
           throw new Error(`Stock insuficiente en el lote ${form.lote}. Disponible: ${initialLoteStock}`);
        }

        const newLoteStock = tipo === 'ENTRADA' ? (initialLoteStock + amount) : (initialLoteStock - amount);
        const newInsumoStock = tipo === 'ENTRADA' ? (currentInsumoStock + amount) : (currentInsumoStock - amount);

        // Update Insumo
        transaction.update(insumoRef, { stock_actual: newInsumoStock });

        // Update/Set Lote
        const loteData = {
           codigo_insumo: String(form.codigo_insumo),
           lote: form.lote,
           cantidad: newLoteStock,
           area: area,
           fecha_vencimiento: form.fecha_vencimiento || ''
        };
        transaction.set(loteRef, loteData, { merge: true });

        // Save movement (Congelación del precio unitario histórico para RF-32 / RN-16)
        const currentUnitPrice = Number(insumoDoc.data().precio_unitario || 0);
        const movRef = doc(collection(db, 'movimientos'));
        const finalType = isSalida ? 'Salida' : (isInitialLoad ? 'CARGA_INICIAL' : 'Entrada');

        transaction.set(movRef, {
           tipo: finalType,
           codigo_insumo: String(form.codigo_insumo),
           nombre_insumo: form.nombre_insumo || insumoDoc.data().nombre,
           lote: form.lote,
           cantidad: amount,
           precio_unitario: currentUnitPrice,
           fecha: form.fecha, // Fecha documento 
           fecha_vencimiento: form.fecha_vencimiento || '',
           turno: tipo === 'SALIDA' ? form.turno : null,
           observacion: form.observacion || '',
           area: area,
           fecha_registro: serverTimestamp(), // Timestamp de base de datos real
           registrado_por: userData?.nombre || currentUser.email,
           usuario_id: currentUser.email.toLowerCase()
        });

        createdMovPayload = {
           id: movRef.id,
           tipo: finalType,
           codigo_insumo: String(form.codigo_insumo),
           nombre_insumo: form.nombre_insumo || insumoDoc.data().nombre,
           lote: form.lote,
           cantidad: amount,
           precio_unitario: currentUnitPrice,
           fecha: form.fecha,
           fecha_vencimiento: form.fecha_vencimiento || '',
           turno: tipo === 'SALIDA' ? form.turno : null,
           observacion: form.observacion || '',
           area: area,
           registrado_por: userData?.nombre || currentUser.email,
           usuario_id: currentUser.email.toLowerCase()
        };

        // 5. ACTUALIZAR METADATOS (CONTADOR INTELIGENTE)
        const metaRef = doc(db, 'metadata', `${area}_meta`);
        transaction.set(metaRef, { 
          totalMovimientos: increment(1),
          ultima_actualizacion: serverTimestamp() 
        }, { merge: true });

        // 📜 AUDITORÍA: Si es Carga Inicial, registramos evento especial
        if (isInitialLoad) {
           logAudit({
              modulo: 'Movimientos',
              accion: 'CARGA_INICIAL',
              detalles: `Inicializado lote ${form.lote} de ${form.nombre_insumo} con ${amount} unidades.`,
              codigo_insumo: form.codigo_insumo,
              lote: form.lote
           });
        }

        // 📜 AUDITORÍA: Registro extemporáneo (atraso)
        if (tipo === 'SALIDA') {
           const selectedDate = form.fecha;
           const yesterdayObj = new Date();
           yesterdayObj.setDate(yesterdayObj.getDate() - 1);
           const yesterdayDateStr = getLocalDateStr(yesterdayObj);

           if (selectedDate < yesterdayDateStr) {
              logAudit({
                 modulo: 'Movimientos',
                 accion: 'EGRESO_ATRASADO',
                 descripcion: `Egreso extemporáneo (${selectedDate}) para: ${form.nombre_insumo} (${amount} u, Lote: ${form.lote}). Justificación: ${form.observacion}`,
                 registroId: movRef.id
              });
           }
        }
      });

      if (createdMovPayload) {
        addReportCacheItem(createdMovPayload);
      }

      Swal.fire({
        title: '¡Éxito!',
        text: `Movimiento registrado correctamente.`,
        icon: 'success',
        timer: 1800,
        showConfirmButton: false
      });

      // Reset inteligente manteniendo turno y fecha
      handleResetForm();

    } catch (err) {
      console.error("Error al registrar movimiento:", err);
      Swal.fire('Error', err.message || 'No se pudo guardar el registro', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Cálculos defensivos para evitar NaN en el renderizado
  const currentInsumo = insumos.find(i => String(i.codigo) === String(form.codigo_insumo));

  return (
    <>
      {/* Header con Controles Integrados */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1 mb-4 animate-fade-in-up">
        <div className="flex items-center gap-3.5">
           <div className="w-11 h-11 bg-white shadow-sm rounded-2xl flex items-center justify-center border border-slate-100/60 shrink-0">
             {isSalida ? <ArrowDownLeft className="text-rose-600" size={20} /> : <ArrowUpRight className="text-emerald-600" size={20} />}
           </div>
           <div>
             <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-tight">
               {isSalida ? 'Egreso de Inventario' : 'Ingreso de Inventario'}
             </h1>
             <p className="text-slate-400 text-[11px] font-medium mt-0.5 flex items-center gap-1.5">
               <span>Registro y Dispensación</span>
               <span className={`w-1.5 h-1.5 rounded-full ${isSalida ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`}></span>
               <span className={`${isSalida ? 'text-rose-600' : 'text-emerald-600'} font-semibold text-[10px]`}>
                 {isSalida ? 'Modo Salida' : 'Modo Entrada'}
               </span>
             </p>
           </div>
        </div>

        {/* Segmented Switch Control en Header (Estilo Píldora Redondeada) */}
        <div className="bg-slate-100/90 p-1.5 rounded-full border border-slate-200/80 shadow-inner flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
          <button 
            className={`flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 rounded-full font-bold text-xs sm:text-sm transition-all duration-300 ${
              isSalida 
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/25' 
                : 'text-slate-600 hover:text-slate-900 font-semibold hover:bg-slate-200/50'
            }`}
            onClick={() => { 
              setTipo('SALIDA'); 
              handleResetForm();
            }}
          >
            <ArrowDownLeft size={16} />
            <span>Egreso (Salida)</span>
          </button>
          {!isEnfermero && (
            <button 
              className={`flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 rounded-full font-bold text-xs sm:text-sm transition-all duration-300 ${
                !isSalida 
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25' 
                  : 'text-slate-600 hover:text-slate-900 font-semibold hover:bg-slate-200/50'
              }`}
              onClick={() => {
                setTipo('ENTRADA');
                handleResetForm();
              }}
            >
              <ArrowUpRight size={16} />
              <span>Ingreso (Entrada)</span>
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
        
        {/* Columna Izquierda: Formulario */}
        <div className="lg:col-span-2 space-y-6">
          <section className="glass-card p-5 md:p-6 rounded-2xl border border-white/60 shadow-xs backdrop-blur-md relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-1.5 h-full ${isSalida ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
            
            <form 
              onSubmit={handleSubmit} 
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                  e.preventDefault();
                }
              }}
              className="space-y-5"
            >
              
              {!isSalida && (
                <div className="bg-slate-50/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-inner">
                   <label className="text-xs font-semibold text-slate-500 block mb-2.5 ml-1">Propósito del ingreso</label>
                   <div className="flex flex-col sm:flex-row gap-3">
                       <button 
                         type="button"
                         onClick={() => setIsInitialLoad(false)}
                         className={`flex-1 flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${!isInitialLoad ? 'border-emerald-500 bg-emerald-50/90 text-emerald-900 font-bold shadow-xs' : 'border-slate-200/80 bg-slate-100/70 text-slate-500 hover:bg-slate-200/50 hover:text-slate-700'}`}
                       >
                          <div className="flex items-center gap-2">
                             <PackagePlus size={16} className={!isInitialLoad ? 'text-emerald-600' : 'text-slate-400'} />
                             <span className="text-xs font-semibold">Reabastecimiento / Pedido</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-normal mt-0.5">Recargas periódicas de farmacia / bodega</span>
                       </button>
                       <button 
                         type="button"
                         onClick={() => setIsInitialLoad(true)}
                         className={`flex-1 flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                           isInitialLoad 
                             ? 'border-purple-500 bg-purple-50/90 text-purple-900 font-bold shadow-xs' 
                             : 'border-slate-200/80 bg-slate-100/70 text-slate-500 hover:bg-slate-200/50 hover:text-slate-700'
                         }`}
                       >
                          <div className="flex items-center gap-2">
                             <Sparkles size={16} className={isInitialLoad ? 'text-purple-600' : 'text-slate-400'} />
                             <span className="text-xs font-semibold">Inventario Inicial (Arranque)</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                            Alta de insumo nuevo o apertura de servicio
                          </span>
                       </button>
                    </div>
                </div>
              )}

              {/* Búsqueda Inteligente Unificada (Estilo Píldora de Filtros) */}
              <div className="bg-slate-50/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-inner">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 ml-1">Búsqueda inteligente de insumo</label>
                  {searchQuery && (
                    <button 
                      type="button" 
                      onClick={handleResetForm}
                      className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 font-medium transition-colors"
                      title="Limpiar búsqueda y campos"
                    >
                      <RotateCcw size={13} />
                      <span>Limpiar</span>
                    </button>
                  )}
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary-600 transition-colors">
                    <Search size={16} />
                  </div>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Escribe el nombre o código del insumo..." 
                    list="listaInsumosInteligente" 
                    className={`w-full pl-11 pr-10 py-3 rounded-full border border-slate-200/90 bg-slate-100/80 outline-none transition-all font-semibold text-slate-800 placeholder:text-slate-400 text-sm shadow-inner focus:bg-white focus:shadow-xs ${isSalida ? 'focus:border-rose-500/60 focus:ring-4 focus:ring-rose-500/10' : 'focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10'}`}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={handleResetForm}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  )}
                  <datalist id="listaInsumosInteligente">
                    {(insumos || []).map((i, idx) => (
                      <option key={`insumo-${i.codigo}-${idx}`} value={`[${i.codigo}] ${i.nombre}${i.activo === false ? ' (DESACTIVADO)' : ''}`} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Fila Dinámica: Lote, Cantidad y Vencimiento */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">{isSalida ? 'Lote disponible *' : 'Nuevo lote *'}</label>
                    {isSalida ? (
                      <select 
                        required 
                        value={form.lote}
                        onChange={(e) => handleLoteSelect(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-full border border-slate-200/90 bg-slate-100/80 focus:bg-white focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500/60 outline-none font-semibold text-slate-800 text-sm shadow-inner focus:shadow-xs transition-all"
                      >
                        <option value="">— Seleccionar Lote —</option>
                        {lotesDisponibles.map((l) => (
                          <option key={l.id || `lote-${l.lote}`} value={l.lote}>
                            Lote {l.lote} ({l.cantidad} disp.)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        type="text" 
                        placeholder="Ej: BN-99827"
                        value={form.lote}
                        onChange={(e) => setForm({...form, lote: e.target.value.toUpperCase()})}
                        className="w-full px-4 py-2.5 rounded-full border border-slate-200/90 bg-slate-100/80 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/60 outline-none font-semibold text-slate-800 text-sm shadow-inner focus:shadow-xs uppercase transition-all"
                      />
                    )}
                 </div>

                 <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">Cantidad *</label>
                    <input 
                      type="number" 
                      min="1"
                      placeholder="0"
                      required
                      value={form.cantidad}
                      onChange={e => setForm({...form, cantidad: e.target.value})}
                      className={`w-full px-4 py-2 rounded-full border border-slate-200/90 bg-slate-100/80 focus:bg-white outline-none font-bold text-lg placeholder:text-slate-400 shadow-inner focus:shadow-xs transition-all ${
                        isExceededLote 
                          ? 'text-rose-600 border-rose-500/80 bg-rose-50/50 focus:ring-4 focus:ring-rose-500/20' 
                          : (isSalida ? 'text-rose-600 focus:border-rose-500/60 focus:ring-4 focus:ring-rose-500/10' : 'text-emerald-600 focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10')
                      }`}
                    />
                 </div>

                 <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">Vencimiento *</label>
                    <input 
                      type="date" 
                      required={!isSalida}
                      readOnly={isSalida}
                      value={form.fecha_vencimiento}
                      onChange={e => setForm({...form, fecha_vencimiento: e.target.value})}
                      className={`w-full px-4 py-2.5 rounded-full border border-slate-200/90 outline-none font-semibold text-sm shadow-inner transition-all ${isSalida ? 'bg-slate-100/70 text-slate-400 cursor-not-allowed border-slate-200/60' : 'bg-slate-100/80 focus:bg-white text-slate-700 focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10'}`}
                    />
                 </div>
              </div>

              {/* Sección de Observaciones y Datos de Control (Unificada) */}
              {isSalida ? (
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-slate-50/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-inner">
                    <div>
                         <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">Turno *</label>
                         <div className="flex bg-slate-100/90 p-1 rounded-full border border-slate-200/80 shadow-inner gap-1">
                           {[
                             { id: 'M', label: 'Mañana', icon: Sun, activeColor: 'bg-amber-500 text-white shadow-xs' },
                             { id: 'T', label: 'Tarde', icon: Sunset, activeColor: 'bg-sky-600 text-white shadow-xs' },
                             { id: 'N', label: 'Noche', icon: Moon, activeColor: 'bg-indigo-700 text-white shadow-xs' }
                           ].map(t => {
                             const Icon = t.icon;
                             const isSelected = form.turno === t.id;
                             return (
                               <button
                                 key={t.id}
                                 type="button"
                                 onClick={() => setForm({...form, turno: t.id})}
                                 className={`flex-1 py-1.5 px-2 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                                   isSelected 
                                     ? t.activeColor 
                                     : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                                 }`}
                               >
                                 <Icon size={13} className={isSelected ? 'text-white' : 'text-slate-400'} />
                                 <span className="text-[11px]">{t.label}</span>
                               </button>
                             );
                           })}
                         </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1.5 ml-1">Fecha de operación</label>
                        <input 
                           type="date" 
                           min={minDate}
                           max={maxDate}
                           value={form.fecha} 
                           onChange={e => setForm({...form, fecha: e.target.value})}
                           className="w-full px-4 py-2 rounded-full border border-rose-200/90 bg-slate-100/80 focus:bg-white font-bold text-rose-700 outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 text-sm transition-all shadow-inner focus:shadow-xs" 
                        />
                    </div>

                    <div className="flex justify-center">
                        <button 
                          type="button"
                          onClick={() => setShowObs(!showObs)}
                          className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${showObs ? 'text-rose-600' : 'text-slate-500 hover:text-rose-600'}`}
                        >
                           {showObs ? '− Ocultar notas' : '+ Notas / observaciones'}
                        </button>
                    </div>
                 </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                   <div className="flex items-center justify-center md:justify-start gap-3 py-2.5 px-4 bg-emerald-50/70 rounded-full border border-emerald-200/80 animate-fade-in shadow-xs">
                      <span className="text-xs font-semibold text-emerald-700">Operación segura:</span>
                      <span className="text-xs font-bold text-emerald-800 bg-white px-3 py-0.5 rounded-full shadow-xs border border-emerald-100 font-mono">
                         {new Date().toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                   </div>
                   <div className="flex justify-center md:justify-end">
                      <button 
                         type="button"
                         onClick={() => setShowObs(!showObs)}
                         className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${showObs ? 'text-emerald-600' : 'text-slate-500 hover:text-emerald-600'}`}
                        >
                           {showObs ? '− Ocultar notas' : '+ Añadir notas (Opcional)'}
                        </button>
                   </div>
                </div>
              )}

              {/* Área de Texto Expandible */}
              {showObs && (
                <div className="animate-fade-in">
                  <textarea 
                    placeholder={`Detalles adicionales del ${isSalida ? 'egreso' : 'ingreso'}...`}
                    value={form.observacion}
                    onChange={e => setForm({...form, observacion: e.target.value})}
                    className={`w-full px-4 py-3 rounded-2xl border border-slate-200/90 bg-slate-100/80 focus:bg-white outline-none focus:ring-4 min-h-[90px] shadow-inner transition-all text-sm ${isSalida ? 'focus:border-rose-500/60 focus:ring-rose-500/10' : 'focus:border-emerald-500/60 focus:ring-emerald-500/10'}`}
                  />
                </div>
              )}

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={loading || isExceededLote || (selectedInsumo && selectedInsumo.activo === false)}
                  className={`w-full py-3.5 rounded-xl font-bold text-sm shadow-md transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 ${
                    loading || isExceededLote || (selectedInsumo && selectedInsumo.activo === false)
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none' 
                      : (isSalida ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20')
                  }`}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : selectedInsumo && selectedInsumo.activo === false ? (
                    <span className="flex items-center gap-1.5 text-amber-700 font-bold">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                      Insumo Deshabilitado (Requiere activación en Inventario)
                    </span>
                  ) : isExceededLote ? (
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={16} className="text-rose-500 shrink-0" />
                      Cantidad Excede Stock del Lote ({stockLote} disp. max)
                    </span>
                  ) : (
                    <>
                      {isSalida ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                      <span>{isSalida ? 'Confirmar Egreso' : 'Registrar Ingreso'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* Columna Derecha: Panel de Inspección Visual en Tiempo Real */}
        <div className="hidden lg:block relative">
          <div className="sticky top-24">
            <div className={`rounded-2xl p-6 shadow-xl text-white min-h-[440px] flex flex-col relative overflow-hidden transition-all duration-500 bg-slate-900 border border-slate-800 backdrop-blur-md`}>
               <div className="absolute top-[-5%] right-[-5%] text-[10rem] opacity-[0.03] select-none pointer-events-none font-bold italic font-mono">
                 {isSalida ? 'OUT' : 'IN'}
               </div>
               
               {form.nombre_insumo ? (
                 <div className="flex flex-col flex-1 z-10 animate-fade-in-up">
                    {/* Encabezado Unificado: Identidad del Insumo */}
                    <div className="mb-3.5 bg-white/5 p-3.5 rounded-xl border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono bg-white/10 text-slate-300 px-2 py-0.5 rounded-md inline-block tracking-wide">Código: {form.codigo_insumo || '—'}</span>
                        <div className="flex items-center gap-1.5 text-xs text-slate-300">
                           <span className="text-slate-400 font-medium">Stock Actual:</span>
                           <span className="text-xl font-bold font-mono text-white">{stockBase} <span className="text-xs text-slate-400 font-normal">u.</span></span>
                         </div>
                      </div>
                      <h2 className="text-sm font-bold text-white leading-snug tracking-tight uppercase flex items-center justify-between gap-2">
                        <span>{form.nombre_insumo}</span>
                        {selectedInsumo && selectedInsumo.activo === false && (
                          <span className="text-[9px] font-extrabold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-400/30">DESACTIVADO</span>
                        )}
                      </h2>
                    </div>

                    {selectedInsumo && selectedInsumo.activo === false ? (
                      <div className="flex flex-col flex-1 items-center justify-center z-10 py-6 text-center space-y-4 animate-fade-in my-auto">
                        <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/30 text-amber-400 shadow-inner">
                          <AlertTriangle size={32} className="text-amber-400" />
                        </div>
                        <div className="space-y-2 max-w-xs">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 bg-amber-500/20 px-3 py-1 rounded-full border border-amber-500/30 inline-block">
                            Insumo Deshabilitado
                          </span>
                          <h3 className="text-sm font-bold text-white tracking-tight">Movimientos Bloqueados</h3>
                          <p className="text-xs text-slate-300 leading-relaxed font-medium bg-white/5 p-4 rounded-2xl border border-white/10 text-left">
                            El insumo <strong className="text-white font-bold">[{selectedInsumo.codigo}] {selectedInsumo.nombre}</strong> está desactivado. Para poder registrar entradas o salidas, un supervisor debe reactivarlo desde el módulo de <strong className="text-amber-300 font-bold">Inventario</strong>.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 flex-1">
                      {/* === MODO ENTRADA: HERO DE IMPACTO EN STOCK E INGRESO PRIMERO === */}
                      {!isSalida && (
                        <>
                          <div className="bg-gradient-to-br from-emerald-500/15 to-emerald-950/40 border border-emerald-500/30 p-3.5 rounded-xl shadow-lg space-y-3 animate-fade-in">
                            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                              <div className="flex items-center gap-1.5">
                                {isInitialLoad ? (
                                  <Sparkles size={14} className="text-purple-300 shrink-0 animate-pulse" />
                                ) : (
                                  <PackagePlus size={14} className="text-emerald-300 shrink-0" />
                                )}
                                <span className="text-xs font-extrabold text-emerald-300 tracking-wide">
                                  {isInitialLoad ? 'Proyección Carga Inicial' : 'Impacto de Reabastecimiento'}
                                </span>
                              </div>
                              <span className="text-xs font-mono font-black text-emerald-300 bg-emerald-500/20 px-2.5 py-0.5 rounded-lg border border-emerald-500/30 shadow-inner">
                                Ingreso: {cantidadNum > 0 ? `+${cantidadNum} u.` : '+0 u.'}
                              </span>
                            </div>

                            {/* Métrica Principal: Incremento de Stock Total */}
                            <div className="bg-slate-950/70 p-3 rounded-xl border border-emerald-500/25 flex justify-between items-center">
                              <div className="space-y-0.5">
                                <span className="text-[11px] text-slate-400 font-medium block">Stock Total en Área ({area}):</span>
                                <div className="text-lg font-black font-mono tracking-tight text-white flex items-center gap-2">
                                  <span className="text-slate-400 text-base">{stockBase} u.</span>
                                  <span className="text-emerald-400 font-sans text-sm">➔</span>
                                  <span className="text-emerald-300 text-xl font-black">{stockBase + cantidadNum} u.</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 block font-medium">Incremento</span>
                                <span className="text-base font-black font-mono text-emerald-400">+{cantidadNum} u.</span>
                              </div>
                            </div>

                            {/* Ficha de datos de la nueva carga */}
                            <div className="text-xs space-y-1.5 pt-1 border-t border-emerald-500/20">
                              <div className="flex justify-between items-center text-slate-300">
                                <span className="text-slate-400 font-medium">Lote a registrar:</span>
                                <span className="font-bold font-mono text-white">
                                  {form.lote ? form.lote : <span className="text-slate-500 italic font-normal">(Escriba un lote)</span>}
                                </span>
                              </div>
                              {form.lote && currentLoteObj && (
                                <div className="flex justify-between items-center text-slate-300">
                                  <span className="text-slate-400 font-medium">Lote Reabastecido ({form.lote}):</span>
                                  <span className="font-bold font-mono text-emerald-400">
                                    {stockLote} u. ➔ {stockLote + cantidadNum} u.
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-between items-center text-slate-300">
                                <span className="text-slate-400 font-medium">Vencimiento:</span>
                                <span className="font-bold font-mono text-white">
                                  {form.fecha_vencimiento ? formatFechaLocal(form.fecha_vencimiento) : <span className="text-slate-500 italic font-normal">(Escriba vencimiento)</span>}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Lotes Existentes en Estante (Consulta Secundaria Desplegable) */}
                          <div className="bg-white/5 border border-white/10 p-3 rounded-xl space-y-2 transition-all">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-300">
                                {lotesDisponibles.length} {lotesDisponibles.length === 1 ? 'Lote Existente en Estante' : 'Lotes Existentes en Estante'}
                              </span>
                              {lotesDisponibles.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setShowLotesExpand(!showLotesExpand)}
                                  className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/20 transition-all cursor-pointer"
                                >
                                  <span>{showLotesExpand ? 'Ocultar lotes' : 'Ver lotes'}</span>
                                  {showLotesExpand ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                              )}
                            </div>

                            {showLotesExpand && (
                              <div className="max-h-[140px] overflow-y-auto space-y-1.5 pr-1 pt-2 border-t border-white/10 custom-scrollbar animate-fade-in">
                                {lotesDisponibles.length > 0 ? (
                                  lotesDisponibles.map((l) => {
                                    const isSelectedLote = String(l.lote) === String(form.lote);
                                    const isZeroStock = (l.cantidad || 0) === 0;

                                    return (
                                      <div 
                                        key={l.id || `lote-item-${l.lote}`} 
                                        onClick={() => handleLoteSelect(l.lote)}
                                        className={`p-2 rounded-lg cursor-pointer transition-all flex items-center justify-between group border text-xs ${
                                          isSelectedLote 
                                            ? 'bg-emerald-500/20 border-emerald-500 ring-1 ring-emerald-500/40 text-white shadow-md'
                                            : isZeroStock 
                                              ? 'bg-white/[0.02] hover:bg-white/10 border-white/5 opacity-65 text-slate-400'
                                              : 'bg-white/5 hover:bg-white/10 border-white/5 text-slate-300'
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className={`font-mono font-bold ${isZeroStock ? 'text-slate-400' : 'text-white'}`}>{l.lote}</span>
                                          {isZeroStock && (
                                            <span className="text-[9px] font-bold bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded border border-slate-700">
                                              Agotado
                                            </span>
                                          )}
                                          <span className="text-[10px] text-slate-400">
                                            Vence: {formatFechaLocal(l.fecha_vencimiento)}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                          <span className="font-mono font-extrabold text-slate-200">{l.cantidad} u.</span>
                                          <span className={`text-[10px] font-medium ${isSelectedLote ? 'text-emerald-400 font-bold' : 'text-slate-400 group-hover:text-emerald-300'}`}>
                                            {isSelectedLote ? '✓' : '→'}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <p className="text-xs text-slate-400 italic py-1.5 text-center">
                                    Sin lotes previos registrados en esta área.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* === MODO SALIDA: SELECCIÓN DE LOTES FEFO PRIMERO + PROYECTADO DE SALIDA === */}
                      {isSalida && (
                        <>
                          <div className="bg-white/5 border border-white/10 p-3.5 rounded-xl space-y-2">
                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                              <span className="text-xs font-bold text-slate-200">
                                {lotesDisponibles.length} Lotes Disponibles
                              </span>
                            </div>

                            <div className="max-h-[180px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                              {lotesDisponibles.length > 0 ? (
                                lotesDisponibles.map((l, idx) => {
                                  const isSelectedLote = String(l.lote) === String(form.lote);
                                  const isFefoSuggested = idx === 0;

                                  return (
                                    <div 
                                      key={l.id || `lote-item-${l.lote}`} 
                                      onClick={() => handleLoteSelect(l.lote)}
                                      className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between group border ${
                                        isSelectedLote 
                                          ? 'bg-rose-500/20 border-rose-500 ring-1 ring-rose-500/40 text-white shadow-md'
                                          : 'bg-white/5 hover:bg-white/10 border-white/5 text-slate-300'
                                      }`}
                                    >
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-sm font-extrabold font-mono text-white tracking-wide">{l.lote}</span>
                                          {isFefoSuggested && (
                                            <span className="flex items-center gap-1 text-[9px] font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-400/30 shadow-sm">
                                              <Star size={10} className="text-amber-400 fill-amber-400 shrink-0" />
                                              Sugerido (FEFO)
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-[11px] text-slate-400">
                                          Vence: <span className="text-slate-200 font-semibold">{formatFechaLocal(l.fecha_vencimiento)}</span>
                                        </p>
                                      </div>

                                      <div className="text-right flex flex-col items-end">
                                        <span className={`text-base font-extrabold font-mono tracking-tight ${
                                          isSelectedLote ? 'text-rose-300' : 'text-slate-200 group-hover:text-emerald-300'
                                        }`}>
                                          {l.cantidad} <span className="text-xs text-slate-400 font-normal">u.</span>
                                        </span>
                                        <span className={`text-[10px] font-medium mt-0.5 ${
                                          isSelectedLote ? 'text-rose-400 font-bold' : 'text-slate-400 group-hover:text-slate-300'
                                        }`}>
                                          {isSelectedLote ? 'Seleccionado ✓' : 'Usar Lote →'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="text-xs text-slate-400 italic py-2 text-center">
                                  No hay lotes con existencia en esta área.
                                </p>
                              )}
                            </div>
                          </div>

                          {form.lote && (
                            <div className={`p-3.5 rounded-xl border transition-all animate-fade-in ${
                              isExceededLote ? 'bg-rose-950/80 border-rose-500/60 shadow-lg shadow-rose-950/50' : 'bg-rose-500/10 border-rose-500/20'
                            }`}>
                              {isExceededLote ? (
                                <div className="space-y-1.5">
                                  <p className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                                    <AlertTriangle size={14} className="text-rose-400 shrink-0" />
                                    <span>Cantidad Excede Stock del Lote {form.lote}</span>
                                  </p>
                                  <p className="text-[11px] text-rose-100 leading-snug">
                                    Intenta despachar <strong>{cantidadNum} u.</strong> (máximo disponible: <strong>{stockLote} u.</strong>)
                                  </p>
                                  <div className="pt-2 border-t border-rose-500/30 flex justify-between items-center text-xs">
                                    <span className="text-slate-300 font-medium">Resultado:</span>
                                    <span className="text-xs font-bold font-mono text-rose-200 bg-rose-600/60 px-2.5 py-0.5 rounded-lg border border-rose-400/40">
                                      Excedido (-{cantidadNum - stockLote} u.)
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between border-b border-rose-500/20 pb-1.5">
                                    <span className="text-xs font-bold text-rose-300">Proyección de Salida</span>
                                    <span className="text-xs text-slate-300 font-mono">
                                      Cant: <strong className="text-sm font-black text-white">{cantidadNum > 0 ? `${cantidadNum} u.` : '0 u.'}</strong>
                                    </span>
                                  </div>
                                  
                                  {cantidadNum > 0 ? (
                                    <div className="space-y-1.5 text-xs">
                                      <div className="flex justify-between items-center">
                                        <span className="text-slate-300 font-medium">Saldo en Lote {form.lote}:</span>
                                        <span className="text-base font-black font-mono text-emerald-400">
                                          {stockLote} ➔ {stockLote - cantidadNum}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center">
                                        <span className="text-slate-300 font-medium">Saldo Total del área:</span>
                                        <span className="text-base font-black font-mono text-emerald-300">
                                          {stockBase} ➔ {stockBase - cantidadNum}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-slate-400 italic">
                                      Ingrese una cantidad a despachar para ver la proyección en vivo.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                 )}
               </div>
             ) : (
                 <div className="flex flex-col items-center justify-center flex-1 z-10 py-10">
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 text-slate-400 mb-4 shadow-inner animate-pulse">
                      <Stethoscope size={28} className="text-slate-400 animate-bounce duration-1000" />
                    </div>
                    <p className="text-center font-medium text-xs px-6 leading-relaxed text-slate-400">Seleccione un insumo para auditar métricas</p>
                 </div>
               )}
             </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Movimientos;
