import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, getDoc, doc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useArea } from '../contexts/AreaContext';
import Pagination from '../components/Pagination';
import ConciliacionDetailModal from '../components/ConciliacionDetailModal';
import Swal from 'sweetalert2';
import {
  ShieldAlert,
  RefreshCw,
  Plus,
  Trash2,
  Settings,
  Lock,
  Upload,
  UserCheck,
  FileEdit,
  History,
  Eye,
  X,
  Boxes,
  Tag,
  User,
  Clock,
  Hash,
  MessageSquare,
  ClipboardCheck
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

const getActionConfig = (accion) => {
  const a = (accion || '').toUpperCase();
  if (a.includes('REVERSION') || a.includes('REVERSIÓN')) return { icon: History, bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100', badgeBg: 'bg-rose-50', badgeText: 'text-rose-700', badgeBorder: 'border-rose-200', label: 'REVERSIÓN' };
  if (a === 'CREACIÓN' || a === 'CREACION') return { icon: Plus, bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700', badgeBorder: 'border-emerald-200', label: 'CREACIÓN' };
  if (a === 'ELIMINACIÓN' || a === 'ELIMINACION' || a === 'BAJA') return { icon: Trash2, bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100', badgeBg: 'bg-rose-50', badgeText: 'text-rose-700', badgeBorder: 'border-rose-200', label: 'ELIMINACIÓN' };
  if (a === 'CARGA_INICIAL') return { icon: Upload, bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', badgeBg: 'bg-amber-50', badgeText: 'text-amber-700', badgeBorder: 'border-amber-200', label: 'CARGA INICIAL' };
  if (a.includes('CORRECCIÓN') || a.includes('CORRECCION') || a.includes('ATRASADO')) return { icon: History, bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100', badgeBg: 'bg-indigo-50', badgeText: 'text-indigo-700', badgeBorder: 'border-indigo-200', label: 'CORRECCIÓN' };
  if (a.includes('AJUSTE')) return { icon: Settings, bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100', badgeBg: 'bg-blue-50', badgeText: 'text-blue-700', badgeBorder: 'border-blue-200', label: 'AJUSTE STOCK' };
  return { icon: Settings, bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100', badgeBg: 'bg-primary-50', badgeText: 'text-primary-700', badgeBorder: 'border-primary-200', label: a };
};

const formatRol = (rol) => {
  if (!rol) return '';
  const r = rol.toLowerCase();
  if (r.includes('supervisor')) return 'Supervisor';
  if (r.includes('servicio') || r.includes('encargado')) return 'Enc. de servicio';
  if (r.includes('usuario')) return 'Usuario';
  return rol.charAt(0).toUpperCase() + rol.slice(1).toLowerCase();
};

const parseLogDescription = (raw, logMotivo) => {
  if (!raw) return { entity: '—', action: '', details: '', cantidad: '', lote: '', autorOriginal: '', motivo: logMotivo || '' };

  let str = raw.trim();
  let extractedMotivo = logMotivo || '';

  // Extraer Justificación/Motivo si viene al final
  const justifMatch = str.match(/\.?\s*(justificación|justificacion|motivo)\s*:\s*(.+)$/i);
  if (justifMatch) {
    if (!extractedMotivo) {
      extractedMotivo = justifMatch[2].trim();
    }
    str = str.substring(0, justifMatch.index).trim();
  }

  let action = '';
  let entity = str;
  let cantidad = '';
  let lote = '';
  let autorOriginal = '';
  let details = '';

  if (str.includes(':')) {
    const colonIdx = str.indexOf(':');
    action = str.substring(0, colonIdx).trim().replace(/\s+(para|de|del|en|al)$/i, '').trim();
    str = str.substring(colonIdx + 1).trim();
  }

  // Extraer "Registrado originalmente por:"
  if (str.includes('Registrado originalmente por:')) {
    const regIdx = str.indexOf('Registrado originalmente por:');
    autorOriginal = str.substring(regIdx + 'Registrado originalmente por:'.length).trim();
    str = str.substring(0, regIdx).trim();
    if (str.endsWith('—') || str.endsWith('-')) {
      str = str.substring(0, str.length - 1).trim();
    }
  }

  // Extraer Lote
  const loteMatch = str.match(/(?:—|-|\()?\s*Lote:\s*([^\s)—]+)/i);
  if (loteMatch) {
    lote = loteMatch[1].trim();
    str = str.replace(loteMatch[0], '').trim();
  }

  // Extraer Cantidad
  const cantMatch = str.match(/(?:—|-|\()?\s*(?:Cantidad:)?\s*(\d+\s*u\.?|\d+\s*unidades?)/i);
  if (cantMatch) {
    cantidad = cantMatch[1].trim();
    str = str.replace(cantMatch[0], '').trim();
  }

  // Limpiar caracteres sobrantes
  entity = str.replace(/[\(\)]/g, '').replace(/^[—\-:\s]+|[—\-:\s]+$/g, '').trim();

  return {
    action,
    entity: formatNombreInsumo(entity),
    cantidad,
    lote,
    autorOriginal,
    details,
    motivo: extractedMotivo
  };
};

const Auditoria = () => {
  const { isSupervisor } = useAuth();
  const { area } = useArea();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);

  // Escuchar tecla ESC para cerrar modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedLog(null);
      }
    };
    if (selectedLog) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLog]);

  // Filtros
  const [filterUser, setFilterUser] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Estado para Modal de Acta de Conciliación Detallada
  const [selectedConciliacion, setSelectedConciliacion] = useState(null);
  const [loadingConciliacion, setLoadingConciliacion] = useState(false);

  const handleOpenConciliacionActa = async (log) => {
    const conciliacionId = log.conciliacion_id || (log.registro_afectado && !log.registro_afectado.includes('insumos') ? log.registro_afectado : null);
    
    if (!conciliacionId) {
      Swal.fire({
        title: 'Registro Histórico Anterior',
        text: 'Esta conciliación pertenece a una ejecución previa a la activación del Acta Digital. Aplica una nueva conciliación para visualizar y exportar el acta oficial.',
        icon: 'info',
        confirmButtonColor: '#0f172a',
        customClass: { popup: 'rounded-3xl' }
      });
      return;
    }

    setLoadingConciliacion(true);
    try {
      const targetMetaId = conciliacionId.startsWith('conciliacion_') ? conciliacionId : `conciliacion_${conciliacionId}`;
      let snap = await getDoc(doc(db, 'metadata', targetMetaId));
      
      if (!snap.exists()) {
        snap = await getDoc(doc(db, 'conciliaciones', conciliacionId));
      }

      if (snap.exists()) {
        setSelectedConciliacion({ id: snap.id, ...snap.data() });
      } else {
        Swal.fire({
          title: 'Registro Histórico Anterior',
          text: 'Esta conciliación fue realizada antes de la activación del Acta Digital. Por favor realiza una nueva conciliación para generar y exportar el acta completa.',
          icon: 'info',
          confirmButtonColor: '#0f172a',
          customClass: { popup: 'rounded-3xl' }
        });
      }
    } catch (err) {
      console.error("Error al obtener acta de conciliación:", err);
      Swal.fire({
        title: 'Error de Lectura',
        text: 'No se pudo consultar el acta de conciliación: ' + err.message,
        icon: 'error',
        confirmButtonColor: '#0f172a',
        customClass: { popup: 'rounded-3xl' }
      });
    } finally {
      setLoadingConciliacion(false);
    }
  };

  const PAGE_SIZE = 25;
  const [currentPage, setCurrentPage] = useState(1);

  // ⚡ CONEXIÓN TIEMPO REAL (WebSockets / Firestore onSnapshot)
  useEffect(() => {
    setLoading(true);
    const constraints = [
      where('area', '==', area),
      orderBy('timestamp', 'desc'),
      limit(100)
    ];

    if (filterUser) constraints.push(where('usuario_id', '==', filterUser.toLowerCase()));
    if (filterModule) constraints.push(where('modulo', '==', filterModule));
    if (filterDate) constraints.push(where('fecha', '==', filterDate));

    const q = query(collection(db, 'auditoria'), ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setLogs(data);
      setLoading(false);
    }, (err) => {
      console.error("Error en escucha en tiempo real de Auditoría:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [area, filterUser, filterModule, filterDate]);

  const totalPages = Math.ceil(logs.length / PAGE_SIZE) || 1;
  const currentLogs = logs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handlePageChange = (p) => {
    setCurrentPage(p);
  };

  const handleManualSearch = () => {
    setCurrentPage(1);
  };

  if (!isSupervisor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="glass-card p-10 rounded-3xl max-w-md w-full border border-slate-100 shadow-sm flex flex-col items-center">
          <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mb-6 border border-rose-100">
            <Lock size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2 tracking-tight">Acceso privado</h2>
          <p className="text-slate-500 text-xs font-normal leading-relaxed mb-6">Esta sección es de uso exclusivo para Supervisores de enfermería.</p>
          <button onClick={() => window.history.back()} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm">Regresar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-3.5 animate-fade-in pb-2 lg:pb-0">

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1 shrink-0 animate-fade-in-up">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-white shadow-sm rounded-2xl flex items-center justify-center border border-slate-100/60 shrink-0">
            <ShieldAlert className="text-primary-600" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-tight">Auditoría</h1>
            <p className="text-slate-400 text-[11px] font-medium mt-0.5 flex items-center gap-1.5">
              <span>Trazabilidad y seguridad</span>
              <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-emerald-600 font-semibold text-[10px] tracking-wider">Bitácora en vivo</span>
            </p>
          </div>
        </div>
        <button
          onClick={handleManualSearch}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 active:scale-95 text-white rounded-xl font-semibold text-xs transition-all shrink-0 self-start sm:self-auto shadow-xs"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </header>

      {/* Filtros */}
      <section className="glass-card p-2.5 px-3.5 rounded-2xl border border-white/60 shadow-xs shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500 block ml-1">Módulo del sistema</label>
            <select
              value={filterModule}
              onChange={e => setFilterModule(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-primary-500/50 transition-all shadow-inner"
            >
              <option value="">Todos los módulos</option>
              <option value="Inventario">Inventario</option>
              <option value="Movimientos">Movimientos</option>
              <option value="Usuarios">Usuarios</option>
              <option value="Historial">Historial / Correcciones</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500 block ml-1">Fecha del evento</label>
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-primary-500/50 transition-all shadow-inner"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500 block ml-1">Usuario responsable</label>
            <input
              type="text"
              placeholder="Buscar usuario o correo..."
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              onBlur={handleManualSearch}
              className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-primary-500/50 transition-all shadow-inner placeholder:text-slate-400"
            />
          </div>
        </div>
      </section>

      {/* VISTA MÓVIL: Tarjetas de Auditoría (< md) */}
      <div className="block md:hidden flex-1 overflow-y-auto min-h-0 space-y-3 mb-2">
        {loading && logs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 italic text-xs font-medium bg-white rounded-2xl border border-slate-100 p-4">
            Cargando registros en tiempo real...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 italic text-xs font-medium bg-white rounded-2xl border border-slate-100 p-4">
            No se han registrado acciones en este periodo.
          </div>
        ) : (
          currentLogs.map((log) => {
            const cfg = getActionConfig(log.accion);
            const Icon = cfg.icon;
            const parsed = parseLogDescription(log.descripcion, log.motivo);

            return (
              <div
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm space-y-2.5 text-xs cursor-pointer hover:border-primary-200 transition-all"
              >
                {/* Header: Icono + Badge + Fecha */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-50 pb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                      <Icon size={14} />
                    </div>
                    <div>
                      <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}>
                        {cfg.label || log.accion}
                      </span>
                      <span className="text-[10px] font-medium text-slate-400 ml-1.5">{log.modulo}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-data text-[10px] text-slate-400 font-medium block">{log.fecha}</span>
                    <span className="font-data text-[10px] text-primary-600 font-semibold">{log.hora}</span>
                  </div>
                </div>

                {/* Contenido principal */}
                <div>
                  <div className="font-bold text-slate-800 text-[13px] leading-snug flex items-center gap-2">
                    <span>{parsed.entity || log.descripcion}</span>
                    {parsed.action && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                        {parsed.action}
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer: Responsable + Ver Detalle */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-50 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <UserCheck size={13} className="text-slate-400" />
                    <span className="font-medium text-slate-700">{log.usuario}</span>
                    {log.rol && <span className="text-[10px] text-slate-400">({formatRol(log.rol)})</span>}
                  </div>
                  {log.accion === 'CONCILIACIÓN' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenConciliacionActa(log);
                      }}
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50/90 px-2.5 py-1 rounded-xl border border-emerald-200 shadow-2xs"
                    >
                      <ClipboardCheck size={13} /> Ver Acta
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 bg-primary-50 px-2.5 py-1 rounded-xl border border-primary-100">
                      <Eye size={12} /> Ver detalle
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}

        <div className="pt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={logs.length}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
            itemLabel="registros"
            disabled={loading}
            className="rounded-2xl border border-slate-200/80 shadow-xs"
          />
        </div>
      </div>

      {/* VISTA ESCRITORIO: Tabla de Auditoría (>= md) */}
      <div className="hidden md:flex flex-col flex-1 min-h-0 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm font-data mb-0">
        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
              <tr className="bg-slate-50/50">
                <th className="pl-4 pr-1 py-2.5 w-10"></th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 tracking-wide w-36">Acción</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide">Descripción del evento</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 tracking-wide w-44">Responsable</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-right pr-5 w-36">Fecha / Hora</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center w-28">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px]">
              {loading && logs.length === 0 ? (
                <tr><td colSpan="6" className="py-20 text-center text-slate-400 italic text-xs font-medium">Cargando registros en tiempo real...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="6" className="py-20 text-center text-slate-400 italic text-xs font-medium">No se han registrado acciones en este periodo.</td></tr>
              ) : (
                currentLogs.map((log) => {
                  const cfg = getActionConfig(log.accion);
                  const Icon = cfg.icon;
                  const parsed = parseLogDescription(log.descripcion, log.motivo);

                  return (
                    <tr
                      key={log.id}
                      onClick={() => {
                        if (log.accion === 'CONCILIACIÓN') {
                          handleOpenConciliacionActa(log);
                        } else {
                          setSelectedLog(log);
                        }
                      }}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                    >
                      {/* Icono Avatar */}
                      <td className="pl-4 pr-1 py-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          <Icon size={15} />
                        </div>
                      </td>

                      {/* Acción + Módulo */}
                      <td className="px-3 py-3">
                        <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}>
                          {cfg.label || log.accion}
                        </span>
                        <div className="text-[10px] font-medium text-slate-400 mt-1">{log.modulo}</div>
                      </td>

                      {/* Descripción Clarificada */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-[13px] text-slate-800 leading-snug flex items-center gap-2">
                          <span>{parsed.entity || log.descripcion}</span>
                          {parsed.action && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                              {parsed.action}
                            </span>
                          )}
                        </div>
                        {parsed.motivo && (
                          <div className="text-[11px] text-amber-800 font-normal mt-1 truncate max-w-md">
                            <span className="font-semibold text-amber-900">Justificación:</span> "{parsed.motivo}"
                          </div>
                        )}
                      </td>

                      {/* Responsable */}
                      <td className="px-3 py-3">
                        <div className="font-medium text-[12px] text-slate-700">{log.usuario}</div>
                        <div className="text-[10px] font-medium text-slate-400">{formatRol(log.rol)}</div>
                      </td>

                      {/* Fecha / Hora */}
                      <td className="px-4 py-3 text-right pr-5">
                        <div className="font-data text-[11px] font-medium text-slate-500">{log.fecha}</div>
                        <div className="font-data text-[11px] font-semibold text-primary-600">{log.hora}</div>
                      </td>

                      {/* Botón Ver Detalle */}
                      <td className="px-3 py-3 text-center">
                        {log.accion === 'CONCILIACIÓN' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenConciliacionActa(log);
                            }}
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50/90 hover:bg-emerald-100 px-3 py-1 rounded-xl border border-emerald-200/90 transition-all shadow-2xs"
                            title="Ver Acta Oficial de Toma Física y Exportar"
                          >
                            <ClipboardCheck size={13} />
                            <span>Ver Acta</span>
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 bg-primary-50/80 hover:bg-primary-100 px-2.5 py-1 rounded-xl border border-primary-200/80 transition-all shadow-2xs"
                          >
                            <Eye size={13} />
                            <span>Ver</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Barra de Paginación Fija Abajo */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={logs.length}
          pageSize={PAGE_SIZE}
          onPageChange={handlePageChange}
          itemLabel="registros"
          disabled={loading}
        />
      </div>

      {/* 🔮 MODAL DE DETALLE DE AUDITORÍA (EMPRESARIAL / GLASSMORPHISM) */}
      {selectedLog && (
        <div
          onClick={() => setSelectedLog(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scale-in"
          >

            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${getActionConfig(selectedLog.accion).bg} ${getActionConfig(selectedLog.accion).text} ${getActionConfig(selectedLog.accion).border}`}>
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">Detalle de Auditoría</h2>
                  <p className="text-xs text-slate-400 font-medium">Módulo {selectedLog.modulo} • Servicio {area}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Accion & Timestamp Badges */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-400">Acción Registrada:</span>
                <span className={`font-bold px-2.5 py-0.5 rounded-full border text-[10px] uppercase tracking-wider ${getActionConfig(selectedLog.accion).badgeBg} ${getActionConfig(selectedLog.accion).badgeText} ${getActionConfig(selectedLog.accion).badgeBorder}`}>
                  {getActionConfig(selectedLog.accion).label || selectedLog.accion}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500 font-data">
                <Clock size={13} className="text-slate-400" />
                <span>{selectedLog.fecha} a las {selectedLog.hora}</span>
              </div>
            </div>

            {/* Información del Evento e Insumo */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-500">Entidad / Insumo afectado</h3>
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2.5">
                <div className="font-bold text-sm text-slate-800">
                  {parseLogDescription(selectedLog.descripcion, selectedLog.motivo).entity || selectedLog.descripcion}
                </div>

                {parseLogDescription(selectedLog.descripcion, selectedLog.motivo).action && (
                  <div className="text-xs font-semibold text-slate-600">
                    Operación Original: <span className="text-slate-800 font-medium">{parseLogDescription(selectedLog.descripcion, selectedLog.motivo).action}</span>
                  </div>
                )}

                {/* Badges Vectoriales (Sin Emojis) de Cantidad, Lote y Autor Original */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  {parseLogDescription(selectedLog.descripcion, selectedLog.motivo).cantidad && (
                    <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-xl font-semibold border border-blue-100">
                      <Boxes size={14} /> Cantidad: {parseLogDescription(selectedLog.descripcion, selectedLog.motivo).cantidad}
                    </span>
                  )}
                  {parseLogDescription(selectedLog.descripcion, selectedLog.motivo).lote && (
                    <span className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-700 px-2.5 py-1 rounded-xl font-semibold border border-purple-100">
                      <Tag size={14} /> Lote: {parseLogDescription(selectedLog.descripcion, selectedLog.motivo).lote}
                    </span>
                  )}
                </div>

                {parseLogDescription(selectedLog.descripcion, selectedLog.motivo).autorOriginal && (
                  <div className="bg-white text-slate-700 px-3 py-2 rounded-xl border border-slate-200/80 text-xs flex items-center gap-2">
                    <User size={14} className="text-slate-500 shrink-0" />
                    <span>Autor del registro original: <strong className="font-semibold text-slate-900">{parseLogDescription(selectedLog.descripcion, selectedLog.motivo).autorOriginal}</strong></span>
                  </div>
                )}
              </div>
            </div>

            {/* Responsable de la Ejecución de la Acción */}
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-slate-500">Responsable de la ejecución</h3>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-200/60 flex items-center justify-center text-slate-600 font-bold">
                    <User size={16} />
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">{selectedLog.usuario}</div>
                    <div className="text-[11px] text-slate-400">{formatRol(selectedLog.rol)}</div>
                  </div>
                </div>
                <div className="text-right text-[11px] font-mono text-slate-500">
                  {selectedLog.usuario_id}
                </div>
              </div>
            </div>

            {/* Identificador Único en Sistema con Aclaración Explícita */}
            {selectedLog.registro_afectado && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-slate-500">Identificador en el sistema</h3>
                <div className="bg-primary-50/60 p-3 rounded-2xl border border-primary-100 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary-900 font-medium">
                    <Hash size={14} className="text-primary-600 shrink-0" />
                    <span>ID de Documento / Kárdex Afectado:</span>
                  </div>
                  <span className="font-mono font-bold text-primary-700 bg-white px-2.5 py-0.5 rounded-lg border border-primary-200">
                    {selectedLog.registro_afectado}
                  </span>
                </div>
              </div>
            )}

            {/* Justificación Normativa */}
            {selectedLog.motivo && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-slate-500">Justificación / Motivo registrado</h3>
                <div className="bg-amber-50/90 p-3.5 rounded-2xl border border-amber-200/80 text-xs text-amber-900 leading-relaxed font-normal">
                  <div className="flex items-center gap-1.5 font-bold text-amber-950 mb-1">
                    <MessageSquare size={14} className="text-amber-700" />
                    Motivo Oficial:
                  </div>
                  "{selectedLog.motivo}"
                </div>
              </div>
            )}

            {/* Botón Acceso a Acta de Conciliación si aplica */}
            {selectedLog.accion === 'CONCILIACIÓN' && (
              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    const logToFetch = selectedLog;
                    setSelectedLog(null);
                    handleOpenConciliacionActa(logToFetch);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs transition-all shadow-xs"
                >
                  <ClipboardCheck size={16} />
                  <span>Abrir Acta Oficial de Conciliación y Exportar</span>
                </button>
              </div>
            )}

            {/* Footer Modal */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-semibold transition-all border border-slate-200/80 shadow-xs"
              >
                Cerrar Detalle
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Acta de Conciliación Completa (Exportar a Excel) */}
      <ConciliacionDetailModal
        isOpen={!!selectedConciliacion}
        onClose={() => setSelectedConciliacion(null)}
        conciliacionData={selectedConciliacion}
      />

      {loading && logs.length > 0 && (
        <div className="text-center py-2 animate-pulse text-[10px] font-medium text-slate-400 shrink-0">
          Sincronizando eventos en tiempo real...
        </div>
      )}

    </div>
  );
};

export default Auditoria;
