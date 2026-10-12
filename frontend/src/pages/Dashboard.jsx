import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useArea } from '../contexts/AreaContext';
import { useData } from '../contexts/DataContext';
import { getMasterCategory } from '../utils/constants';
import { db } from '../services/firebase';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { 
  BarChart3, 
  Pill, 
  Stethoscope, 
  AlertTriangle, 
  Calendar, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight,
  Sun,
  Sunset,
  Moon
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

const getUserDisplayName = (emailOrName) => {
  if (!emailOrName) return '—';
  if (!emailOrName.includes('@')) {
    return emailOrName
      .split(' ')
      .filter(w => w.length > 0)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  const emailKey = emailOrName.split('@')[0];
  return emailKey
    .split('.')
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

const Dashboard = () => {
  const { userData, currentUser } = useAuth();
  const { area } = useArea();
  const { insumos, recentMovs, loading } = useData();
  const [lotesVencimiento, setLotesVencimiento] = useState([]);
  const navigate = useNavigate();

  // 📡 CARGA QUIRÚRGICA: Solo lotes próximos a vencer (Ahorro masivo de lecturas)
  useEffect(() => {
    if (!area) return;
    
    const limitVencimiento = new Date();
    limitVencimiento.setDate(limitVencimiento.getDate() + 30);
    const dateLimitStr = limitVencimiento.toISOString().split('T')[0];

    const q = query(
      collection(db, 'lotes'),
      where('area', '==', area),
      where('fecha_vencimiento', '<=', dateLimitStr),
      where('fecha_vencimiento', '>', ''),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      setLotesVencimiento(snap.docs.map(d => d.data()).filter(l => l.cantidad > 0));
    });

    return () => unsub();
  }, [area]);

  // 🧠 MOTOR DE INTELIGENCIA DE DATOS (Memoizado)
  const processedData = React.useMemo(() => {
    if (loading) return {
      stats: { totalMedicamentos: '—', totalMQ: '—', alertasCriticas: '—', vencimientosProximos: '—' },
      alertasLista: [],
      masDispensados: [],
      actividadReciente: [],
      weeklyData: []
    };

    // 1. Contadores Globales y Alertas de Stock
    let medCount = 0;
    let mqCount = 0;
    let alertasCount = 0;
    let agotadosCount = 0;
    let criticos = [];

    insumos.forEach(item => {
      if (item.activo === false) return;
      const master = getMasterCategory(item.categoria);
      if (master === 'Medicamento') medCount++;
      else if (master === 'Médico-quirúrgico') mqCount++;
      
      const stock = item.stock_actual || 0;
      if (stock === 0) {
        agotadosCount++;
      }
      if (stock <= (item.stock_bajo || 10)) {
        alertasCount++;
        criticos.push({ nombre: item.nombre, stock: stock });
      }
    });

    // 2. Ranking de Más Dispensados (Ranking por Cantidad Acumulada de Unidades)
    const counts = {};
    recentMovs.forEach(m => {
      const tipoLower = (m.tipo || '').toLowerCase();
      if (tipoLower.includes('salida') || tipoLower.includes('egreso')) {
        const nombre = m.nombre_insumo || 'Insumo';
        counts[nombre] = (counts[nombre] || 0) + (m.cantidad || 0);
      }
    });
    const top = Object.keys(counts)
      .map(k => ({ nombre: k, cantidad: counts[k] }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    // 3. Actividad Reciente (7 registros para igualar perfectamente la altura física de las 3 tarjetas)
    const reciente = recentMovs.slice(0, 7).map(m => {
      const d = m.fecha_registro?.seconds ? new Date(m.fecha_registro.seconds * 1000) : null;
      const hoy = new Date().toLocaleDateString('en-CA');
      const esHoy = m.fecha === hoy;
      
      const hora = d ? d.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }) : (m.hora || '--:--');
      const fechaDisplay = esHoy ? '' : m.fecha ? m.fecha.split('-').slice(1).reverse().join('/') + ' ' : '';
      
      return { ...m, horaDisplay: `${fechaDisplay}${hora}` };
    });

    // 4. Datos Semanales por Turno (Mañana, Tarde, Noche)
    const days = [];
    const now = new Date();
    
    for(let i=6; i>=0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const fechaLocalStr = `${year}-${month}-${day}`;

      days.push({ 
        fechaStr: fechaLocalStr, 
        label: d.toLocaleDateString('es-GT', { weekday: 'short' }).toUpperCase(),
        manana: 0,
        tarde: 0,
        noche: 0,
        total: 0 
      });
    }

    recentMovs.forEach(m => {
      const dayMatch = days.find(d => d.fechaStr === m.fecha);
      const tipoLower = (m.tipo || '').toLowerCase();
      if (dayMatch && (tipoLower.includes('salida') || tipoLower.includes('egreso'))) {
        let t = (m.turno || '').toUpperCase().trim();
        if (!t) {
          const seconds = m.fecha_registro?.seconds;
          if (seconds) {
            const h = new Date(seconds * 1000).getHours();
            if (h >= 7 && h < 15) t = 'M';
            else if (h >= 15 && h < 23) t = 'T';
            else t = 'N';
          } else {
            t = 'M';
          }
        }

        if (t === 'T' || t.includes('TARDE')) {
          dayMatch.tarde += 1;
        } else if (t === 'N' || t.includes('NOCHE')) {
          dayMatch.noche += 1;
        } else {
          dayMatch.manana += 1;
        }
        dayMatch.total += 1;
      }
    });

    // 5. Vencimientos Próximos
    const vencimientosCount = lotesVencimiento.length;

    return {
      stats: { 
        totalMedicamentos: medCount, 
        totalMQ: mqCount, 
        alertasCriticas: alertasCount, 
        vencimientosProximos: vencimientosCount,
        totalAgotados: agotadosCount 
      },
      alertasLista: criticos.sort((a,b) => a.stock - b.stock).slice(0, 8),
      masDispensados: top,
      actividadReciente: reciente,
      weeklyData: days
    };
  }, [insumos, recentMovs, lotesVencimiento, loading]);

  const { stats, alertasLista, masDispensados, actividadReciente, weeklyData } = processedData;
  const fechaHoy = new Date().toLocaleDateString('es-GT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-4 animate-reveal w-full mx-auto px-1 pb-8">
      
      {/* Header Adaptativo */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 mb-2 animate-fade-in-up">
        <div className="flex items-center gap-3.5">
           <div className="w-11 h-11 bg-white shadow-sm rounded-2xl flex items-center justify-center border border-slate-100/80 shrink-0">
             <BarChart3 className="text-primary-600" size={20} />
           </div>
           <div>
             <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">
               ¡Hola, {getUserDisplayName(userData?.nombre || currentUser?.email)}!
             </h1>
             <p className="text-slate-400 text-xs font-medium flex items-center gap-2 leading-none mt-1">
               <span className="capitalize">{fechaHoy}</span> 
               <span className="w-1 h-1 bg-slate-300 rounded-full"></span> 
               <span className="text-primary-600 font-semibold text-[11px]">Resumen en vivo de {area || 'Área'}</span>
             </p>
           </div>
        </div>
      </header>

      {/* Row 1: KPI Stats Bajitos y Eficientes (py-2.5 px-4) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {[
          { 
            label: 'Stock Medicamentos', 
            val: stats.totalMedicamentos, 
            icon: <Pill size={18} />, 
            color: 'text-blue-600 bg-blue-50/80 border-blue-100',
            onClick: () => navigate('/inventario', { state: { masterCategory: 'Medicamento' } })
          },
          { 
            label: 'Médico-quirúrgicos', 
            val: stats.totalMQ, 
            icon: <Stethoscope size={18} />, 
            color: 'text-emerald-600 bg-emerald-50/80 border-emerald-100',
            onClick: () => navigate('/inventario', { state: { masterCategory: 'Médico-quirúrgico' } })
          },
          { 
            label: 'Alertas (Stock Bajo)', 
            val: stats.alertasCriticas, 
            icon: <AlertTriangle size={18} />, 
            color: 'text-rose-600 bg-rose-50/80 border-rose-100',
            onClick: () => navigate('/inventario', { state: { filterStatus: 'bajo' } })
          },
          { 
            label: 'Próximos a Vencer', 
            val: stats.vencimientosProximos, 
            icon: <Calendar size={18} />, 
            color: 'text-amber-600 bg-amber-50/80 border-amber-100',
            onClick: () => navigate('/inventario', { 
              state: { 
                filterExpiry: '30', 
                expiringCodigos: Array.from(new Set(lotesVencimiento.map(l => String(l.codigo_insumo)))) 
              } 
            })
          }
        ].map((s, i) => (
          <div 
            key={i} 
            onClick={s.onClick}
            title={`Filtrar inventario por ${s.label}`}
            className="glass-card py-2.5 px-4 rounded-2xl flex items-center gap-3 group hover:shadow-md hover:border-primary-300 cursor-pointer transition-all duration-200 animate-reveal"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs group-hover:scale-105 transition-transform ${s.color}`}>
              {s.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xl font-bold text-slate-900 tracking-tight font-data leading-tight group-hover:text-primary-600 transition-colors">{s.val}</div>
              <div className="text-[11px] font-semibold text-slate-500 tracking-tight flex items-center gap-1 group-hover:text-primary-700 transition-colors truncate">
                <span className="truncate">{s.label}</span>
                <ArrowUpRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity text-primary-500 shrink-0" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Row 2: Inteligencia Operativa */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Insumos Críticos */}
        <div className="glass-card p-5 rounded-2xl flex flex-col animate-reveal">
          <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-100/70">
             <h3 className="text-xs font-semibold text-slate-400 tracking-wide">
               Insumos críticos ({stats.totalAgotados})
             </h3>
             <span className="bg-rose-50 text-rose-600 font-semibold text-[11px] px-2.5 py-0.5 rounded-full border border-rose-100">
               Faltantes ({stats.totalAgotados})
             </span>
          </div>
          <div className="space-y-1.5 flex-1 mb-2">
            {alertasLista.length > 0 ? alertasLista.map((a, i) => (
              <div key={i} className="flex justify-between items-center p-2 bg-slate-50/50 rounded-xl border border-slate-100/50 group hover:bg-white hover:border-primary-100 transition-all">
                <span className="text-[13px] font-medium text-slate-700 truncate mr-4 tracking-tight">{formatNombreInsumo(a.nombre)}</span>
                <span className={`text-xs font-bold font-data ${a.stock === 0 ? 'text-rose-600' : 'text-amber-600'}`}>Stock: {a.stock}</span>
              </div>
            )) : <div className="h-32 flex items-center justify-center text-slate-400 italic text-xs font-medium">Base Estable (Sin faltantes)</div>}
          </div>
          <div className="pt-2 mt-auto border-t border-slate-100/70">
             <button 
               onClick={() => navigate('/inventario', { state: { filterStatus: 'agotado' } })}
               className="w-full py-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50/50 hover:bg-rose-50 rounded-xl transition-all border border-rose-100/60 group cursor-pointer active:scale-98"
             >
               <span>Ver insumos en estado crítico</span>
               <ArrowUpRight size={13} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
             </button>
          </div>
        </div>

        {/* Frecuencia de Uso */}
        <div className="glass-card p-5 rounded-2xl flex flex-col animate-reveal">
          <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-100/70">
             <h3 className="text-xs font-semibold text-slate-400 tracking-wide">Frecuencia de uso</h3>
             <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
               <TrendingUp size={12} /> Semanal
             </span>
          </div>
          <div className="space-y-2 flex-1 px-0.5">
            {masDispensados.map((item, i) => {
              const max = masDispensados[0]?.cantidad || 1;
              const pct = (item.cantidad / max) * 100;
              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-[13px] font-medium">
                    <span className="text-slate-700 truncate max-w-[180px] tracking-tight">{formatNombreInsumo(item.nombre)}</span>
                    <span className="text-primary-600 font-data font-bold text-xs">{item.cantidad}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200/30">
                    <div className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all duration-700" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actividad Reciente */}
        <div className="glass-card p-5 rounded-2xl flex flex-col animate-reveal">
          <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-100/70">
             <h3 className="text-xs font-semibold text-slate-400 tracking-wide">Actividad reciente</h3>
             <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-emerald-600">En Vivo</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
             </div>
          </div>
          <div className="space-y-1.5 flex-1">
            {actividadReciente.map((m, i) => {
              const tipoLower = (m.tipo || '').toLowerCase();
              const isEntrada = tipoLower.includes('entrada') || tipoLower.includes('ingreso') || m.tipo === 'CARGA_INICIAL';
              const tipoLabel = m.tipo === 'CARGA_INICIAL' ? 'Carga Inicial' : m.tipo === 'AJUSTE' ? 'Ajuste Stock' : isEntrada ? 'Entrada' : 'Salida';

              return (
                <div key={i} className="flex items-start gap-2.5 p-1.5 bg-slate-50/50 rounded-xl border border-transparent hover:border-slate-100 hover:bg-white transition-all group">
                   <div className={`p-1.5 rounded-lg mt-0.5 shrink-0 ${isEntrada ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
                      {isEntrada ? <ArrowUpRight size={13} /> : <ArrowDownRight size={14} />}
                   </div>
                   <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-center mb-0.5">
                         <span className="text-[13px] font-medium text-slate-700 truncate pr-2">{formatNombreInsumo(m.nombre_insumo)}</span>
                         <span className="text-[11px] font-normal text-slate-400 font-data shrink-0">{m.horaDisplay}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 leading-none">
                         <span className={isEntrada ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>{tipoLabel}</span>
                         <span className="text-slate-300">•</span>
                         <span className="font-data font-medium text-slate-600">Cant: {m.cantidad}</span>
                         <span className="text-slate-300">•</span>
                         <span className="truncate text-slate-500 font-normal">{getUserDisplayName(m.usuario || m.registrado_por)}</span>
                      </div>
                   </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3: Gráfica Semanal de Egresos por Turno */}
      <section className="glass-card p-5 rounded-2xl animate-reveal">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100/70">
           <div>
              <h3 className="text-xs font-semibold text-slate-400 tracking-wide">Egresos semanales por turno</h3>
              <p className="text-slate-400 text-xs font-normal mt-0.5">Número de transacciones de salida registradas por turno</p>
           </div>
           
           {/* Leyenda de Turnos (Pills idénticos a la imagen del usuario) */}
           <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 bg-amber-500/10 px-3.5 py-1 rounded-full border border-amber-300/80 shadow-2xs">
                 <Sun size={13} className="text-amber-600" />
                 <span>Mañana (M)</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900 bg-blue-500/10 px-3.5 py-1 rounded-full border border-blue-300/80 shadow-2xs">
                 <Sunset size={13} className="text-blue-600" />
                 <span>Tarde (T)</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900 bg-indigo-500/10 px-3.5 py-1 rounded-full border border-indigo-300/80 shadow-2xs">
                 <Moon size={13} className="text-indigo-600" />
                 <span>Noche (N)</span>
              </div>
           </div>
        </div>

        {/* Gráfica de Barras Apiladas Anchas */}
        <div className="flex items-end justify-between h-48 gap-3 sm:gap-6 px-2 sm:px-6 pt-3">
          {weeklyData.map((d, i) => {
            const max = Math.max(...weeklyData.map(wd => wd.total), 1);
            const totalHeight = (d.total / max) * 100;
            const pctManana = d.total > 0 ? (d.manana / d.total) * 100 : 0;
            const pctTarde = d.total > 0 ? (d.tarde / d.total) * 100 : 0;
            const pctNoche = d.total > 0 ? (d.noche / d.total) * 100 : 0;

            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2.5 h-full justify-end group">
                <div className={`text-xs font-bold font-data transition-colors ${d.total > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                  {d.total}
                </div>
                
                {/* Barra Apilada Multiturno Ancha */}
                <div className="relative w-full group/bar h-[120px] flex items-end">
                  {/* Tooltip emergente al pasar el mouse */}
                  <div className="absolute -top-24 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-md text-white text-[11px] py-2 px-3 rounded-2xl shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover/bar:opacity-100 transition-all z-30 whitespace-nowrap space-y-1">
                     <div className="font-semibold text-slate-300 border-b border-slate-700 pb-1 mb-1 flex items-center justify-between gap-3">
                        <span>{d.label}</span>
                        <span className="text-[10px] text-slate-400 font-data">{d.fechaStr}</span>
                     </div>
                     <div className="flex items-center justify-between gap-3 text-amber-400">
                        <span className="flex items-center gap-1"><Sun size={11} /> Mañana:</span> 
                        <span className="font-bold font-data">{d.manana}</span>
                     </div>
                     <div className="flex items-center justify-between gap-3 text-blue-400">
                        <span className="flex items-center gap-1"><Sunset size={11} /> Tarde:</span> 
                        <span className="font-bold font-data">{d.tarde}</span>
                     </div>
                     <div className="flex items-center justify-between gap-3 text-indigo-400">
                        <span className="flex items-center gap-1"><Moon size={11} /> Noche:</span> 
                        <span className="font-bold font-data">{d.noche}</span>
                     </div>
                  </div>

                  <div 
                    className="w-full rounded-md overflow-hidden flex flex-col-reverse transition-all duration-300 group-hover/bar:shadow-md cursor-pointer border border-slate-200/50"
                    style={{ height: `${Math.max(totalHeight, 6)}%` }}
                  >
                    {d.manana > 0 && (
                      <div 
                        className="w-full bg-[#e78b09] transition-all" 
                        style={{ height: `${pctManana}%` }}
                      ></div>
                    )}
                    {d.tarde > 0 && (
                      <div 
                        className="w-full bg-blue-600 transition-all" 
                        style={{ height: `${pctTarde}%` }}
                      ></div>
                    )}
                    {d.noche > 0 && (
                      <div 
                        className="w-full bg-indigo-700 transition-all" 
                        style={{ height: `${pctNoche}%` }}
                      ></div>
                    )}
                    {d.total === 0 && (
                      <div className="w-full h-full bg-slate-50"></div>
                    )}
                  </div>
                </div>

                <span className="text-[11px] font-semibold text-slate-500 font-data uppercase tracking-wider">{d.label}</span>
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
};

export default Dashboard;
