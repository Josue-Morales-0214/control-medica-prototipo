import React, { useState, useEffect, useRef } from 'react';
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
  FileBarChart, 
  ShieldAlert, 
  Users, 
  Settings,
  LogOut, 
  Activity, 
  HeartPulse,
  ChevronUp
} from 'lucide-react';

const Sidebar = () => {
  const { userData, currentUser, isSuperAdmin, isSupervisor, isEncargado, isEnfermero } = useAuth();
  const { area, setArea } = useArea();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const canSwitchArea = isSupervisor || isSuperAdmin;
  
  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const areaBadge = area === 'Emergencia' ? (
    <span className="inline-flex items-center gap-1.5 bg-rose-500/15 text-rose-400 text-[10px] font-bold px-3 py-1 rounded-full border border-rose-500/25 uppercase tracking-wider">
      <Activity size={12} className="animate-pulse" /> Emergencia
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 text-[10px] font-bold px-3 py-1 rounded-full border border-emerald-500/25 uppercase tracking-wider">
      <HeartPulse size={12} /> Encamamiento
    </span>
  );

  const menuSections = [
    {
      title: 'General',
      links: [
        { id: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> }
      ]
    },
    {
      title: 'Módulos',
      links: [
        { id: 'inventario', href: '/inventario', label: 'Inventario', icon: <Boxes size={18} /> },
        { id: 'movimientos', href: '/movimientos', label: 'Movimientos', icon: <ArrowLeftRight size={18} /> },
        { id: 'historial', href: '/historial', label: 'Historial', icon: <History size={18} /> },
        { id: 'reportes', href: '/reportes', label: 'Reportes', icon: <FileBarChart size={18} /> },
        ...(isSupervisor ? [
          { id: 'auditoria', href: '/auditoria', label: 'Auditoría', icon: <ShieldAlert size={18} /> },
          { id: 'usuarios', href: '/usuarios', label: 'Usuarios', icon: <Users size={18} /> },
          { id: 'configuracion', href: '/configuracion', label: 'Configuración', icon: <Settings size={18} /> }
        ] : [])
      ]
    }
  ];

  const handleLogout = async () => {
    await signOut(auth);
    setArea('');
    navigate('/login');
  };

  const toggleSidebar = () => setIsOpen(!isOpen);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm transition-opacity"
          onClick={toggleSidebar}
        ></div>
      )}

      {/* Sidebar Refactorizado Minimalista */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 lg:w-64 glass-sidebar text-slate-300 transform transition-all duration-500 ease-out lg:translate-x-0 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* Header con Badge de Área */}
        <div className="flex flex-col gap-3.5 p-5 shrink-0 border-b border-white/[0.04]">
          <div className="flex items-center gap-3.5">
            <img src="/logo.png" alt="Control Médica" className="w-11 h-11 rounded-2xl object-contain drop-shadow-md shrink-0" />
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-white tracking-tight leading-tight">Control Médica</h1>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">Sistema de Gestión</span>
            </div>
          </div>
          <div className="flex">{areaBadge}</div>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 custom-scrollbar">
          {menuSections.map((section, sIndex) => (
            <div key={sIndex} className="space-y-1.5">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.links.map((link) => (
                  <NavLink
                    key={link.id}
                    to={link.href}
                    onClick={() => setIsOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 group ${
                        isActive
                          ? 'bg-primary-600/20 text-primary-400 shadow-sm border border-primary-500/20'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`transition-transform duration-200 ${isActive ? 'text-primary-400 scale-110' : 'text-slate-500 group-hover:text-slate-300'}`}>
                          {link.icon}
                        </span>
                        <span className="truncate">{link.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* User Card Fixed Bottom */}
        <div className="p-3 bg-slate-950/70 border-t border-white/[0.04] relative shrink-0" ref={userMenuRef}>
          {showUserMenu && (
            <div className="absolute bottom-16 left-2 right-2 animate-reveal z-50 bg-slate-900/95 backdrop-blur-2xl border border-slate-800 shadow-2xl rounded-2xl p-3.5 space-y-3 font-sans text-slate-300">
               {/* Encabezado del Perfil */}
               <div className="flex items-center gap-3 pb-2.5 border-b border-slate-800/80">
                 <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-bold shadow-md text-sm shrink-0">
                   {userData?.nombre?.charAt(0) || 'U'}
                 </div>
                 <div className="flex flex-col min-w-0 flex-1">
                   <div className="text-xs font-bold text-white truncate leading-tight">
                     {userData?.nombre || 'Usuario'}
                   </div>
                   <div className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">
                     {currentUser?.email || 'usuario@salud.gob.gt'}
                   </div>
                   <div className="flex items-center gap-1.5 mt-1">
                     <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                     <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                       {isOnline ? 'En Línea' : 'Sin Conexión'}
                     </span>
                   </div>
                 </div>
               </div>

               {/* Área Activa + Cambiar de Área (ÚNICAMENTE Supervisores y Super Admin) */}
               {canSwitchArea && (
                 <div className="space-y-1.5 pt-0.5">
                   <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                     <span>Área Activa</span>
                     <span className="text-primary-400 font-semibold">{area}</span>
                   </div>
                   <button
                     onClick={() => {
                       const nextArea = area === 'Emergencia' ? 'Encamamiento' : 'Emergencia';
                       setArea(nextArea);
                       setShowUserMenu(false);
                     }}
                     className="w-full py-1.5 px-2.5 bg-slate-800/70 hover:bg-slate-800 text-slate-200 border border-slate-700/60 rounded-xl text-xs font-medium flex items-center justify-between transition-all group cursor-pointer"
                   >
                     <span className="flex items-center gap-1.5 text-[11px]">
                       <ArrowLeftRight size={13} className="text-primary-400 group-hover:rotate-180 transition-transform duration-300" />
                       <span>Cambiar a {area === 'Emergencia' ? 'Encamamiento' : 'Emergencia'}</span>
                     </span>
                     <span className="text-[9px] font-bold uppercase bg-primary-500/20 text-primary-300 px-1.5 py-0.5 rounded border border-primary-500/30">
                       Switch
                     </span>
                   </button>
                 </div>
               )}

               {/* Botón Estilizado de Cerrar Sesión */}
               <div className="pt-1">
                 <button 
                   onClick={handleLogout}
                   className="w-full py-2 px-3 bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/20 hover:border-rose-600 shadow-sm rounded-xl text-xs font-bold tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer group"
                 >
                    <LogOut size={14} className="group-hover:-translate-x-0.5 transition-transform" /> 
                    <span>Cerrar Sesión</span>
                 </button>
               </div>

               {/* Triangulito indicador sutil */}
               <div className="w-3 h-3 bg-slate-900 border-r border-b border-slate-800 rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2"></div>
            </div>
          )}

          <div 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center justify-between gap-2 cursor-pointer group hover:bg-white/[0.04] p-1.5 rounded-xl transition-all"
          >
             <div className="flex items-center gap-3 min-w-0">
               <div className="relative shrink-0">
                 <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold shadow-md shadow-primary-600/20 text-base group-hover:scale-105 transition-transform">
                    {userData?.nombre?.charAt(0) || 'U'}
                 </div>
                 <div className={`absolute bottom-0 right-0 w-3 h-3 ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'} border-2 border-slate-900 rounded-full shadow-sm`}></div>
               </div>
               <div className="flex flex-col min-w-0">
                 <span className="text-sm font-semibold text-white truncate leading-tight group-hover:text-primary-400 transition-colors">{userData?.nombre || 'Usuario'}</span>
                 <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mt-0.5">
                   {isSupervisor ? 'Supervisor' : isEncargado ? 'Encargado' : 'Enfermero'}
                 </span>
               </div>
             </div>
             <div className="text-slate-500 group-hover:text-slate-300 transition-all p-1 shrink-0">
               <ChevronUp size={16} className={`transition-transform duration-300 ${showUserMenu ? 'rotate-180 text-primary-400' : ''}`} />
             </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
