import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, secondaryAuth } from '../services/firebase';
import { collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { useData } from '../contexts/DataContext';
import Pagination from '../components/Pagination';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import Swal from 'sweetalert2';
import { 
  Users, 
  UserPlus, 
  KeyRound, 
  Settings, 
  ShieldAlert, 
  X, 
  Lock, 
  CheckCircle, 
  Ban,
  Pencil,
  Key,
  Search
} from 'lucide-react';

const getInitials = (name) => {
  if (!name || typeof name !== 'string') return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
};

const getAvatarStyle = (rol) => {
  if (rol === 'Supervisor de enfermería') {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200/80';
  }
  if (rol === 'Encargado de servicio') {
    return 'bg-amber-50 text-amber-700 border-amber-200/80';
  }
  if (rol === 'Administrador') {
    return 'bg-slate-100 text-slate-700 border-slate-300/80';
  }
  return 'bg-sky-50 text-sky-700 border-sky-200/80';
};

const Usuarios = () => {
  const { userData, currentUser, isAdmin } = useAuth();
  const { logAudit } = useData();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros y Paginación
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRol, setFilterRol] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 25;

  // Modales
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showReset, setShowReset] = useState(false);

  // Formularios
  const [addForm, setAddForm] = useState({ nombre: '', email: '', password: '', rol: 'Enfermero', activo: true });
  const [editForm, setEditForm] = useState({ uid: '', nombre: '', rol: 'usuario', activo: true });
  const [resetTarget, setResetTarget] = useState({ email: '', uid: '' });
  const [newPassword, setNewPassword] = useState('');

  const loadUsuarios = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'usuarios'));
      const data = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
      setUsuarios(data);
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Fallo al cargar usuarios', 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
       loadUsuarios();
    } else {
       setLoading(false);
    }
  }, [isAdmin]);

  // Cerrar modales con la tecla ESC
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showAdd) setShowAdd(false);
        if (showEdit) setShowEdit(false);
        if (showReset) setShowReset(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAdd, showEdit, showReset]);

  // Filtrado de usuarios
  let filteredUsers = [...usuarios];
  if (searchQuery && searchQuery.length >= 2) {
    const q = searchQuery.toLowerCase().trim();
    filteredUsers = filteredUsers.filter(u =>
      (u.nombre || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  }
  if (filterRol) {
    filteredUsers = filteredUsers.filter(u => {
      const rol = u.rol || 'Enfermero';
      if (filterRol === 'Enfermero') return rol === 'Enfermero' || rol === 'usuario' || !u.rol;
      return rol === filterRol;
    });
  }
  if (filterEstado) {
    filteredUsers = filteredUsers.filter(u => {
      if (filterEstado === 'activo') return u.activo === true || u.activo === undefined;
      if (filterEstado === 'bloqueado') return u.activo === false;
      return true;
    });
  }

  const totalPages = Math.ceil(filteredUsers.length / perPage) || 1;
  const currentUsers = filteredUsers.slice((currentPage - 1) * perPage, currentPage * perPage);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (addForm.password.length < 6) {
       return Swal.fire('Error', 'La contraseña debe tener mínimo 6 caracteres', 'error');
    }

    const cleanEmail = (addForm.email || '').trim().toLowerCase();
    const cleanNombre = (addForm.nombre || '').trim();
    let createdUser = null;

    try {
      setLoading(true);
      // Create user in secondary auth to prevent admin logout
      const credential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, addForm.password);
      createdUser = credential.user;

      await setDoc(doc(db, 'usuarios', createdUser.uid), {
          email: cleanEmail,
          nombre: cleanNombre,
          rol: addForm.rol,
          activo: addForm.activo,
          creadoEn: new Date()
       });

      await signOut(secondaryAuth);

      // 📝 Auditoría
      logAudit({
        modulo: 'Usuarios',
        accion: 'CREACIÓN',
        descripcion: `Alta de nuevo usuario: ${cleanNombre} (${cleanEmail})`,
        registroId: createdUser.uid
      });

      Swal.fire('¡Éxito!', 'Usuario registrado correctamente.', 'success');
      setShowAdd(false);
      setAddForm({ nombre: '', email: '', password: '', rol: 'Enfermero', activo: true });
      loadUsuarios();
    } catch (err) {
      console.error(err);
      // Si falló el registro en la base de datos Firestore, revertir creación en Auth
      if (createdUser) {
        try {
          await createdUser.delete();
        } catch (delErr) {
          console.error("Error al eliminar usuario huérfano de Auth:", delErr);
        }
      }
      await signOut(secondaryAuth).catch(() => {});

      let mensajeError = err.message;
      if (err.code === 'auth/email-already-in-use') {
        mensajeError = 'Este correo electrónico ya se encuentra registrado en el sistema.';
      } else if (err.code === 'permission-denied' || (err.message && err.message.includes('insufficient permissions'))) {
        mensajeError = 'No cuentas con los permisos suficientes para registrar este tipo de usuario.';
      }

      Swal.fire('Error al crear usuario', mensajeError, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEditStatus = async (e) => {
    e.preventDefault();
    if (editForm.email?.toLowerCase() === 'josuemoralessaj@gmail.com' && currentUser?.email?.toLowerCase() !== 'josuemoralessaj@gmail.com') {
      return Swal.fire('Acceso Restringido', 'No cuentas con los suficientes privilegios para modificar o degradar al Administrador Propietario del Sistema.', 'warning');
    }
    try {
      const userRef = doc(db, 'usuarios', editForm.uid);
      await updateDoc(userRef, {
         nombre: editForm.nombre,
         rol: editForm.rol,
         activo: editForm.activo === 'true' || editForm.activo === true || editForm.activo === 'ACTIVO'
      });

      // 📝 Auditoría
      logAudit({
        modulo: 'Usuarios',
        accion: 'MODIFICACIÓN',
        descripcion: `Modificación de perfil: ${editForm.nombre} (Rol: ${editForm.rol}, Activo: ${editForm.activo})`,
        registroId: editForm.uid
      });

      Swal.fire('Actualizado', 'Perfil modificado con éxito.', 'success');
      setShowEdit(false);
      loadUsuarios();
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo actualizar el estado', 'error');
    }
  };

  const handleManualReset = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
       return Swal.fire('Error', 'La nueva contraseña debe tener mínimo 6 caracteres', 'error');
    }

    try {
      setLoading(true);
      await sendPasswordResetEmail(secondaryAuth, resetTarget.email);

      // 📝 Auditoría
      logAudit({
        modulo: 'Usuarios',
        accion: 'SEGURIDAD',
        descripcion: `Envío de reseteo de clave para: ${resetTarget.email}`,
        registroId: resetTarget.uid
      });

      Swal.fire('Enviado', 'Se envió un correo de recuperación al usuario.', 'success');
      setShowReset(false);
      setNewPassword('');
    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="glass-card w-full max-w-sm rounded-3xl animate-zoom-in border border-white/50 shadow-sm flex flex-col items-center">
           <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mb-6 border border-rose-100">
             <Lock size={28} />
           </div>
           <h2 className="text-xl font-bold text-slate-800 mb-2 tracking-tight">Acceso Privado</h2>
           <p className="text-slate-500 text-xs font-normal leading-relaxed mb-6">Esta sección es de uso exclusivo para Supervisores de enfermería.</p>
           <button onClick={() => window.history.back()} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm">Regresar al Panel</button>
        </div>
      </div>
    );
  }

  // Calcular estadísticas de usuarios
  const stats = {
    total: usuarios.length,
    admin: usuarios.filter(u => u.rol === 'Administrador').length,
    supervisor: usuarios.filter(u => u.rol === 'Supervisor de enfermería').length,
    encargado: usuarios.filter(u => u.rol === 'Encargado de servicio').length,
    enfermero: usuarios.filter(u => u.rol === 'Enfermero' || u.rol === 'usuario' || !u.rol).length
  };

  return (
    <>
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1 mb-4 animate-fade-in-up">
        <div className="flex items-center gap-3.5">
           <div className="w-11 h-11 bg-white shadow-sm rounded-2xl flex items-center justify-center border border-slate-100/60 shrink-0">
             <Users className="text-primary-600" size={20} />
           </div>
           <div>
             <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-tight">Gestión de Usuarios</h1>
             <p className="text-slate-400 text-[11px] font-medium mt-0.5 flex items-center gap-1.5">
               <span>Personal con acceso al sistema</span>
               <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>
               <span className="text-emerald-600 font-semibold text-[10px] uppercase tracking-wider">Control de Permisos</span>
             </p>
           </div>
        </div>
        
        <button 
          onClick={() => setShowAdd(true)}
          className="flex items-center justify-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl font-semibold text-xs shadow-xs transition-all active:scale-95 h-[38px] shrink-0"
        >
          <UserPlus size={15} /> Agregar usuario
        </button>
      </header>

      {/* Sección de Filtros */}
      <section className="glass-card p-2.5 px-3.5 rounded-2xl border border-white/60 shadow-xs animate-fade-in-up mb-2.5 shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
          
          {/* Búsqueda */}
          <div className="md:col-span-6 space-y-1">
             <label className="text-[11px] font-semibold text-slate-500 block ml-1">Búsqueda inteligente</label>
             <div className="relative group">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary-600 transition-colors">
                 <Search size={14} />
               </div>
               <input 
                 type="text" 
                 placeholder="Buscar por nombre o correo..." 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full pl-8 pr-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner placeholder:text-slate-400 font-medium"
               />
             </div>
          </div>
          
          {/* Nivel de Acceso */}
          <div className="md:col-span-3 space-y-1">
             <label className="text-[11px] font-semibold text-slate-500 block ml-1">Nivel de acceso</label>
             <select 
               value={filterRol} 
               onChange={(e) => setFilterRol(e.target.value)} 
               className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs text-slate-700 outline-none focus:bg-white focus:border-primary-500/50 transition-all shadow-inner font-medium"
             >
               <option value="">Todos los roles</option>
               <option value="Administrador">Administrador</option>
               <option value="Supervisor de enfermería">Supervisor</option>
               <option value="Encargado de servicio">Encargado</option>
               <option value="Enfermero">Enfermero</option>
             </select>
          </div>

          {/* Estado */}
          <div className="md:col-span-3 space-y-1">
             <label className="text-[11px] font-semibold text-slate-500 block ml-1">Estado</label>
             <select 
               value={filterEstado} 
               onChange={(e) => setFilterEstado(e.target.value)} 
               className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs text-slate-700 outline-none focus:bg-white focus:border-primary-500/50 transition-all shadow-inner font-medium"
             >
               <option value="">Todos</option>
               <option value="activo">Activo</option>
               <option value="bloqueado">Bloqueado</option>
             </select>
          </div>

        </div>
      </section>

      {/* Tabla de Usuarios Desktop (md en adelante) */}
      <div className="hidden md:flex flex-col flex-1 min-h-0 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm font-data mb-0">
        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
              <tr className="bg-slate-50/50">
                <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 tracking-wide">Usuario</th>
                <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center">Nivel de acceso</th>
                <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center">Estado</th>
                <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredUsers.length === 0 ? (
                <tr><td colSpan="4" className="py-16 text-center text-slate-400 italic font-semibold text-xs">Sin usuarios coincidentes.</td></tr>
              ) : (
                currentUsers.map(u => {
                  const nombreFormateado = u.nombre 
                    ? u.nombre.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
                    : '—';
                  const initials = getInitials(u.nombre);

                  return (
                    <tr key={u.uid} className="hover:bg-slate-100/70 transition-colors group">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0 border ${getAvatarStyle(u.rol)}`}>
                            {initials}
                          </div>
                          <div className="flex flex-col">
                             <span className="font-semibold text-slate-900 text-[13px] leading-tight mb-0.5">{nombreFormateado}</span>
                             <span className="text-[11px] text-slate-400 font-normal">{u.email}</span>
                          </div>
                        </div>
                      </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold tracking-wide border ${
                        u.email?.toLowerCase() === 'josuemoralessaj@gmail.com' ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold' :
                        u.rol === 'Supervisor de enfermería' ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 
                        u.rol === 'Encargado de servicio' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                        u.rol === 'Administrador' ? 'bg-slate-100 border-slate-300 text-slate-800' :
                        'bg-slate-100 border-slate-200 text-slate-700'
                      }`}>
                         {u.email?.toLowerCase() === 'josuemoralessaj@gmail.com' ? 'Super Admin (Propietario)' : (u.rol || 'Enfermero')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                         <span className={`w-1.5 h-1.5 rounded-full ${u.activo ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                         <span className={`text-[10px] font-semibold tracking-wide ${u.activo ? 'text-emerald-700' : 'text-rose-600'}`}>
                           {u.activo ? 'Activo' : 'Bloqueado'}
                         </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => {
                            if (u.email?.toLowerCase() === 'josuemoralessaj@gmail.com' && currentUser?.email?.toLowerCase() !== 'josuemoralessaj@gmail.com') {
                              return Swal.fire('Acceso Restringido', 'No cuentas con los suficientes privilegios para editar o degradar al Administrador Propietario del Sistema.', 'warning');
                            }
                            setEditForm({ uid: u.uid, email: u.email, nombre: u.nombre, rol: u.rol || 'Enfermero', activo: u.activo });
                            setShowEdit(true);
                          }}
                          className="font-sans inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-primary-50/80 text-primary-700 border border-primary-100/80 rounded-lg text-[11px] font-medium tracking-wide hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all active:scale-95"
                        >
                          <Pencil size={11} />
                          Editar
                        </button>
                        <button 
                          onClick={() => {
                            setResetTarget({ email: u.email, uid: u.uid });
                            setNewPassword('');
                            setShowReset(true);
                          }}
                          className="font-sans inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-slate-50 text-slate-600 border border-slate-200/60 rounded-lg text-[11px] font-medium tracking-wide hover:bg-slate-800 hover:text-white hover:border-slate-800 transition-all active:scale-95"
                        >
                          <Key size={11} />
                          Clave
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
          {loading && (
            <div className="p-16 text-center text-slate-400 italic text-xs font-semibold uppercase tracking-wider animate-pulse">
               Cargando usuarios...
            </div>
          )}
        </div>

        {/* Barra de Paginación Fija Abajo */}
        <Pagination 
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredUsers.length}
          pageSize={perPage}
          onPageChange={setCurrentPage}
          itemLabel="usuarios"
          extraContent={
            <div className="flex items-center gap-2.5 text-[11px] font-medium text-slate-500">
              {stats.admin > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>{stats.admin} Admin</span>}
              {stats.supervisor > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>{stats.supervisor} Supervisor</span>}
              {stats.encargado > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>{stats.encargado} Encargado</span>}
              {stats.enfermero > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>{stats.enfermero} Enfermeros</span>}
            </div>
          }
        />
      </div>

      {/* Vista Móvil (Menor a md - Sin Desplazamiento Horizontal) */}
      <div className="block md:hidden space-y-3 font-data">
        {loading ? (
          <div className="p-12 text-center text-slate-400 italic text-xs font-semibold bg-white rounded-2xl border border-slate-100 animate-pulse">
             Cargando usuarios...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 italic text-xs font-semibold bg-white rounded-2xl border border-slate-100">
             Sin usuarios coincidentes.
          </div>
        ) : (
          currentUsers.map(u => {
            const nombreFormateado = u.nombre 
              ? u.nombre.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
              : '—';
            const initials = getInitials(u.nombre);

            return (
              <div key={u.uid} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0 border ${getAvatarStyle(u.rol)}`}>
                      {initials}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900 text-[13px] leading-tight">{nombreFormateado}</span>
                      <span className="text-[11px] text-slate-400 font-normal">{u.email}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-50 text-xs">
                   <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-semibold border ${
                     u.rol === 'Supervisor de enfermería' ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 
                     u.rol === 'Encargado de servicio' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                     u.rol === 'Administrador' ? 'bg-slate-100 border-slate-300 text-slate-800' :
                     'bg-slate-100 border-slate-200 text-slate-700'
                   }`}>
                      {u.rol || 'Enfermero'}
                   </span>

                   <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${u.activo ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                      <span className={`text-[10px] font-semibold ${u.activo ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {u.activo ? 'Activo' : 'Bloqueado'}
                      </span>
                   </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                   <button 
                     onClick={() => {
                       if (u.email?.toLowerCase() === 'josuemoralessaj@gmail.com' && currentUser?.email?.toLowerCase() !== 'josuemoralessaj@gmail.com') {
                         return Swal.fire('Acceso Restringido', 'No cuentas con los suficientes privilegios para editar o degradar al Administrador Propietario del Sistema.', 'warning');
                       }
                       setEditForm({ uid: u.uid, email: u.email, nombre: u.nombre, rol: u.rol || 'Enfermero', activo: u.activo });
                       setShowEdit(true);
                     }}
                     className="font-sans inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-primary-50/80 text-primary-700 border border-primary-100/80 rounded-lg text-[11px] font-medium hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all"
                   >
                     <Pencil size={11} /> Editar
                   </button>
                   <button 
                     onClick={() => {
                       setResetTarget({ email: u.email, uid: u.uid });
                       setNewPassword('');
                       setShowReset(true);
                     }}
                     className="font-sans inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-slate-50 text-slate-600 border border-slate-200/60 rounded-lg text-[11px] font-medium hover:bg-slate-800 hover:text-white hover:border-slate-800 transition-all"
                   >
                     <Key size={11} /> Clave
                   </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: RESETEAR CONTRASEÑA */}
      {showReset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in text-center">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl relative overflow-hidden animate-zoom-in border border-white/50">
             <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                   <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
                     <KeyRound className="text-amber-500" size={18} /> Resetear Acceso
                   </h2>
                   <button onClick={() => setShowReset(false)} className="text-slate-300 hover:text-rose-500 transition-colors"><X size={18} /></button>
                </div>

                <div className="space-y-6">
                   <div className="text-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Usuario Destino:</p>
                      <p className="font-semibold text-slate-700 text-xs truncate">{resetTarget.email}</p>
                   </div>
                   
                   <form onSubmit={handleManualReset} className="space-y-4">
                      <p className="text-xs text-slate-500 text-left leading-relaxed">
                        Se enviará un correo seguro al usuario para que pueda restablecer su contraseña.
                      </p>

                      <button 
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 px-6 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold uppercase tracking-wider text-xs shadow-md transition-all active:scale-95 disabled:opacity-50"
                      >
                         {loading ? 'Enviando...' : 'Enviar Correo de Reseteo'}
                      </button>
                   </form>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR PERFIL */}
      {showEdit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-zoom-in relative">
             <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                   <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
                     <Settings className="text-primary-500" size={18} /> Modificar perfil
                   </h2>
                   <button onClick={() => setShowEdit(false)} className="text-slate-300 hover:text-rose-500 transition-colors p-1 rounded-lg"><X size={18} /></button>
                </div>
                
                <form onSubmit={handleEditStatus} className="space-y-4">
                   <div className="text-left space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 block ml-1">Nombre completo</label>
                      <input 
                        type="text" 
                        value={editForm.nombre}
                        onChange={e => setEditForm({...editForm, nombre: e.target.value})}
                        className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium" 
                      />
                   </div>
                   
                   <div className="text-left space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 block ml-1">Nivel de acceso</label>
                      <select 
                         value={editForm.rol}
                         onChange={e => setEditForm({...editForm, rol: e.target.value})}
                         className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium"
                      >
                         <option value="Enfermero">Enfermero (Básico)</option>
                         <option value="Encargado de servicio">Encargado de servicio (Intermedio)</option>
                         <option value="Supervisor de enfermería">Supervisor de enfermería (Maestro)</option>
                      </select>
                   </div>

                   <div className="text-left space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 block ml-1">Estado de cuenta</label>
                      <div className="p-1 bg-slate-100/80 rounded-2xl flex gap-1 border border-slate-200/50">
                         <button 
                           type="button" 
                           onClick={() => setEditForm({ ...editForm, activo: true })} 
                           className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                             editForm.activo 
                               ? 'bg-emerald-500 text-white shadow-xs' 
                               : 'text-slate-500 hover:text-slate-700'
                           }`}
                         >
                           <CheckCircle size={13} />
                           Activo
                         </button>
                         <button 
                           type="button" 
                           onClick={() => setEditForm({ ...editForm, activo: false })} 
                           className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                             !editForm.activo 
                               ? 'bg-rose-500 text-white shadow-xs' 
                               : 'text-slate-500 hover:text-slate-700'
                           }`}
                         >
                           <X size={13} />
                           Bloqueado
                         </button>
                      </div>
                   </div>

                   <div className="flex items-center gap-2 pt-3">
                      <button 
                        type="button" 
                        onClick={() => setShowEdit(false)} 
                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-semibold text-xs transition-all active:scale-95"
                      >
                        Cancelar
                      </button>
                      <button type="submit" className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold text-xs tracking-wide shadow-md transition-all active:scale-95">
                         <CheckCircle size={14} />
                         Guardar cambios
                      </button>
                   </div>
                </form>
             </div>
          </div>
        </div>
      )}

      {/* MODAL: NUEVO ACCESO */}
      {showAdd && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl relative overflow-hidden animate-zoom-in border border-white/50">
             <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                   <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2"><UserPlus className="text-primary-500" size={18} /> Creación de nuevo usuario</h2>
                   <button onClick={() => setShowAdd(false)} className="text-slate-300 hover:text-rose-500 transition-colors p-1 rounded-lg"><X size={18} /></button>
                </div>
                
                <form onSubmit={handleAdd} className="space-y-4">
                   <div className="text-left space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 block ml-1">Nombre completo</label>
                      <input 
                        type="text" 
                        required
                        value={addForm.nombre}
                        onChange={e => setAddForm({...addForm, nombre: e.target.value})}
                        className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner placeholder:text-slate-400 font-medium"
                        placeholder="Nombre y apellido"
                      />
                   </div>
                   <div className="text-left space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 block ml-1">Email institucional</label>
                      <input 
                        type="email" 
                        required
                        value={addForm.email}
                        onChange={e => setAddForm({...addForm, email: e.target.value})}
                        className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner placeholder:text-slate-400 font-medium" 
                        placeholder="correo@ejemplo.com"
                      />
                   </div>
                   <div className="text-left space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 block ml-1">Clave temporal</label>
                      <input 
                        type="password" 
                        required
                        value={addForm.password}
                        onChange={e => setAddForm({...addForm, password: e.target.value})}
                        className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner placeholder:text-slate-400 font-medium" 
                        placeholder="Mín. 6 caracteres"
                      />
                   </div>
                   <div className="text-left space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 block ml-1">Nivel de acceso</label>
                      <select 
                        value={addForm.rol}
                        onChange={e => setAddForm({...addForm, rol: e.target.value})}
                        className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium"
                      >
                        <option value="Enfermero">Enfermero (Básico)</option>
                        <option value="Encargado de servicio">Encargado de servicio (Intermedio)</option>
                        <option value="Supervisor de enfermería">Supervisor de enfermería (Maestro)</option>
                      </select>
                   </div>
                   <div className="text-left space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 block ml-1">Estado</label>
                      <div className="p-1 bg-slate-100/80 rounded-2xl flex gap-1 border border-slate-200/50">
                         <button 
                           type="button" 
                           onClick={() => setAddForm({ ...addForm, activo: true })} 
                           className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                             addForm.activo 
                               ? 'bg-emerald-500 text-white shadow-xs' 
                               : 'text-slate-500 hover:text-slate-700'
                           }`}
                         >
                           <CheckCircle size={13} />
                           Activo
                         </button>
                         <button 
                           type="button" 
                           onClick={() => setAddForm({ ...addForm, activo: false })} 
                           className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                             !addForm.activo 
                               ? 'bg-rose-500 text-white shadow-xs' 
                               : 'text-slate-500 hover:text-slate-700'
                           }`}
                         >
                           <X size={13} />
                           Bloqueado
                         </button>
                      </div>
                   </div>

                   <div className="flex items-center gap-2 pt-3">
                      <button 
                        type="button" 
                        onClick={() => setShowAdd(false)} 
                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-semibold text-xs transition-all active:scale-95"
                      >
                        Cancelar
                      </button>
                      <button type="submit" disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold text-xs tracking-wide shadow-md transition-all active:scale-95 disabled:opacity-50">
                         <CheckCircle size={14} />
                         {loading ? 'Registrando...' : 'Registrar usuario'}
                      </button>
                   </div>
                </form>
             </div>
          </div>
        </div>
      )}

    </>
  );
};

export default Usuarios;
