import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useArea } from '../contexts/AreaContext';
import { auth } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { 
  LayoutDashboard, 
  Boxes, 
  ArrowLeftRight, 
  History, 
  MoreHorizontal,
  FileBarChart,
  ShieldAlert,
  Users,
  Settings,
  LogOut,
  RefreshCw,
  X,
  Activity,
  HeartPulse
} from 'lucide-react';

const getUserDisplayName = (nameOrEmail) => {
  if (!nameOrEmail) return 'Usuario';
  if (!nameOrEmail.includes('@')) return nameOrEmail;
  const emailKey = nameOrEmail.split('@')[0];
  return emailKey
    .split('.')
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

const BottomNav = () => {
  const { userData, currentUser, isSupervisor, isEnfermero } = useAuth();
  const { area, setArea } = useArea();
  const navigate = useNavigate();
  const [showMoreSheet, setShowMoreSheet] = useState(false);

  const mainNavItems = [
    { to: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
    { to: '/inventario', label: 'Inventario', icon: Boxes },
    { to: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight },
    { to: '/historial', label: 'Historial', icon: History },
  ];

  const secondaryNavItems = [
    { to: '/reportes', label: 'Reportes del Área', icon: FileBarChart, color: 'text-sky-600 bg-sky-50 border-sky-200/60' },
    ...(isSupervisor ? [
      { to: '/auditoria', label: 'Auditoría de Movimientos', icon: ShieldAlert, color: 'text-amber-600 bg-amber-50 border-amber-200/60' },
      { to: '/usuarios', label: 'Gestión de Usuarios', icon: Users, color: 'text-indigo-600 bg-indigo-50 border-indigo-200/60' },
      { to: '/configuracion', label: 'Configuración y Toma Física', icon: Settings, color: 'text-slate-700 bg-slate-100 border-slate-200/60' }
    ] : [])
  ];

  const handleLogout = async () => {
    setShowMoreSheet(false);
    await signOut(auth);
    setArea('');
    navigate('/login');
  };

  const handleSwitchArea = () => {
    setShowMoreSheet(false);
    setArea('');
    navigate('/login');
  };

  const displayName = getUserDisplayName(userData?.nombre || currentUser?.email);

  return (
    <>
      {/* Bottom Navigation Bar Fija */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 py-1.5 shadow-lg flex items-center justify-around">
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setShowMoreSheet(false)}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-50 text-primary-600 font-bold scale-105 shadow-xs border border-primary-100/60'
                    : 'text-slate-400 font-medium hover:text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              <Icon size={19} />
              <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
            </NavLink>
          );
        })}

        {/* Botón MÁS (Abre Bottom Sheet) */}
        <button
          type="button"
          onClick={() => setShowMoreSheet(true)}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-200 ${
            showMoreSheet
              ? 'bg-primary-50 text-primary-600 font-bold scale-105 shadow-xs border border-primary-100/60'
              : 'text-slate-400 font-medium hover:text-slate-600 hover:bg-slate-50'
          }`}
        >
          <MoreHorizontal size={19} />
          <span className="text-[10px] mt-0.5 tracking-tight">Más</span>
        </button>
      </nav>

      {/* Bottom Sheet Modal / Menú Flotante Inferior */}
      {showMoreSheet && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end animate-fade-in">
          {/* Overlay oscuro */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setShowMoreSheet(false)}
          ></div>

          {/* Tarjeta Deslizable desde Abajo */}
          <div className="relative bg-white rounded-t-3xl border-t border-slate-200 shadow-2xl p-5 space-y-4 animate-reveal max-h-[85vh] overflow-y-auto">
            {/* Grabber pill */}
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto -mt-1 mb-2"></div>

            {/* Header con Perfil de Usuario */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-primary-600 text-white font-bold text-base flex items-center justify-center shadow-md shadow-primary-600/20">
                  {displayName.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm leading-snug">{displayName}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-bold text-primary-600 uppercase tracking-wider bg-primary-50 px-2 py-0.5 rounded-md border border-primary-100/60">
                      {isSupervisor ? 'Supervisor' : isEnfermero ? 'Enfermero' : 'Encargado'}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100/60 flex items-center gap-1">
                      {area === 'Emergencia' ? <Activity size={10} /> : <HeartPulse size={10} />}
                      <span>{area || 'Encamamiento'}</span>
                    </span>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowMoreSheet(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Módulos Secundarios */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Módulos del Sistema</p>
              <div className="grid grid-cols-1 gap-2">
                {secondaryNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setShowMoreSheet(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                          isActive
                            ? 'bg-primary-600 text-white font-bold shadow-md border-primary-600'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold border-slate-200/70'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <div className={`p-2 rounded-xl border ${isActive ? 'bg-white/20 text-white border-white/20' : item.color}`}>
                            <Icon size={18} />
                          </div>
                          <span className="text-xs font-bold tracking-tight">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>

            {/* Acciones de Cuenta y Área */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSwitchArea}
                className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-200/80"
              >
                <RefreshCw size={14} className="text-slate-500" />
                <span>Cambiar Área</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border border-rose-200/80"
              >
                <LogOut size={14} className="text-rose-600" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BottomNav;
