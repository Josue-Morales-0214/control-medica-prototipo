import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useArea } from '../contexts/AreaContext';
import { useData } from '../contexts/DataContext';
import { db } from '../services/firebase';
import { collection, query, where, limit, getDocs, doc, setDoc, deleteDoc, runTransaction, getDoc, serverTimestamp, increment } from 'firebase/firestore';
import Swal from 'sweetalert2';
import Pagination from '../components/Pagination';
import { CATEGORIAS_DETALLADAS, getMasterCategory } from '../utils/constants';
import { 
  Boxes, 
  Search, 
  Plus, 
  ChevronDown, 
  ChevronRight,
  Pencil,
  Info,
  Wrench,
  X,
  CheckCircle,
  EyeOff,
  DollarSign
} from 'lucide-react';

const Inventario = () => {
  const { userData, currentUser, isAdmin, isSupervisor, isEncargado } = useAuth();
  const { area } = useArea();
  const { insumos: allInsumos, loading: dataLoading, logAudit, categorias: dynamicCategories } = useData();
  const navigate = useNavigate();
  const location = useLocation();

  const activeCategoryList = React.useMemo(() => {
    if (dynamicCategories && dynamicCategories.length > 0) {
      return dynamicCategories.filter(c => c.activa !== false).map(c => c.nombre);
    }
    return CATEGORIAS_DETALLADAS;
  }, [dynamicCategories]);

  const [loading, setLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterMasterCat, setFilterMasterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterExpiry, setFilterExpiry] = useState('');
  const [expiringCodigos, setExpiringCodigos] = useState(null);

  // Escuchar estado de navegación desde el Dashboard
  useEffect(() => {
    if (location.state) {
      if (location.state.filterStatus) {
        setFilterStatus(location.state.filterStatus);
        setFilterMasterCat('');
        setCurrentPage(1);
      }
      if (location.state.filterExpiry) {
        setFilterExpiry(location.state.filterExpiry);
        if (location.state.expiringCodigos) {
          setExpiringCodigos(new Set(location.state.expiringCodigos.map(c => String(c))));
        }
        setFilterMasterCat('');
        setCurrentPage(1);
      }
      if (location.state.masterCategory) {
        setFilterMasterCat(location.state.masterCategory);
        setFilterCat('');
        setCurrentPage(1);
      }
    }
  }, [location.state]);

  // Carga quirúrgica de lotes próximos a vencer si el usuario selecciona el filtro manualmente en el dropdown
  useEffect(() => {
    if (filterExpiry === '30' && !expiringCodigos && area) {
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
      getDocs(q).then(snap => {
        const codes = snap.docs.map(d => d.data()).filter(l => l.cantidad > 0).map(l => String(l.codigo_insumo));
        setExpiringCodigos(new Set(codes));
      }).catch(err => console.error("Error fetching expiring lotes:", err));
    } else if (!filterExpiry) {
      setExpiringCodigos(null);
    }
  }, [filterExpiry, area, expiringCodigos]);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 50;

  // Lotes Expandidos (Carga bajo demanda para ahorro de lecturas)
  const [expandedRows, setExpandedRows] = useState({}); // { [codigo]: boolean }
  const [lotesCargados, setLotesCargados] = useState({}); // { codigoInsumo: [lotes...] }
  const [loadingLotes, setLoadingLotes] = useState(false);

  const { getLotesByInsumo } = useData();

  // Modales
  const [showNewModal, setShowNewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAjusteModal, setShowAjusteModal] = useState(false);
  const [ajusteData, setAjusteData] = useState({
    loteObj: null,
    insumoObj: null,
    nuevaCantidad: '',
    motivo: ''
  });
  
  // Cerrar modales con ESC
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showNewModal) setShowNewModal(false);
        if (showEditModal) setShowEditModal(false);
        if (showAjusteModal) setShowAjusteModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNewModal, showEditModal, showAjusteModal]);

  // Controles de Vista y Herramientas (Admin / Supervisor / Encargado)
  const canManage = isAdmin || isSupervisor || isEncargado;
  const [showDisabled, setShowDisabled] = useState(false);
  const [showPrices, setShowPrices] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Formularios
  const [newInsumo, setNewInsumo] = useState({ codigo: '', nombre: '', categoria: CATEGORIAS_DETALLADAS[0], stock_bajo: 10, precio_unitario: '', activo: true });
  const [editInsumo, setEditInsumo] = useState({ codigoOrig: '', codigo: '', nombre: '', categoria: '', stock_bajo: 10, precio_unitario: '', lotes: [] });

  // Derived state (Filtros y Paginacion Frontend)
  let filtered = allInsumos.filter(i => {
    if (canManage && showDisabled) {
      return i.activo === false;
    }
    return i.activo !== false;
  });
  if (filterCat) {
    filtered = filtered.filter(i => i.categoria === filterCat);
  } else if (filterMasterCat) {
    filtered = filtered.filter(i => getMasterCategory(i.categoria) === filterMasterCat);
  }
  if (filterQuery && filterQuery.length >= 3) {
    const qLower = filterQuery.toLowerCase().trim();
    filtered = filtered.filter(i => 
      (i.nombre || '').toLowerCase().includes(qLower) || 
      String(i.codigo || '').toLowerCase().includes(qLower)
    );
  }
  if (filterStatus) {
    filtered = filtered.filter(i => {
      const stock = i.stock_actual || 0;
      const min = i.stock_bajo || 10;
      if (filterStatus === 'agotado') return stock === 0;
      if (filterStatus === 'bajo') return stock > 0 && stock <= min;
      if (filterStatus === 'estable') return stock > min;
      return true;
    });
  }
  if (filterExpiry === '30') {
    if (expiringCodigos) {
      filtered = filtered.filter(i => expiringCodigos.has(String(i.codigo)));
    }
  }

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const currentItems = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const toggleLotes = async (codigo) => {
    setExpandedRows(prev => ({ ...prev, [codigo]: !prev[codigo] }));
    
    // Si ya los cargamos en esta sesión, no volver a gastar lecturas
    if (lotesCargados[codigo]) return;

    setLoadingLotes(true);
    try {
      const data = await getLotesByInsumo(codigo);
      setLotesCargados(prev => ({ ...prev, [codigo]: data }));
    } catch (err) {
      console.error("Error cargando lotes:", err);
    } finally {
      setLoadingLotes(false);
    }
  };

  const handleOpenAjuste = (lote, insumo) => {
      setAjusteData({ loteObj: lote, insumoObj: insumo, nuevaCantidad: String(lote.cantidad), fechaVencimiento: lote.fecha_vencimiento || '', motivo: '' });
      setShowAjusteModal(true);
  };

  const handleAjusteSubmit = async (e) => {
      e.preventDefault();
      try {
          const { loteObj, insumoObj, nuevaCantidad, fechaVencimiento, motivo } = ajusteData;
          const qty = parseInt(nuevaCantidad);
          if (qty < 0) return;

          const loteRef = doc(db, 'lotes', loteObj.id);
          const insumoRef = doc(db, 'insumos', `${area}_${insumoObj.codigo}`);

          let ajusteAuditPayload = null;
          await runTransaction(db, async (t) => {
              const currentLoteSnap = await t.get(loteRef);
              const currentInsumoSnap = await t.get(insumoRef);
              
              if (!currentLoteSnap.exists()) throw new Error("Lote no encontrado");
              
              const currentLoteData = currentLoteSnap.data();
              const diff = qty - currentLoteData.cantidad;
              const vencimientoChanged = fechaVencimiento !== (currentLoteData.fecha_vencimiento || '');

              const loteUpdate = { cantidad: qty };
              if (vencimientoChanged) {
                loteUpdate.fecha_vencimiento = fechaVencimiento;
              }

              t.update(loteRef, loteUpdate);
              
              if (diff !== 0) {
                t.update(insumoRef, { stock_actual: (currentInsumoSnap.data().stock_actual || 0) + diff });
              }

              // Solo registrar movimiento si hubo cambio real
              const cambios = [];
              if (diff !== 0) cambios.push(`Stock: ${currentLoteData.cantidad} → ${qty}`);
              if (vencimientoChanged) cambios.push(`Vencimiento: ${currentLoteData.fecha_vencimiento || '---'} → ${fechaVencimiento || '---'}`);

              if (cambios.length > 0) {
                t.set(doc(collection(db, 'movimientos')), {
                    tipo: 'AJUSTE',
                    area,
                    codigo_insumo: String(insumoObj.codigo),
                    nombre_insumo: insumoObj.nombre,
                    lote: loteObj.lote,
                    cantidad: Math.abs(diff),
                    tipo_ajuste: diff > 0 ? 'INCREMENTO' : (diff < 0 ? 'DECREMENTO' : 'CORRECCIÓN'),
                    motivo: `${motivo}${cambios.length > 0 ? ' | Cambios: ' + cambios.join(', ') : ''}`,
                    fecha: new Date().toISOString().split('T')[0],
                    fecha_registro: serverTimestamp(),
                    registrado_por: userData?.nombre || currentUser?.email
                });

                const metaRef = doc(db, 'metadata', `${area}_meta`);
                t.set(metaRef, { 
                  totalMovimientos: increment(1),
                  ultima_actualizacion: serverTimestamp() 
                }, { merge: true });

                ajusteAuditPayload = {
                  modulo: 'Inventario',
                  accion: 'AJUSTE_INVENTARIO',
                  descripcion: `Ajuste manual de existencias en insumo: ${insumoObj.nombre} (Cód: ${insumoObj.codigo}, Lote: ${loteObj.lote}) — Cambios: [${cambios.join(' | ')}]`,
                  motivo: motivo,
                  registroId: loteObj.id
                };
              }
          });

          if (ajusteAuditPayload) {
            logAudit(ajusteAuditPayload);
          }
          Swal.fire('Éxito', 'Lote actualizado correctamente.', 'success');
          setShowAjusteModal(false);
          // Forzar recarga de lotes del insumo (limpiar caché)
          setLotesCargados(prev => { const copy = {...prev}; delete copy[insumoObj.codigo]; return copy; });
          // Si la fila estaba expandida, recargar datos frescos
          if (expandedRows[insumoObj.codigo]) {
            const freshData = await getLotesByInsumo(insumoObj.codigo);
            setLotesCargados(prev => ({ ...prev, [insumoObj.codigo]: freshData }));
          }
      } catch (err) {
          Swal.fire('Error', err.message, 'error');
      }
  };

  const handleCreateInsumo = async (e) => {
    e.preventDefault();
    try {
      if (!newInsumo.codigo || !newInsumo.nombre) return;
      const refId = `${area}_${newInsumo.codigo}`;
      
      const docRef = doc(db, 'insumos', refId);
      const existing = await getDoc(docRef);

      if (existing.exists()) {
        const data = existing.data();
        if (data.activo !== false) {
           Swal.fire('Código en uso', `El insumo con código '${newInsumo.codigo}' ya existe y está activo.`, 'warning');
           return;
        } else {
           const isDifferentName = (data.nombre || '').toUpperCase().trim() !== (newInsumo.nombre || '').toUpperCase().trim();

           const { isConfirmed } = await Swal.fire({
             title: 'Insumo deshabilitado encontrado',
             html: `El código <b>#${data.codigo}</b> pertenece al insumo deshabilitado <b>"${data.nombre}"</b>.<br/><br/>` +
                   (isDifferentName 
                     ? `<div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 1rem; padding: 0.75rem; text-align: left; font-size: 11px; color: #92400e; margin-bottom: 0.75rem;">
                          ⚠️ <b>Diferencia de Nombre:</b> Intentas registrarlo como <b>"${newInsumo.nombre}"</b>, pero el registro original se llama <b>"${data.nombre}"</b>.
                        </div>
                        ¿Deseas reactivar el insumo original <b>"${data.nombre}"</b> o cancelar para asignar un código distinto a <b>"${newInsumo.nombre}"</b>?`
                     : `¿Deseas volver a activarlo como insumo operativo?`),
             icon: 'question',
             showCancelButton: true,
             confirmButtonText: isDifferentName ? `Sí, reactivar "${data.nombre}"` : 'Sí, reactivar insumo',
             cancelButtonText: 'Cancelar y cambiar código',
             confirmButtonColor: '#10b981',
             cancelButtonColor: '#94a3b8',
             customClass: {
               popup: 'rounded-[2rem]',
               confirmButton: 'rounded-xl font-bold text-xs px-5 py-3',
               cancelButton: 'rounded-xl font-bold text-xs px-5 py-3'
             }
           });

           if (isConfirmed) {
              await setDoc(docRef, {
                nombre: newInsumo.nombre || data.nombre,
                categoria: newInsumo.categoria || data.categoria,
                stock_bajo: parseInt(newInsumo.stock_bajo) || data.stock_bajo || 10,
                precio_unitario: parseFloat(newInsumo.precio_unitario) || data.precio_unitario || 0,
                activo: newInsumo.activo !== undefined ? newInsumo.activo : true,
                fecha_reactivacion: new Date()
              }, { merge: true });

              logAudit({
                modulo: 'Inventario',
                accion: 'REACTIVACIÓN',
                descripcion: `Reactivación de insumo deshabilitado: ${newInsumo.nombre} (#${newInsumo.codigo})`
              });

              setShowNewModal(false);
              Swal.fire('Insumo reactivado', `El insumo '${newInsumo.nombre || data.nombre}' se ha habilitado nuevamente.`, 'success');
              return;
           } else {
              return;
           }
        }
      }

      await setDoc(docRef, {
        codigo: newInsumo.codigo,
        nombre: newInsumo.nombre,
        categoria: newInsumo.categoria,
        stock_bajo: parseInt(newInsumo.stock_bajo) || 10,
        precio_unitario: parseFloat(newInsumo.precio_unitario) || 0,
        stock_actual: 0,
        area: area,
        activo: newInsumo.activo !== undefined ? newInsumo.activo : true,
        fecha_creacion: new Date(),
        ubicacion: 'Por definir'
      }, { merge: true });

      setShowNewModal(false);
      
      const { value: goToMovements } = await Swal.fire({
        title: '¡Insumo Creado!',
        text: '¿Deseas registrar la carga inicial de este insumo ahora mismo?',
        icon: 'success',
        showCancelButton: true,
        confirmButtonText: 'Sí, ir a Ingresos',
        cancelButtonText: 'No, después',
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#94a3b8',
        customClass: {
          popup: 'rounded-[2rem]',
          confirmButton: 'rounded-xl font-bold uppercase text-[10px] px-6 py-3',
          cancelButton: 'rounded-xl font-bold uppercase text-[10px] px-6 py-3'
        }
      });

      // 📜 AUDITORÍA: Registro de Creación único
      logAudit({
        modulo: 'Inventario',
        accion: 'CREACIÓN',
        descripcion: `Creación de nuevo insumo: ${newInsumo.nombre} (Código: ${newInsumo.codigo})`,
        registroId: newInsumo.codigo
      });

      if (goToMovements) {
        // Capturamos datos antes de limpiar el estado
        const preSelect = {
          codigo: newInsumo.codigo,
          nombre: newInsumo.nombre
        };
        navigate('/movimientos', { 
          state: { 
            preSelectInsumo: preSelect,
            isInitialLoad: true
          } 
        });
      }

      setNewInsumo({ codigo: '', nombre: '', categoria: 'Medicamento', stock_bajo: 10, precio_unitario: '' });
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  const openEditModal = (insumo) => {
    setEditInsumo({
      codigoOrig: insumo.codigo,
      codigo: insumo.codigo,
      nombre: insumo.nombre,
      categoria: insumo.categoria,
      stock_bajo: insumo.stock_bajo !== undefined ? insumo.stock_bajo : 10,
      precio_unitario: insumo.precio_unitario !== undefined && insumo.precio_unitario !== null ? insumo.precio_unitario : '',
      activo: insumo.activo !== false
    });
    setShowEditModal(true);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
        const oldRefId = `${area}_${editInsumo.codigoOrig}`;
        const newRefId = `${area}_${editInsumo.codigo}`;
        const isCodeChange = oldRefId !== newRefId;

        if (isCodeChange && !isAdmin) {
             Swal.fire('Error', 'Solo el administrador puede cambiar códigos base.', 'error');
             setLoading(false);
             return;
        }

        await runTransaction(db, async (transaction) => {
            const oldInsumoRef = doc(db, 'insumos', oldRefId);
            const oldInsumoSnap = await transaction.get(oldInsumoRef);
            if (!oldInsumoSnap.exists()) throw new Error("El insumo original no existe.");

            const currentData = oldInsumoSnap.data();

            const newInsumoData = {
                ...currentData,
                codigo: editInsumo.codigo,
                nombre: editInsumo.nombre,
                categoria: editInsumo.categoria,
                stock_bajo: parseInt(editInsumo.stock_bajo) || 10,
                precio_unitario: parseFloat(editInsumo.precio_unitario) || 0,
                activo: editInsumo.activo !== false
            };

            if (isCodeChange) {
                const newInsumoRef = doc(db, 'insumos', newRefId);
                const newInsumoCheck = await transaction.get(newInsumoRef);
                if (newInsumoCheck.exists() && newInsumoCheck.data().activo) {
                    throw new Error(`El código "${editInsumo.codigo}" ya está en uso.`);
                }
                transaction.set(newInsumoRef, newInsumoData);
                transaction.delete(oldInsumoRef);

                // Migrar lotes si cambió el código base
                const lotesSnap = await getDocs(query(collection(db, 'lotes'), where('codigo_insumo', '==', String(editInsumo.codigoOrig)), where('area', '==', area)));
                lotesSnap.docs.forEach(d => {
                   const lData = d.data();
                   const loteIdSeguro = lData.lote.replace(/[^a-zA-Z0-9_-]/g, '_');
                   const newLoteId = `${area}_${editInsumo.codigo}_${loteIdSeguro}`;
                   transaction.set(doc(db, 'lotes', newLoteId), {
                      ...lData,
                      id: newLoteId,
                      codigo_insumo: String(editInsumo.codigo)
                   });
                   transaction.delete(d.ref);
                });
            } else {
                transaction.update(oldInsumoRef, newInsumoData);
            }
        });

        // 📝 Auditoría
        logAudit({
          modulo: 'Inventario',
          accion: 'MODIFICACIÓN',
          descripcion: `Edición de datos del insumo: ${editInsumo.nombre} (#${editInsumo.codigo}) - Estado: ${editInsumo.activo ? 'Habilitado' : 'Deshabilitado'}`,
          registroId: editInsumo.codigo
        });

        Swal.fire('¡Éxito!', 'Insumo actualizado correctamente.', 'success');
        setShowEditModal(false);
    } catch(err) {
        console.error(err);
        Swal.fire('Error', 'Fallo al guardar cambios: ' + err.message, 'error');
    } finally {
        setLoading(false);
    }
  };

  return (
    <>
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-1 mb-3.5 animate-fade-in-up">
        <div className="flex items-center gap-3.5">
           <div className="w-11 h-11 bg-white shadow-sm rounded-2xl flex items-center justify-center border border-slate-100/60 shrink-0">
             <Boxes className="text-primary-600" size={20} />
           </div>
           <div>
             <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-tight">Inventario de Insumos</h1>
             <p className="text-slate-400 text-[11px] font-medium mt-0.5 flex items-center gap-1.5">
               <span>Gestión de Medicamentos y Médico-quirúrgicos</span>
               <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>
               <span className="text-emerald-600 font-semibold text-[10px] uppercase tracking-wider">En Vivo</span>
             </p>
           </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
           {canManage && (
             <>
               {/* Riel Exclusivo: Habilitados / Deshabilitados */}
               <div className="p-0.5 bg-slate-100/90 rounded-full flex items-center gap-0.5 border border-slate-200/60 shadow-inner h-[34px]">
                  <button 
                    type="button" 
                    onClick={() => { setShowDisabled(false); setCurrentPage(1); }} 
                    className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      !showDisabled 
                        ? 'bg-emerald-500 text-white shadow-xs font-bold' 
                        : 'text-slate-500 hover:text-slate-700 font-medium'
                    }`}
                  >
                    <CheckCircle size={12} />
                    <span>Habilitados</span>
                  </button>

                  <button 
                    type="button" 
                    onClick={() => { setShowDisabled(true); setCurrentPage(1); }} 
                    className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      showDisabled 
                        ? 'bg-rose-500 text-white shadow-xs font-bold' 
                        : 'text-slate-500 hover:text-slate-700 font-medium'
                    }`}
                  >
                    <EyeOff size={12} />
                    <span>Deshabilitados</span>
                  </button>
               </div>

               {/* Botón Separado: Ver Precios */}
               <button
                 type="button"
                 onClick={() => setShowPrices(prev => !prev)}
                 className={`h-[34px] px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                   showPrices 
                     ? 'bg-slate-700 border-slate-700 text-white shadow-xs font-bold' 
                     : 'bg-slate-100/80 border-slate-200/60 text-slate-500 hover:text-slate-700 font-medium shadow-2xs'
                 }`}
                 title="Mostrar u ocultar columna de precio unitario"
               >
                 <span className={`font-bold text-[11px] ${showPrices ? 'text-white' : 'text-slate-400'}`}>Q.</span>
                 <span>Ver Precios</span>
               </button>

               {/* Botón Separado: Modo Edición (Solo Admin/Supervisor) */}
               {(isAdmin || isSupervisor) && (
                 <button
                   type="button"
                   onClick={() => setEditMode(prev => !prev)}
                   className={`h-[34px] px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                     editMode 
                       ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs font-bold' 
                       : 'bg-slate-100/80 border-slate-200/60 text-slate-500 hover:text-slate-700 font-medium shadow-2xs'
                   }`}
                   title="Activar u ocultar la columna de edición"
                 >
                   <Pencil size={12} className={editMode ? 'text-white' : 'text-slate-400'} />
                   <span>Modo Edición</span>
                 </button>
               )}
             </>
           )}

           {(isAdmin || isSupervisor) && (
             <button 
               className="flex items-center justify-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl font-semibold text-xs shadow-xs transition-all active:scale-95 h-[38px] shrink-0" 
               onClick={() => setShowNewModal(true)}
             >
               <Plus size={15} /> Nuevo Insumo
             </button>
           )}
        </div>
      </header>

      {/* Sección de Filtros Estándar */}
      <section className="glass-card p-2.5 px-3.5 rounded-2xl border border-white/60 shadow-xs animate-fade-in-up mb-2.5 shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
          
          {/* Búsqueda */}
          <div className="md:col-span-5 space-y-1">
             <label className="text-[11px] font-semibold text-slate-500 block ml-1">Búsqueda inteligente</label>
             <div className="relative group">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary-600 transition-colors">
                 <Search size={14} />
               </div>
               <input 
                 type="text" 
                 placeholder="Buscar por nombre o código..." 
                 value={filterQuery}
                 onChange={(e) => { setFilterQuery(e.target.value); setCurrentPage(1); }}
                 className="w-full pl-8 pr-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner placeholder:text-slate-400 font-medium"
               />
             </div>
          </div>
          
          {/* Categoría */}
          <div className="md:col-span-3 space-y-1">
             <div className="flex items-center justify-between ml-1">
                <label className="text-[11px] font-semibold text-slate-500 block">Categoría</label>
                {filterMasterCat && (
                   <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 text-[10px] font-bold">
                     {filterMasterCat}
                     <button onClick={() => setFilterMasterCat('')} className="hover:text-rose-600 ml-0.5"><X size={10} /></button>
                   </span>
                )}
             </div>
             <select 
               value={filterCat} 
               onChange={(e) => { setFilterCat(e.target.value); setFilterMasterCat(''); setCurrentPage(1); }} 
               className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs text-slate-700 outline-none focus:bg-white focus:border-primary-500/50 transition-all shadow-inner font-medium"
             >
               <option value="">{filterMasterCat ? `Todas (${filterMasterCat})` : "Todas las categorías"}</option>
               {activeCategoryList.map(cat => (
                 <option key={cat} value={cat}>{cat}</option>
               ))}
             </select>
          </div>

          {/* Estado de Stock */}
          <div className="md:col-span-2 space-y-1">
             <label className="text-[11px] font-semibold text-slate-500 block ml-1">Estado</label>
             <select 
               value={filterStatus} 
               onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }} 
               className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs text-slate-700 outline-none focus:bg-white focus:border-primary-500/50 transition-all shadow-inner font-medium"
             >
               <option value="">Todos</option>
               <option value="estable">Estable</option>
               <option value="bajo">Stock bajo</option>
               <option value="agotado">Agotado</option>
             </select>
          </div>

          {/* Vencimiento */}
          <div className="md:col-span-2 space-y-1">
             <label className="text-[11px] font-semibold text-slate-500 block ml-1">Vencimiento</label>
             <select 
               value={filterExpiry} 
               onChange={(e) => { 
                 setFilterExpiry(e.target.value); 
                 setExpiringCodigos(null); 
                 setCurrentPage(1); 
               }} 
               className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs text-slate-700 outline-none focus:bg-white focus:border-primary-500/50 transition-all shadow-inner font-medium"
             >
               <option value="">Todos</option>
               <option value="30">Próximos a vencer (≤ 30 días)</option>
             </select>
          </div>

        </div>
      </section>

      {/* Vista de Tabla Desktop (md en adelante) */}
      <div className="hidden md:flex flex-col flex-1 min-h-0 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm font-data mb-0">
        <div className="flex-1 overflow-y-auto min-h-0">
          {(() => {
            const showPricesCol = showPrices && canManage;
            const showActionsCol = editMode && (isAdmin || isSupervisor);
            const totalCols = 6 + (showPricesCol ? 1 : 0) + (showActionsCol ? 1 : 0);

            return (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
                  <tr className="bg-slate-50/50">
                    <th className="pl-4 pr-1 py-2.5 w-4"></th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide">Código</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide">Insumo médico / Medicamento</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide">Categoría</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center">Stock</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center">Estado</th>
                    {showPricesCol && (
                      <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-right">Precio U. (Q.)</th>
                    )}
                    {showActionsCol && (
                      <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-right">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {currentItems.length === 0 ? (
                    <tr><td colSpan={totalCols} className="py-16 text-center text-slate-400 italic font-semibold">Sin registros coincidentes en {area}.</td></tr>
                  ) : (
                    currentItems.map(item => {
                      const stock = item.stock_actual || 0;
                      const min = item.stock_bajo || 10;
                      const esAgotado = stock === 0;
                      const esBajo = stock > 0 && stock <= min;
                      
                      const hasLotes = stock > 0;
                      const isExpanded = !!expandedRows[item.codigo];
                      const nombreFormateado = item.nombre ? item.nombre.charAt(0).toUpperCase() + item.nombre.slice(1).toLowerCase() : '';

                      return (
                        <React.Fragment key={item.codigo}>
                          <tr 
                            onClick={() => hasLotes && toggleLotes(item.codigo)}
                            className={`hover:bg-slate-100/70 transition-colors group ${hasLotes ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-blue-50/70 border-l-4 border-l-primary-600' : ''}`}
                          >
                            <td className="pl-4 pr-1 py-3 text-center w-4">
                              {hasLotes && (
                                <ChevronRight size={13} className={`transition-transform duration-200 ${isExpanded ? 'rotate-90 text-primary-600' : 'text-slate-300 group-hover:text-slate-600'}`} />
                              )}
                            </td>
                            <td className="px-5 py-3 font-data text-[12px] font-medium text-slate-700">{item.codigo}</td>
                            <td className="px-5 py-3">
                               <span className="font-semibold text-slate-900 text-[13px] leading-tight block">{nombreFormateado}</span>
                            </td>
                            <td className="px-5 py-3">
                               <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/60">
                                 {item.categoria}
                               </span>
                            </td>
                            <td className="px-5 py-3 text-center font-semibold text-[13px]">
                               <span className={esAgotado ? 'text-rose-600 font-bold' : (esBajo ? 'text-amber-600 font-bold' : 'text-slate-800')}>
                                  {stock}
                               </span>
                            </td>
                            <td className="px-5 py-3 text-center">
                               <div className="flex flex-col items-center gap-0.5">
                                  {item.activo === false ? (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border bg-slate-100 border-slate-200 text-slate-500">
                                       <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                                       <span className="text-[10px] font-semibold">Deshabilitado</span>
                                    </div>
                                  ) : (
                                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border ${esAgotado ? 'bg-rose-50 border-rose-200 text-rose-700' : (esBajo ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700')}`}>
                                       <div className={`w-1.5 h-1.5 rounded-full ${esAgotado ? 'bg-rose-500 animate-pulse' : (esBajo ? 'bg-amber-500' : 'bg-emerald-500')}`}></div>
                                       <span className="text-[10px] font-semibold">
                                         {esAgotado ? 'Agotado' : (esBajo ? 'Bajo' : 'Estable')}
                                       </span>
                                    </div>
                                  )}
                                  <span className="text-[10px] font-normal text-slate-400 italic">Mín: {min}</span>
                               </div>
                            </td>
                            {showPricesCol && (
                              <td className="px-5 py-3 text-right font-data text-[12px] font-normal text-slate-600">
                                 {item.precio_unitario ? `Q ${parseFloat(item.precio_unitario).toFixed(2)}` : '---'}
                              </td>
                            )}
                            {showActionsCol && (
                              <td className="px-5 py-3 text-right">
                                 <button 
                                   onClick={(e) => { e.stopPropagation(); openEditModal(item); }} 
                                   className="font-sans inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-primary-50/80 text-primary-700 border border-primary-100/80 hover:bg-primary-600 hover:text-white hover:border-primary-600 rounded-lg text-[11px] font-medium transition-all active:scale-95"
                                 >
                                    <Pencil size={11} />
                                    Editar
                                 </button>
                              </td>
                            )}
                          </tr>

                          {/* Desglose de lotes expandido */}
                          {isExpanded && (
                            <tr className="bg-slate-50/80">
                               <td colSpan={totalCols} className="p-3 pl-8">
                                   <div className="space-y-1">
                                      <div className="text-[11px] font-semibold text-slate-500 mb-1.5 ml-0.5">Lotes y vencimientos activos</div>
                                      {(() => {
                                        const lotesInsumo = (lotesCargados[item.codigo] || []).filter(l => l.cantidad > 0);
                                        if (lotesInsumo.length > 0) {
                                           return (
                                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                {lotesInsumo.map(lote => {
                                                  const today = new Date();
                                                  const vDate = lote.fecha_vencimiento ? new Date(lote.fecha_vencimiento) : null;
                                                  const isVencido = vDate && vDate < today;
                                                  const isSoon = vDate && (vDate < new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000));
                                                  const statusColor = isVencido ? 'border-rose-500' : (isSoon ? 'border-amber-500' : 'border-blue-500');
                                                  return (
                                                   <div 
                                                     key={lote.id} 
                                                     onClick={(e) => { if (canManage) { e.stopPropagation(); handleOpenAjuste(lote, item); } }}
                                                     className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-l-[3px] shadow-2xs transition-all ${statusColor} ${
                                                       canManage 
                                                         ? 'bg-primary-50/40 border-slate-200/60 cursor-pointer hover:bg-primary-50 hover:border-primary-200 hover:shadow-sm active:scale-[0.98]' 
                                                         : 'bg-white border-slate-200/80'
                                                     }`}
                                                     title={canManage ? 'Clic para ajustar este lote' : ''}
                                                   >
                                                      <div className="flex items-center gap-1">
                                                         <span className="text-[10px] font-semibold text-slate-400">Lote:</span>
                                                         <span className="text-[11px] font-semibold text-slate-800 font-mono">{lote.lote}</span>
                                                      </div>
                                                      <div className="flex items-center gap-1">
                                                         <span className="text-[10px] font-semibold text-slate-400">Stock:</span>
                                                         <span className="text-[11px] font-semibold text-primary-600 leading-none">{lote.cantidad}</span>
                                                      </div>
                                                      <div className="flex items-center gap-1.5 shrink-0">
                                                         <span className="text-[10px] font-semibold text-slate-400">Vence:</span>
                                                         <span className={`text-[11px] font-semibold ${isVencido ? 'text-rose-500' : (isSoon ? 'text-amber-600' : 'text-blue-600')}`}>
                                                            {lote.fecha_vencimiento || '---'}
                                                         </span>
                                                         {canManage && (
                                                            <Wrench size={11} className="text-primary-400/60 ml-0.5" />
                                                         )}
                                                      </div>
                                                   </div>
                                                 )})}
                                             </div>
                                           );
                                        }
                                        return <div className="py-2 px-3 bg-white/80 rounded-xl border border-dashed border-slate-200 text-center italic text-[11px] text-slate-400 font-medium">Sin lotes activos.</div>;
                                      })()}
                                   </div>
                               </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            );
          })()}
        </div>

        {/* Barra de Paginación Fija Abajo */}
        <Pagination 
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={perPage}
          onPageChange={setCurrentPage}
          itemLabel="insumos"
        />
      </div>

      {/* Vista de Tarjetas Móvil (Menor a md - Sin Desplazamiento Horizontal) */}
      <div className="block md:hidden space-y-3 font-data mb-6">
        {currentItems.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-100 text-slate-400 italic text-xs font-semibold">
            Sin registros coincidentes en {area}.
          </div>
        ) : (
          currentItems.map(item => {
            const stock = item.stock_actual || 0;
            const min = item.stock_bajo || 10;
            const esAgotado = stock === 0;
            const esBajo = stock > 0 && stock <= min;
            const hasLotes = stock > 0;
            const isExpanded = !!expandedRows[item.codigo];
            const nombreFormateado = item.nombre ? item.nombre.charAt(0).toUpperCase() + item.nombre.slice(1).toLowerCase() : '';

            return (
              <div 
                key={item.codigo} 
                className={`bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2.5 transition-all ${
                  isExpanded ? 'border-l-4 border-l-primary-600 bg-blue-50/20' : ''
                }`}
              >
                {/* Línea 1: Código + Categoría Truncada */}
                <div className="flex items-center justify-between gap-2">
                   <span className="font-data text-[12px] font-medium text-slate-700">Cód: {item.codigo}</span>
                   <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/60 truncate max-w-[180px]" title={item.categoria}>
                     {item.categoria}
                   </span>
                </div>

                {/* Línea 2: Nombre del Insumo a 100% de Ancho */}
                <div>
                   <h3 className="font-semibold text-slate-900 text-[13px] leading-snug w-full">{nombreFormateado}</h3>
                </div>

                {/* Línea 3: Stock + Estado + Precio Opcional */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                   <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-slate-400 font-medium">Stock:</span>
                      <span className={`font-semibold text-sm ${esAgotado ? 'text-rose-600 font-bold' : (esBajo ? 'text-amber-600 font-bold' : 'text-slate-800')}`}>
                        {stock}
                      </span>
                      {showPrices && canManage && item.precio_unitario && (
                         <span className="font-mono text-xs font-semibold text-slate-600 ml-1">
                            (Q {parseFloat(item.precio_unitario).toFixed(2)})
                         </span>
                      )}
                   </div>

                   {item.activo === false ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border bg-slate-100 border-slate-200 text-slate-500">
                         <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                         <span className="text-[10px] font-semibold">Deshabilitado</span>
                      </div>
                   ) : (
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border ${esAgotado ? 'bg-rose-50 border-rose-200 text-rose-700' : (esBajo ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700')}`}>
                         <div className={`w-1.5 h-1.5 rounded-full ${esAgotado ? 'bg-rose-500 animate-pulse' : (esBajo ? 'bg-amber-500' : 'bg-emerald-500')}`}></div>
                         <span className="text-[10px] font-semibold">{esAgotado ? 'Agotado' : (esBajo ? 'Bajo' : 'Estable')}</span>
                      </div>
                   )}
                </div>

                {/* Línea 4: Acciones y Desglose en móvil */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                   {hasLotes ? (
                     <button 
                       onClick={() => toggleLotes(item.codigo)}
                       className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-800 py-1"
                     >
                       <span>{isExpanded ? 'Ocultar lotes' : 'Ver lotes activos'}</span>
                       <ChevronRight size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                     </button>
                   ) : <span className="text-xs text-slate-300 italic">Sin lotes</span>}

                   {editMode && canManage && (
                     <button 
                       onClick={() => openEditModal(item)} 
                       className="font-sans inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-primary-50/80 text-primary-700 border border-primary-100/80 hover:bg-primary-600 hover:text-white hover:border-primary-600 rounded-lg text-[11px] font-medium transition-all active:scale-95"
                     >
                        <Pencil size={11} /> Editar
                     </button>
                   )}
                </div>

                {/* Lotes Desplegados en móvil */}
                {isExpanded && (
                  <div className="pt-2 border-t border-slate-100 space-y-2 animate-fade-in">
                     <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
                        <span>Lotes y vencimientos activos:</span>
                        {canManage && (
                           <span className="text-primary-600 font-normal italic">Toca para ajustar</span>
                        )}
                     </div>
                     {loadingLotes ? (
                        <div className="p-3 text-center text-[10px] font-semibold text-primary-500 animate-pulse">Cargando vencimientos...</div>
                     ) : (
                        <div className="space-y-2">
                           {(() => {
                             const lotesInsumo = (lotesCargados[item.codigo] || []).filter(l => l.cantidad > 0);
                             if (lotesInsumo.length > 0) {
                                return lotesInsumo.map(lote => {
                                   const today = new Date();
                                   const vDate = lote.fecha_vencimiento ? new Date(lote.fecha_vencimiento) : null;
                                   const isVencido = vDate && vDate < today;
                                   const isSoon = vDate && (vDate < new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000));
                                   const statusColor = isVencido ? 'border-rose-500' : (isSoon ? 'border-amber-500' : 'border-blue-500');

                                   return (
                                      <div 
                                        key={lote.id} 
                                        onClick={(e) => {
                                          if (canManage) {
                                            e.stopPropagation();
                                            handleOpenAjuste(lote, item);
                                          }
                                        }}
                                        className={`flex items-center justify-between p-2.5 rounded-xl border border-l-[3px] shadow-2xs transition-all text-xs ${statusColor} ${
                                          canManage 
                                            ? 'bg-primary-50/40 border-slate-200/60 cursor-pointer active:bg-primary-100/60 active:scale-[0.98]' 
                                            : 'bg-slate-50/80 border-slate-200/60'
                                        }`}
                                        title={canManage ? 'Toca para ajustar este lote' : ''}
                                      >
                                         <div>
                                            <span className="text-[10px] text-slate-400 block">Lote: <strong className="text-slate-800 font-mono text-[11px]">{lote.lote}</strong></span>
                                            <span className="text-[10px] text-slate-400 block">Stock: <strong className="text-primary-600 text-[11px]">{lote.cantidad}</strong></span>
                                         </div>
                                         <div className="flex items-center gap-1.5 shrink-0">
                                            <span className={`text-[11px] font-semibold ${isVencido ? 'text-rose-600' : (isSoon ? 'text-amber-600' : 'text-blue-600')}`}>
                                               Vence: {lote.fecha_vencimiento || '---'}
                                            </span>
                                            {canManage && (
                                               <button 
                                                 type="button"
                                                 onClick={(e) => {
                                                   e.stopPropagation();
                                                   handleOpenAjuste(lote, item);
                                                 }}
                                                 className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100/90 hover:bg-primary-600 hover:text-white text-primary-700 rounded-lg text-[10px] font-semibold ml-1 transition-all active:scale-95 border border-primary-200/60"
                                               >
                                                  <Wrench size={10} />
                                                  <span>Ajustar</span>
                                               </button>
                                            )}
                                         </div>
                                      </div>
                                   );
                                });
                             }
                             return <div className="py-2 px-3 bg-white/80 rounded-xl border border-dashed border-slate-200 text-center italic text-[11px] text-slate-400 font-medium">Sin lotes activos.</div>;
                           })()}
                        </div>
                     )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div className="pt-2">
          <Pagination 
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={perPage}
            onPageChange={setCurrentPage}
            itemLabel="insumos"
            className="rounded-2xl border border-slate-200/80 shadow-xs"
          />
        </div>
      </div>

      {/* MODAL: NUEVO INSUMO */}
      {showNewModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-sm sm:max-w-md rounded-3xl shadow-2xl relative overflow-hidden animate-zoom-in border border-white/50 text-slate-700">
             <div className="p-7">
                <div className="flex items-center justify-between mb-5">
                   <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
                      <Boxes className="text-primary-500" size={18} />
                      Creación de nuevo insumo
                   </h2>
                   <button onClick={() => setShowNewModal(false)} className="text-slate-300 hover:text-rose-500 transition-colors p-1 rounded-lg">
                      <X size={18} />
                   </button>
                </div>
                
                <form onSubmit={handleCreateInsumo} className="space-y-4">
                   <div className="grid grid-cols-2 gap-3">
                      <div className="text-left space-y-1.5">
                         <label className="text-[11px] font-semibold text-slate-500 block ml-1">Código de referencia</label>
                         <input 
                           type="text" 
                           required
                           value={newInsumo.codigo} 
                           onChange={e => setNewInsumo({...newInsumo, codigo: e.target.value.toUpperCase()})} 
                           className="w-full px-3.5 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-mono text-sm font-bold tracking-wider text-slate-800 shadow-inner placeholder:text-slate-400 uppercase"
                           placeholder="Ej. COD-123"
                         />
                      </div>

                      <div className="text-left space-y-1.5">
                         <label className="text-[11px] font-semibold text-slate-500 block ml-1">Categoría</label>
                         <select 
                           value={newInsumo.categoria} 
                           onChange={e => setNewInsumo({...newInsumo, categoria: e.target.value})} 
                           className="w-full px-3 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium cursor-pointer"
                         >
                             {activeCategoryList.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                             ))}
                          </select>
                      </div>
                   </div>

                   <div className="text-left space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 block ml-1">Nombre descriptivo</label>
                      <input 
                        type="text" 
                        required
                        value={newInsumo.nombre} 
                        onChange={e => setNewInsumo({...newInsumo, nombre: e.target.value.toUpperCase()})} 
                        className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all text-xs text-slate-700 shadow-inner font-medium uppercase"
                        placeholder="Nombre comercial o genérico"
                      />
                   </div>

                   <div className="grid grid-cols-2 gap-3">
                       <div className="text-left space-y-1.5">
                         <label className="text-[11px] font-semibold text-slate-500 block ml-1">Stock mínimo</label>
                         <input 
                           type="number" 
                           min="0" 
                           value={newInsumo.stock_bajo} 
                           onChange={e => setNewInsumo({...newInsumo, stock_bajo: e.target.value})} 
                           className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium" 
                         />
                       </div>

                       <div className="text-left space-y-1.5">
                         <label className="text-[11px] font-semibold text-slate-500 block ml-1">Precio unitario (Q.)</label>
                         <input 
                           type="number" 
                           step="0.000001"
                           min="0" 
                           placeholder="0.00"
                           value={newInsumo.precio_unitario} 
                           onChange={e => setNewInsumo({...newInsumo, precio_unitario: e.target.value})} 
                           className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium" 
                         />
                       </div>
                   </div>

                   <div className="flex items-center gap-2 pt-3">
                       <button 
                         type="button" 
                         onClick={() => setShowNewModal(false)} 
                         className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-semibold text-xs transition-all active:scale-95"
                       >
                         Cancelar
                       </button>
                       <button 
                         type="submit" 
                         className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold text-xs tracking-wide shadow-md transition-all active:scale-95"
                       >
                         <CheckCircle size={14} />
                         Crear insumo
                       </button>
                   </div>
                 </form>
              </div>
           </div>
        </div>
      )}

      {/* MODAL: EDITAR INSUMO */}
      {showEditModal && editInsumo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-sm sm:max-w-md rounded-3xl shadow-2xl relative overflow-hidden animate-zoom-in border border-white/50 text-slate-700">
             <div className="p-7">
                <div className="flex items-center justify-between mb-5">
                   <div>
                      <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
                         <Boxes className="text-primary-500" size={18} />
                         Editar insumo
                      </h2>
                      <p className="text-xs font-semibold text-primary-600 font-mono mt-0.5 ml-1 flex items-center gap-1.5">
                         <span>Código de Referencia:</span>
                         <strong className="text-slate-800 bg-primary-50/70 px-2 py-0.5 rounded-md border border-primary-100/80 font-bold">
                            #{editInsumo.codigoOrig}
                         </strong>
                      </p>
                   </div>
                   <button onClick={() => setShowEditModal(false)} className="text-slate-300 hover:text-rose-500 transition-colors p-1 rounded-lg">
                      <X size={18} />
                   </button>
                </div>
                
                <form onSubmit={handleEditSave} className="space-y-4">
                   <div className="grid grid-cols-2 gap-3">
                       <div className="text-left space-y-1.5">
                          <label className="text-[11px] font-semibold text-slate-500 block ml-1">Código de referencia</label>
                          <input 
                            type="text" 
                            required
                            value={editInsumo.codigo} 
                            onChange={e => setEditInsumo({...editInsumo, codigo: e.target.value.toUpperCase()})}
                            readOnly={!isAdmin}
                            className={`w-full px-3.5 py-2.5 border rounded-xl font-mono text-sm font-bold tracking-wider outline-none transition-all shadow-inner uppercase ${!isAdmin ? 'bg-slate-100 text-slate-500 border-slate-200/80 cursor-not-allowed' : 'bg-slate-50/60 border-slate-200/60 text-slate-800 focus:bg-white focus:border-primary-500/50'}`}
                          />
                       </div>

                       <div className="text-left space-y-1.5">
                          <label className="text-[11px] font-semibold text-slate-500 block ml-1">Categoría</label>
                          <select 
                            value={editInsumo.categoria} 
                            onChange={e => setEditInsumo({...editInsumo, categoria: e.target.value})} 
                            className="w-full px-3 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium cursor-pointer"
                          >
                             {activeCategoryList.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                             ))}
                             {['Medicamento', 'Médicoquirúrgico'].includes(editInsumo.categoria) && !activeCategoryList.includes(editInsumo.categoria) && (
                                <option value={editInsumo.categoria}>{editInsumo.categoria} (Antiguo)</option>
                             )}
                          </select>
                       </div>
                   </div>

                   {isAdmin && <p className="text-[10px] text-amber-600 font-semibold pl-1 -mt-1">⚠ Modificar el código migrará automáticamente sus lotes asociados.</p>}

                   <div className="text-left space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 block ml-1">Nombre descriptivo</label>
                      <input 
                        type="text" 
                        required
                        value={editInsumo.nombre} 
                        onChange={e => setEditInsumo({...editInsumo, nombre: e.target.value.toUpperCase()})} 
                        className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all text-xs text-slate-700 shadow-inner font-medium uppercase"
                      />
                   </div>

                   <div className="grid grid-cols-2 gap-3">
                       <div className="text-left space-y-1.5">
                         <label className="text-[11px] font-semibold text-slate-500 block ml-1">Stock mínimo</label>
                         <input 
                           type="number" 
                           min="0" 
                           value={editInsumo.stock_bajo} 
                           onChange={e => setEditInsumo({...editInsumo, stock_bajo: e.target.value})} 
                           className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium" 
                         />
                       </div>

                       <div className="text-left space-y-1.5">
                         <label className="text-[11px] font-semibold text-slate-500 block ml-1">Precio unitario (Q.)</label>
                         <input 
                           type="number" 
                           step="0.000001"
                           min="0" 
                           placeholder="0.00"
                           value={editInsumo.precio_unitario} 
                           onChange={e => setEditInsumo({...editInsumo, precio_unitario: e.target.value})} 
                           className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium" 
                         />
                       </div>
                   </div>

                   <div className="text-left space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 block ml-1">Estado de insumo</label>
                      <div className="p-1 bg-slate-100/80 rounded-2xl flex gap-1 border border-slate-200/50">
                         <button 
                           type="button" 
                           onClick={() => setEditInsumo({ ...editInsumo, activo: true })} 
                           className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                             editInsumo.activo !== false 
                               ? 'bg-emerald-500 text-white shadow-xs' 
                               : 'text-slate-500 hover:text-slate-700'
                           }`}
                         >
                           <CheckCircle size={13} />
                           Habilitado
                         </button>
                         <button 
                           type="button" 
                           onClick={() => setEditInsumo({ ...editInsumo, activo: false })} 
                           className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                             editInsumo.activo === false 
                               ? 'bg-rose-500 text-white shadow-xs' 
                               : 'text-slate-500 hover:text-slate-700'
                           }`}
                         >
                           <X size={13} />
                           Deshabilitado
                         </button>
                      </div>
                   </div>

                   <div className="flex items-center gap-2 pt-3">
                       <button 
                         type="button" 
                         onClick={() => setShowEditModal(false)} 
                         className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-semibold text-xs transition-all active:scale-95"
                       >
                         Cancelar
                       </button>
                       <button 
                         type="submit" 
                         disabled={loading}
                         className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold text-xs tracking-wide shadow-md transition-all active:scale-95 disabled:opacity-50"
                       >
                         <CheckCircle size={14} />
                         {loading ? 'Guardando...' : 'Guardar cambios'}
                       </button>
                   </div>
                </form>
             </div>
          </div>
        </div>
      )}
      {/* MODAL DE AJUSTE DE INVENTARIO */}
      {showAjusteModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-sm sm:max-w-md rounded-3xl shadow-2xl relative overflow-hidden animate-zoom-in border border-white/50 text-slate-700">
             <div className="p-7">
                <div className="flex items-center justify-between mb-5">
                   <div>
                      <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
                         <Wrench className="text-primary-500" size={18} />
                         Ajuste de inventario
                      </h2>
                      <p className="text-xs font-semibold text-slate-400 mt-0.5 ml-1">
                         Corrección manual de existencias físicas
                      </p>
                   </div>
                   <button onClick={() => setShowAjusteModal(false)} className="text-slate-300 hover:text-rose-500 transition-colors p-1 rounded-lg">
                      <X size={18} />
                   </button>
                </div>

                <form onSubmit={handleAjusteSubmit} className="space-y-4">
                   <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/60 space-y-2">
                      <div className="flex justify-between items-center">
                         <div>
                            <p className="text-[11px] font-semibold text-slate-400">Lote seleccionado</p>
                            <p className="font-mono text-sm font-bold text-slate-800 uppercase">{ajusteData.loteObj?.lote}</p>
                         </div>
                         <div className="text-right">
                            <p className="text-[11px] font-semibold text-slate-400">Stock actual</p>
                            <p className="font-data font-bold text-primary-600 text-lg leading-tight">{ajusteData.loteObj?.cantidad}</p>
                         </div>
                      </div>
                      {ajusteData.loteObj?.fecha_vencimiento && (
                         <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                            <span className="text-slate-500 font-medium">Vencimiento actual:</span>
                            <span className="font-mono font-semibold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200/70">{ajusteData.loteObj.fecha_vencimiento}</span>
                         </div>
                      )}
                   </div>

                   <div className="grid grid-cols-2 gap-3">
                       <div className="text-left space-y-1.5">
                          <label className="text-[11px] font-semibold text-slate-500 block ml-1">Nueva cantidad física</label>
                          <input 
                            type="number" 
                            min="0"
                            required
                            value={ajusteData.nuevaCantidad}
                            onChange={e => setAjusteData({...ajusteData, nuevaCantidad: e.target.value})}
                            className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-sm font-bold text-slate-800 shadow-inner"
                            placeholder="0"
                          />
                       </div>

                       <div className="text-left space-y-1.5">
                          <label className="text-[11px] font-semibold text-slate-500 block ml-1">Fecha de vencimiento</label>
                          <input 
                            type="date"
                            value={ajusteData.fechaVencimiento || ''}
                            onChange={e => setAjusteData({...ajusteData, fechaVencimiento: e.target.value})}
                            className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium cursor-pointer"
                          />
                       </div>
                   </div>

                   <div className="text-left space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 block ml-1">Motivo de la corrección</label>
                      <textarea 
                        required
                        value={ajusteData.motivo}
                        onChange={e => setAjusteData({...ajusteData, motivo: e.target.value.toUpperCase()})}
                        className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner placeholder:text-slate-400 font-medium"
                        rows="2"
                        placeholder="Ej. Error de carga, producto dañado, merma, etc."
                      ></textarea>
                   </div>

                   <div className="flex items-center gap-2 pt-3">
                       <button 
                         type="button" 
                         onClick={() => setShowAjusteModal(false)} 
                         className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-semibold text-xs transition-all active:scale-95"
                       >
                         Cancelar
                       </button>
                       <button 
                         type="submit" 
                         className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold text-xs tracking-wide shadow-md transition-all active:scale-95"
                       >
                         <CheckCircle size={14} />
                         Confirmar ajuste
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

export default Inventario;
