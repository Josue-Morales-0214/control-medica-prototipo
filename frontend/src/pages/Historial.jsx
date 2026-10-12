import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useArea } from '../contexts/AreaContext';
import { useData } from '../contexts/DataContext';
import { db } from '../services/firebase';
import { collection, query, where, doc, deleteDoc, runTransaction, orderBy, limit, increment, serverTimestamp } from 'firebase/firestore';
import Swal from 'sweetalert2';
import Pagination from '../components/Pagination';
import { showSuccessToast } from '../utils/toast';
import { getMovementTimeMs } from '../utils/constants';
import { 
  History, 
  Search, 
  ChevronRight, 
  Wrench, 
  Trash2,
  Settings,
  ArrowDownLeft,
  ArrowUpRight,
  Sun,
  Sunset,
  Moon,
  X,
  CheckCircle,
  FileText,
  RotateCcw,
  Boxes,
  User
} from 'lucide-react';

const Historial = () => {
  const { userData, currentUser, isAdmin, isSupervisor, isEncargado } = useAuth();
  const { area, usersCache } = useArea();
  const { 
    movimientos: allMovs, 
    recentMovs,
    insumos: allInsumos, 
    lotes: allLotes, 
    loading: dataLoading, 
    goToNextPage, 
    goToPrevPage, 
    fetchPage,
    applyServerFilters,
    isPaging, 
    currentPage,
    pageSize,
    totalMovs,
    totalEntradas,
    totalSalidas,
    hasMore,
    lastPageLength,
    maxDiscoveredPage,
    logAudit,
    removeReportCacheItem,
    updateReportCacheItem
  } = useData();

  const [loading, setLoading] = useState(false);

  // Determinar si el rol es Enfermero (o sin permisos superiores)
  const isEnfermero = React.useMemo(() => {
    const rol = (userData?.rol || '').toLowerCase();
    return rol === 'enfermero' || (!isAdmin && !isSupervisor);
  }, [userData, isAdmin, isSupervisor]);

  // Filtros Locales: Egresos (Salida) por defecto para todos los usuarios
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [filterTipo, setFilterTipo] = useState('Salida'); // 'Salida' (Egresos) por defecto
  const [filterTurno, setFilterTurno] = useState(''); // '', 'M', 'T', 'N'

  // Si el usuario es enfermero, asegurar que solo pueda ver Salidas
  useEffect(() => {
    if (isEnfermero && filterTipo !== 'Salida') {
      setFilterTipo('Salida');
    }
  }, [isEnfermero, filterTipo]);

  // 🔌 CONEXIÓN CRÍTICA: Enviar filtros al servidor cuando cambian en la UI
  useEffect(() => {
    applyServerFilters({
      tipo: filterTipo,
      desde: filterDesde,
      hasta: filterHasta,
      turno: filterTurno
    });
  }, [filterTipo, filterDesde, filterHasta, filterTurno]);
  
  // Mapeo rápido de insumos para categorías
  const insumosMap = React.useMemo(() => {
    const map = {};
    allInsumos.forEach(i => { map[i.codigo] = i; });
    return map;
  }, [allInsumos]);

  // Expansion
  const [expandedRows, setExpandedRows] = useState({});
  
  // Edición
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMov, setEditingMov] = useState(null);
  const [editForm, setEditForm] = useState({
    cantidad: '',
    lote: '',
    fecha: '',
    turno: '',
    observacion: ''
  });
  const [lotesSugeridos, setLotesSugeridos] = useState([]);

  // Reversión
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [revertTarget, setRevertTarget] = useState(null);
  const [motivoReversion, setMotivoReversion] = useState('');

  // Cerrar modales con la tecla ESC
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showEditModal) setShowEditModal(false);
        if (showRevertModal) {
          setShowRevertModal(false);
          setRevertTarget(null);
          setMotivoReversion('');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showEditModal, showRevertModal]);

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isOwnMov = (mov) => {
    if (!mov || !currentUser) return false;
    const userEmail = (currentUser.email || '').toLowerCase();
    const userName = (userData?.nombre || '').toLowerCase();
    const movUser = (mov.usuario_id || '').toLowerCase();
    const movAuthor = (mov.registrado_por || '').toLowerCase();

    return (
      (movUser && movUser === userEmail) ||
      (currentUser.uid && movUser === currentUser.uid.toLowerCase()) ||
      (movAuthor && userName && movAuthor === userName)
    );
  };

  const getMovTimestampMs = (mov) => {
    if (!mov) return null;
    if (mov.fecha_registro && typeof mov.fecha_registro.toDate === 'function') {
      return mov.fecha_registro.toDate().getTime();
    }
    if (mov.fecha_registro && mov.fecha_registro.seconds) {
      return mov.fecha_registro.seconds * 1000;
    }
    if (mov.createdAt && typeof mov.createdAt.toDate === 'function') {
      return mov.createdAt.toDate().getTime();
    }
    if (mov.fecha) {
      const parsed = new Date(mov.fecha).getTime();
      if (!isNaN(parsed)) return parsed;
    }
    return null;
  };

  const canRevertMov = (mov) => {
    if (!mov) return false;
    // Admin, Supervisor o Encargado: Tienen facultad para revertir cualquier movimiento de su área sin límite temporal
    if (isAdmin || isSupervisor || isEncargado) return true;

    // Enfermero: Solo puede revertir sus propios movimientos dentro de las 24 horas exactas del registro en el servidor
    if (isEnfermero) {
      if (!isOwnMov(mov)) return false;

      const regMs = getMovTimestampMs(mov);
      if (!regMs) return false;

      const nowMs = Date.now();
      const diffHours = (nowMs - regMs) / (1000 * 60 * 60);
      return diffHours >= 0 && diffHours <= 24;
    }

    return false;
  };

  const handleEliminar = (mov) => {
    if (!canRevertMov(mov)) {
       if (isEnfermero) {
          if (!isOwnMov(mov)) {
             Swal.fire('Acceso Denegado', 'Como enfermero, solo puedes revertir movimientos registrados por tu propia cuenta.', 'warning');
          } else {
             Swal.fire('Plazo Expirado', 'El tiempo límite de 24 horas exactas desde el registro para revertir este movimiento ha expirado.', 'warning');
          }
       } else {
          Swal.fire('Acceso Denegado', 'No dispones de permisos para revertir este movimiento.', 'warning');
       }
       return;
    }

    setRevertTarget(mov);
    setMotivoReversion('');
    setShowRevertModal(true);
  };

  const confirmExecuteReversion = async () => {
    if (!revertTarget) return;
    if (!motivoReversion || motivoReversion.trim().length < 10) {
       Swal.fire('Justificación Obligatoria', 'Debe ingresar un motivo explicativo de al menos 10 caracteres.', 'warning');
       return;
    }

    const mov = revertTarget;
    setLoading(true);
    let movAuditPayload = null;
    try {
       await runTransaction(db, async (t) => {
          const movRef = doc(db, 'movimientos', mov.id);
          const movDoc = await t.get(movRef);
          if (!movDoc.exists()) throw new Error("Registro no encontrado");

          const typeUpper = (mov.tipo || '').toUpperCase();
          const isEntrada = typeUpper.includes('ENTRADA') || typeUpper.includes('INGRESO') || typeUpper === 'CARGA_INICIAL';
          const amount = movDoc.data().cantidad || 0;
          const codInsumo = movDoc.data().codigo_insumo;
          const loteName = movDoc.data().lote;
          const originalAuthor = getUserDisplayName(movDoc.data());
          const originalDate = movDoc.data().fecha || '';
          const originalTurnoRaw = movDoc.data().turno;
          const originalTurnoFormatted = originalTurnoRaw ? (originalTurnoRaw === 'M' ? 'Mañana' : originalTurnoRaw === 'T' ? 'Tarde' : 'Noche') : '';

          const insumoRef = doc(db, 'insumos', `${area}_${codInsumo}`);
          const insumoDoc = await t.get(insumoRef);
          const loteIdSeguro = loteName ? loteName.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
          const loteRef = loteIdSeguro ? doc(db, 'lotes', `${area}_${codInsumo}_${loteIdSeguro}`) : null;
          const loteDoc = loteRef ? await t.get(loteRef) : null;

          let newInsumoStock = insumoDoc.exists() ? (insumoDoc.data().stock_actual || 0) : 0;
          let newLoteStock = (loteDoc && loteDoc.exists()) ? (loteDoc.data().cantidad || 0) : 0;

          if (isEntrada) {
               if (newInsumoStock < amount || newLoteStock < amount) {
                   throw new Error("Existencias insuficientes: no se puede revertir la entrada porque el stock ya fue consumido.");
               }
               newInsumoStock -= amount;
               newLoteStock -= amount;
          } else {
               newInsumoStock += amount;
               newLoteStock += amount;
          }

          if (insumoDoc.exists()) t.update(insumoRef, { stock_actual: newInsumoStock });
          if (loteDoc && loteDoc.exists()) t.update(loteRef, { cantidad: newLoteStock });

          t.delete(movRef);

          // 5. ACTUALIZAR METADATOS (DECREMENTAR CONTADOR)
          const metaRef = doc(db, 'metadata', `${area}_meta`);
          t.set(metaRef, { 
            totalMovimientos: increment(-1),
            ultima_actualizacion: serverTimestamp() 
          }, { merge: true });

          // 6. REGISTRAR EVENTO DE AUDITORÍA ATÓMICAMENTE DENTRO DE LA TRANSACCIÓN
          const auditDocRef = doc(collection(db, 'auditoria'));
          const userMail = currentUser?.email || 'desconocido';
          const userName = userData?.nombre || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Usuario';
          const userRole = userData?.rol || 'Operativo';
          const detailsTurno = originalTurnoFormatted ? `, Turno: ${originalTurnoFormatted}` : '';

          t.set(auditDocRef, {
            modulo: 'Historial',
            accion: 'REVERSION_MOVIMIENTO',
            descripcion: `Reversión de ${mov.tipo}: ${mov.nombre_insumo} — Cantidad: ${amount} u. — Lote: ${loteName} — Registrado originalmente por: ${originalAuthor} (${originalDate}${detailsTurno})`,
            motivo: motivoReversion,
            registro_afectado: mov.id,
            conciliacion_id: '',
            usuario: userName,
            usuario_id: userMail,
            rol: userRole,
            area: area,
            fecha: new Date().toLocaleDateString('en-CA'),
            hora: new Date().toLocaleTimeString('es-GT', { hour12: false }),
            snapshot: movDoc.data(),
            timestamp: serverTimestamp()
          });
       });

       removeReportCacheItem(mov.id);
       showSuccessToast('Stock revertido y registro auditado en la bitácora.');
       setShowRevertModal(false);
       setRevertTarget(null);
       setMotivoReversion('');
    } catch (err) {
       console.error(err);
       Swal.fire('Error Crítico', err.message || 'No se pudo revertir la transacción.', 'error');
    } finally {
       setLoading(false);
    }
  };

  const handleOpenEdit = (mov) => {
    if (!isAdmin && !isSupervisor) {
      Swal.fire('Acceso Denegado', 'No tienes permisos para corregir registros históricos.', 'error');
      return;
    }
    setEditingMov(mov);
    setEditForm({
      cantidad: mov.cantidad,
      lote: mov.lote || '',
      fecha: mov.fecha,
      fecha_vencimiento: mov.fecha_vencimiento || '',
      turno: mov.turno || 'M',
      observacion: mov.observacion || ''
    });
    const typeUpperEdit = (mov.tipo || '').toUpperCase();
    const isEntrada = typeUpperEdit.includes('ENTRADA') || typeUpperEdit.includes('INGRESO') || typeUpperEdit === 'CARGA_INICIAL';
    const lista = allLotes
      .filter(l => l.codigo_insumo === mov.codigo_insumo)
      .filter(l => isEntrada ? true : l.cantidad > 0)
      .map(l => l.lote);
    
    if (mov.lote && !lista.includes(mov.lote)) {
      lista.push(mov.lote);
    }
    
    setLotesSugeridos([...new Set(lista)].sort());
    setShowEditModal(true);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const typeUpperSave = (editingMov.tipo || '').toUpperCase();
      const isEntrada = typeUpperSave.includes('ENTRADA') || typeUpperSave.includes('INGRESO') || typeUpperSave === 'CARGA_INICIAL';
      const codInsumo = editingMov.codigo_insumo;

      // 🛡️ VALIDACIÓN: NINGÚN CAMPO PUEDE QUEDAR VACÍO
      if (!editForm.cantidad || !editForm.lote || !editForm.observacion || 
          (isEntrada && !editForm.fecha_vencimiento) || 
          (!isEntrada && !editForm.fecha)) {
        Swal.fire('Campos Obligatorios', 'Todos los campos (Cantidad, Lote, Fecha y Motivo) son necesarios.', 'warning');
        setLoading(false);
        return;
      }

      // 🔍 CONSTRUIR COMPARATIVA DE CAMBIOS PARA LA ADVERTENCIA
      let cambiosHtml = '<div style="text-align: left; font-family: monospace; font-size: 0.85rem; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0;">';
      let hayCambios = false;

      const checkChange = (label, oldVal, newVal) => {
        if (String(oldVal) !== String(newVal)) {
          hayCambios = true;
          return `<div style="margin-bottom: 8px;">
                    <span style="color: #94a3b8; font-weight: bold; text-transform: uppercase; font-size: 10px; display: block;">${label}</span>
                    <span style="color: #ef4444; text-decoration: line-through;">${oldVal || 'N/A'}</span> 
                    <span style="color: #10b981; font-weight: bold;"> → ${newVal}</span>
                  </div>`;
        }
        return '';
      };

      cambiosHtml += checkChange('Cantidad', editingMov.cantidad, editForm.cantidad);
      cambiosHtml += checkChange('Lote', editingMov.lote, editForm.lote);
      
      if (isEntrada) {
        cambiosHtml += checkChange('Vencimiento', editingMov.fecha_vencimiento, editForm.fecha_vencimiento);
      } else {
        cambiosHtml += checkChange('Fecha Uso', editingMov.fecha, editForm.fecha);
        cambiosHtml += checkChange('Turno', editingMov.turno === 'M' ? 'MAÑANA' : editingMov.turno === 'T' ? 'TARDE' : 'NOCHE', 
                                         editForm.turno === 'M' ? 'MAÑANA' : editForm.turno === 'T' ? 'TARDE' : 'NOCHE');
      }

      cambiosHtml += '</div>';

      if (!hayCambios) {
        Swal.fire('Sin cambios', 'No has realizado ninguna modificación.', 'info');
        setLoading(false);
        return;
      }

      const { value: confirmed } = await Swal.fire({
        title: '¿Confirmar Cambios?',
        html: `
          <div style="text-align: left; margin-bottom: 15px;">
            <p style="font-size: 0.9rem; color: #64748b; margin-bottom: 5px;">Estás corrigiendo un registro de <b>${isEntrada ? 'INGRESO' : 'EGRESO'}</b>:</p>
            <p style="font-size: 0.8rem; font-weight: bold; color: #1e293b;">${codInsumo} - ${editingMov.nombre_insumo}</p>
            <p style="font-size: 0.75rem; color: #94a3b8;">Original por: ${getUserDisplayName(editingMov)}</p>
          </div>
          <p style="font-size: 0.7rem; font-weight: bold; color: #ef4444; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.1em;">Resumen de Modificaciones:</p>
          ${cambiosHtml}
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Sí, aplicar cambios',
        cancelButtonText: 'Revisar de nuevo',
        customClass: {
          popup: 'rounded-2xl',
          confirmButton: 'rounded-xl font-semibold tracking-normal text-xs px-5 py-2.5',
          cancelButton: 'rounded-xl font-semibold tracking-normal text-xs px-5 py-2.5'
        }
      });

      if (!confirmed) {
        setLoading(false);
        return;
      }

      // ⚙️ LOGICA DE ACTUALIZACIÓN CON VALIDACIÓN RIGUROSA DE STOCK
      const oldQty = parseInt(editingMov.cantidad);
      const newQty = parseInt(editForm.cantidad);
      const delta = newQty - oldQty;

      await runTransaction(db, async (t) => {
        const movRef = doc(db, 'movimientos', editingMov.id);
        const insumoRef = doc(db, 'insumos', `${area}_${codInsumo}`);

        if (isAdmin || isSupervisor) {
           const sameLote = editingMov.lote === editForm.lote;

           const oldLoteIdSeguro = editingMov.lote ? editingMov.lote.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
           const oldLoteRef = oldLoteIdSeguro ? doc(db, 'lotes', `${area}_${codInsumo}_${oldLoteIdSeguro}`) : null;
           const oldLoteSnap = oldLoteRef ? await t.get(oldLoteRef) : null;
           const insumoSnap = await t.get(insumoRef);

           if (sameLote) {
              if (oldLoteSnap && oldLoteSnap.exists() && insumoSnap.exists()) {
                 const currentLoteStock = oldLoteSnap.data().cantidad || 0;
                 const currentInsumoStock = insumoSnap.data().stock_actual || 0;

                 if (isEntrada) {
                    if (delta < 0 && (currentLoteStock + delta < 0)) {
                       throw new Error(`Stock insuficiente: No se puede reducir el ingreso a ${newQty} porque ya se consumió stock de este lote (Disponible actual: ${currentLoteStock}).`);
                    }
                    const stockAdjustment = delta;
                    const updatesLote = { cantidad: currentLoteStock + stockAdjustment };
                    if (editForm.fecha_vencimiento) {
                       updatesLote.fecha_vencimiento = editForm.fecha_vencimiento;
                    }
                    t.update(oldLoteRef, updatesLote);
                    t.update(insumoRef, { stock_actual: currentInsumoStock + stockAdjustment });
                 } else {
                    if (delta > 0 && (currentLoteStock - delta < 0)) {
                       const maxPermitido = currentLoteStock + oldQty;
                       throw new Error(`Stock insuficiente: El lote solo dispone de ${currentLoteStock} unidades adicionales (Máximo permitido para este egreso: ${maxPermitido}).`);
                    }
                    const stockAdjustment = -delta;
                    t.update(oldLoteRef, { cantidad: currentLoteStock + stockAdjustment });
                    t.update(insumoRef, { stock_actual: currentInsumoStock + stockAdjustment });
                 }
              }
           } else {
              // Cambio de lote
              const newLoteIdSeguro = editForm.lote.replace(/[^a-zA-Z0-9_-]/g, '_');
              const newLoteRef = doc(db, 'lotes', `${area}_${codInsumo}_${newLoteIdSeguro}`);
              const newLoteSnap = await t.get(newLoteRef);

              if (insumoSnap.exists()) {
                 const currentInsumoStock = insumoSnap.data().stock_actual || 0;

                 if (isEntrada) {
                    const currentOldLoteStock = oldLoteSnap?.exists() ? (oldLoteSnap.data().cantidad || 0) : 0;
                    if (currentOldLoteStock - oldQty < 0) {
                       throw new Error(`No se puede cambiar el lote de este ingreso porque ya se consumió parte de su stock en el lote anterior.`);
                    }
                    const currentNewLoteStock = newLoteSnap.exists() ? (newLoteSnap.data().cantidad || 0) : 0;

                    if (oldLoteSnap?.exists()) t.update(oldLoteRef, { cantidad: currentOldLoteStock - oldQty });
                    if (newLoteSnap.exists()) t.update(newLoteRef, { cantidad: currentNewLoteStock + newQty });

                    t.update(insumoRef, { stock_actual: currentInsumoStock + delta });
                 } else {
                    const currentOldLoteStock = oldLoteSnap?.exists() ? (oldLoteSnap.data().cantidad || 0) : 0;
                    const currentNewLoteStock = newLoteSnap.exists() ? (newLoteSnap.data().cantidad || 0) : 0;

                    if (currentNewLoteStock < newQty) {
                       throw new Error(`Stock insuficiente en el lote '${editForm.lote}': Solo dispone de ${currentNewLoteStock} unidades.`);
                    }

                    if (oldLoteSnap?.exists()) t.update(oldLoteRef, { cantidad: currentOldLoteStock + oldQty });
                    if (newLoteSnap.exists()) t.update(newLoteRef, { cantidad: currentNewLoteStock - newQty });

                    t.update(insumoRef, { stock_actual: currentInsumoStock - delta });
                 }
              }
           }
        }

        t.update(movRef, {
           cantidad: newQty,
           lote: editForm.lote,
           fecha: editForm.fecha,
           fecha_vencimiento: editForm.fecha_vencimiento || '',
           turno: isEntrada ? null : editForm.turno,
           observacion: editForm.observacion,
           editado_por: userData?.nombre || currentUser.email,
           fecha_edicion: new Date()
        });
      });

      // 📝 Auditoría Enriquecida de Corrección de Registro (fuera de la transacción)
      const cambiosAuditArr = [];
      if (String(editingMov.cantidad) !== String(editForm.cantidad)) {
        cambiosAuditArr.push(`Cantidad: ${editingMov.cantidad} → ${editForm.cantidad}`);
      }
      if (String(editingMov.lote || '') !== String(editForm.lote || '')) {
        cambiosAuditArr.push(`Lote: ${editingMov.lote || 'N/A'} → ${editForm.lote}`);
      }
      if (isEntrada) {
        if (String(editingMov.fecha_vencimiento || '') !== String(editForm.fecha_vencimiento || '')) {
          cambiosAuditArr.push(`Vencimiento: ${editingMov.fecha_vencimiento || 'N/A'} → ${editForm.fecha_vencimiento}`);
        }
      } else {
        if (String(editingMov.fecha || '') !== String(editForm.fecha || '')) {
          cambiosAuditArr.push(`Fecha Uso: ${editingMov.fecha || 'N/A'} → ${editForm.fecha}`);
        }
        if (String(editingMov.turno || '') !== String(editForm.turno || '')) {
          const tMap = { M: 'Mañana', T: 'Tarde', N: 'Noche' };
          cambiosAuditArr.push(`Turno: ${tMap[editingMov.turno] || editingMov.turno} → ${tMap[editForm.turno] || editForm.turno}`);
        }
      }
      const detalleModificaciones = cambiosAuditArr.length > 0 ? ` — Cambios: [${cambiosAuditArr.join(' | ')}]` : '';

      logAudit({
        modulo: 'Historial',
        accion: 'CORRECCIÓN',
        descripcion: `Corrección de ${editingMov.tipo || 'registro'}: ${editingMov.nombre_insumo} (Cód: ${codInsumo})${detalleModificaciones}`,
        motivo: editForm.observacion,
        registroId: editingMov.id
      });

      updateReportCacheItem(editingMov.id, {
        cantidad: Number(editForm.cantidad),
        lote: editForm.lote,
        fecha: editForm.fecha,
        fecha_vencimiento: editForm.fecha_vencimiento || '',
        turno: (editingMov.tipo || '').toLowerCase().includes('entrada') ? null : editForm.turno,
        observacion: editForm.observacion
      });

      showSuccessToast('Movimiento actualizado correctamente.');
      setShowEditModal(false);
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: (err.message?.includes('Stock') || err.message?.includes('insuficiente') || err.message?.includes('No se puede')) ? 'Validación de Stock' : 'Error',
        text: err.message || 'No se pudo guardar la edición.',
        icon: 'warning'
      });
    } finally {
      setLoading(false);
    }
  };

  const getUserDisplayName = (m) => {
    const emailOrName = m.registrado_por || m.usuario || m.user || m.user_email || '';
    if (!emailOrName) return '—';
    
    let baseName = '';
    if (!emailOrName.includes('@')) {
      baseName = emailOrName;
    } else {
      const emailKey = emailOrName.toLowerCase().trim();
      baseName = usersCache[emailKey] || emailOrName.split('@')[0];
    }
    
    // Formato tipo nombre propio (Capitalizar cada palabra)
    return baseName
      .split(' ')
      .filter(w => w.length > 0)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  };

  const filteredMovs = React.useMemo(() => {
    const list = (allMovs || []).filter(m => {
      const hasSearchThreshold = filterSearch && filterSearch.length >= 3;
      const matchesSearch = hasSearchThreshold 
        ? `${m.nombre_insumo} ${m.lote} ${m.codigo_insumo}`.toLowerCase().includes(filterSearch.toLowerCase())
        : true;
        
      const matchesTurno = !filterTurno || m.turno === filterTurno;
      return matchesSearch && matchesTurno;
    });

    return list.sort((a, b) => getMovementTimeMs(b) - getMovementTimeMs(a));
  }, [allMovs, filterSearch, filterTurno]);

  const rawSpecificCount = filterTipo === 'Entrada' ? totalEntradas : totalSalidas;
  const activeTotalCount = (rawSpecificCount > 0 ? rawSpecificCount : totalMovs) || 1;

  const isFiltered = Boolean(filterSearch || filterDesde || filterHasta || filterTurno);
  
  const startRecord = filteredMovs.length > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endRecord = (currentPage - 1) * pageSize + filteredMovs.length;
  const totalFilteredExact = (maxDiscoveredPage - 1) * pageSize + (hasMore ? pageSize : lastPageLength);
  
  const { pages: pageNumbers, totalPages } = React.useMemo(() => {
    if (!isFiltered) {
      const totPages = Math.ceil(activeTotalCount / pageSize) || 1;
      const pages = [];
      const start = Math.max(1, currentPage - 2);
      const end = Math.min(totPages, currentPage + 2);
      for (let i = start; i <= end; i++) pages.push(i);
      return { pages, totalPages: totPages };
    } else {
      const maxP = hasMore ? maxDiscoveredPage + 1 : maxDiscoveredPage;
      const pages = [];
      for (let i = 1; i <= maxP; i++) pages.push(i);
      return { pages, totalPages: maxP };
    }
  }, [isFiltered, currentPage, pageSize, activeTotalCount, hasMore, maxDiscoveredPage, lastPageLength]);

  return (
    <>
      
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1 mb-4 animate-fade-in-up">
        <div className="flex items-center gap-3.5">
           <div className="w-11 h-11 bg-white shadow-sm rounded-2xl flex items-center justify-center border border-slate-100/60 shrink-0">
               <History className="text-primary-600" size={20} />
           </div>
           <div>
             <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-tight">Historial de Movimientos</h1>
             <p className="text-slate-400 text-[11px] font-medium mt-0.5 flex items-center gap-1.5">
               <span>Trazabilidad y Control</span>
               <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>
               <span className="text-emerald-600 font-semibold text-[10px] uppercase tracking-wider">Sincronizado en Vivo</span>
             </p>
           </div>
        </div>

        {/* Lado Derecho: Filtro de Operación por Rol */}
        {isEnfermero ? (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200/80 px-3.5 py-1.5 rounded-2xl text-rose-700 text-xs font-semibold shadow-2xs self-start sm:self-auto">
             <ArrowUpRight size={15} className="text-rose-600" />
             <span>Egresos (Salida)</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/70 shadow-2xs self-start sm:self-auto">
             <button
               onClick={() => { setFilterTipo('Entrada'); setFilterTurno(''); }}
               className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                 filterTipo === 'Entrada'
                   ? 'bg-emerald-600 text-white shadow-xs'
                   : 'text-slate-600 hover:text-emerald-700'
               }`}
             >
               <ArrowDownLeft size={14} />
               <span>Ingresos (Entrada)</span>
             </button>
             <button
               onClick={() => setFilterTipo('Salida')}
               className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                 filterTipo === 'Salida'
                   ? 'bg-rose-600 text-white shadow-xs'
                   : 'text-slate-600 hover:text-rose-700'
               }`}
             >
               <ArrowUpRight size={14} />
               <span>Egresos (Salida)</span>
             </button>
          </div>
        )}
      </header>

      {/* Panel de Filtros Estándar */}
      <section className="glass-card p-2.5 px-3.5 rounded-2xl border border-white/60 shadow-xs animate-fade-in-up mb-2.5 shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          
          {/* Búsqueda */}
          <div className={`${filterTipo === 'Entrada' ? 'md:col-span-7' : 'md:col-span-5'} space-y-1`}>
             <label className="text-[11px] font-semibold text-slate-500 block ml-1">Búsqueda inteligente</label>
             <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary-600 transition-colors">
                  <Search size={14} />
                </div>
                <input 
                  type="text" 
                  placeholder="Insumo, lote, personal..." 
                  value={filterSearch}
                  onChange={e => setFilterSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner placeholder:text-slate-400 font-medium"
                />
             </div>
          </div>

          {/* Fechas */}
          <div className={`${filterTipo === 'Entrada' ? 'md:col-span-5' : 'md:col-span-4'} space-y-1`}>
             <label className="text-[11px] font-semibold text-slate-500 block ml-1">Rango de fechas</label>
             <div className="flex items-center gap-2">
                <input type="date" value={filterDesde} onChange={e => setFilterDesde(e.target.value)} className="flex-1 px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-primary-500/50 shadow-inner" />
                <span className="text-slate-300 font-bold text-xs">→</span>
                <input type="date" value={filterHasta} onChange={e => setFilterHasta(e.target.value)} className="flex-1 px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl font-data text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-primary-500/50 shadow-inner" />
             </div>
          </div>

          {/* Turnos / Jornada (Solo relevante para Egresos/Salidas) */}
          {filterTipo !== 'Entrada' && (
            <div className="md:col-span-3 space-y-1">
               <label className="text-[11px] font-semibold text-slate-500 block ml-1">Jornada</label>
               <div className="flex bg-slate-100/60 p-0.5 rounded-xl border border-slate-200/40 shadow-inner gap-0.5">
                   {[
                     { id: '', label: 'Todos' },
                     { id: 'M', label: 'M', icon: Sun, title: 'Mañana' },
                     { id: 'T', label: 'T', icon: Sunset, title: 'Tarde' },
                     { id: 'N', label: 'N', icon: Moon, title: 'Noche' }
                   ].map(t => {
                     const Icon = t.icon;
                     const isSelected = filterTurno === t.id;
                     return (
                       <button
                         key={t.id}
                         onClick={() => setFilterTurno(t.id)}
                         title={t.title || 'Todos los turnos'}
                         className={`flex-1 h-6 flex items-center justify-center gap-0.5 rounded-lg text-[10px] font-semibold transition-all px-1 ${
                           isSelected 
                             ? 'bg-primary-600 text-white shadow-xs' 
                             : 'text-slate-500 hover:text-slate-800'
                         }`}
                       >
                         {Icon && <Icon size={10} className={isSelected ? 'text-white' : 'text-slate-400'} />}
                         <span>{t.label}</span>
                       </button>
                     );
                   })}
               </div>
            </div>
          )}
        </div>
      </section>

       {/* Tabla Premium de Movimientos Desktop (md en adelante) */}
      <div className="hidden md:flex flex-col flex-1 min-h-0 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm font-data mb-0">
        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
              <tr className="bg-slate-50/50">
                <th className="pl-4 pr-1 py-2.5 w-4"></th>
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide">Registro</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide">Insumo médico / Medicamento</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center">Cant.</th>
                {filterTipo !== 'Entrada' && (
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center">Turno</th>
                )}
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center">Operación</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide">Personal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px]">
              {dataLoading ? (
                <tr><td colSpan={filterTipo === 'Entrada' ? 6 : 7} className="py-20 text-center text-slate-400 italic font-bold">Cargando registros...</td></tr>
              ) : filteredMovs.length === 0 ? (
                <tr><td colSpan={filterTipo === 'Entrada' ? 6 : 7} className="py-20 text-center text-slate-400 italic font-bold">No hay movimientos registrados en este periodo.</td></tr>
              ) : (
                filteredMovs.map(m => {
                  const hour = m.fecha_registro?.seconds 
                    ? new Date(m.fecha_registro.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                    : '—';

                  const insumoFormato = m.nombre_insumo ? m.nombre_insumo.charAt(0).toUpperCase() + m.nombre_insumo.slice(1).toLowerCase() : '—';

                  return (
                    <React.Fragment key={m.id}>
                      <tr 
                        className={`hover:bg-slate-100/70 cursor-pointer transition-colors group ${
                          expandedRows[m.id] ? 'bg-blue-50/80 border-l-4 border-l-primary-600' : ''
                        }`} 
                        onClick={() => toggleRow(m.id)}
                      >
                        <td className="pl-4 pr-1 py-3.5 text-center w-4">
                          <ChevronRight size={13} className={`transition-transform duration-200 ${
                            expandedRows[m.id] ? 'rotate-90 text-primary-600' : 'text-slate-300 group-hover:text-slate-600'
                          }`} />
                        </td>
                        <td className="px-5 py-3.5">
                           <div className="font-data font-medium text-slate-600 tracking-tight text-[11px]">{m.fecha}</div>
                           <div className="text-[11px] font-medium text-slate-500 leading-none mt-1">Reg: {hour}</div>
                        </td>
                        <td className="px-5 py-3.5">
                           <div className="font-semibold text-slate-900 text-[13px] leading-tight mb-0.5">{insumoFormato}</div>
                           <div className="text-[11px] font-medium text-primary-600 leading-none">Cód: {m.codigo_insumo}</div>
                        </td>
                        <td className="px-5 py-3.5 text-center font-medium text-[12px] text-slate-700">{m.cantidad}</td>
                        {filterTipo !== 'Entrada' && (
                          <td className="px-5 py-3.5 text-center">
                              {m.turno ? (
                                <span 
                                  title={m.turno === 'M' ? 'Mañana' : m.turno === 'T' ? 'Tarde' : 'Noche'}
                                  className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border ${
                                    m.turno === 'M' ? 'bg-amber-50 text-amber-700 border-amber-200/60' : 
                                    m.turno === 'T' ? 'bg-blue-50 text-blue-700 border-blue-200/60' : 
                                    'bg-indigo-50 text-indigo-700 border-indigo-200/60'
                                  }`}
                                >
                                   {m.turno === 'M' && <Sun size={11} />}
                                   {m.turno === 'T' && <Sunset size={11} />}
                                   {m.turno === 'N' && <Moon size={11} />}
                                   <span>{m.turno}</span>
                                </span>
                              ) : '—'}
                           </td>
                        )}
                        <td className="px-5 py-3.5 text-center">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${
                            (m.tipo||'').toUpperCase() === 'CARGA_INICIAL' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                            (m.tipo||'').toUpperCase() === 'AJUSTE' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                            (m.tipo||'').toLowerCase().includes('entrada') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                            'bg-rose-50 text-rose-600 border-rose-100'
                          }`}>
                             { (m.tipo||'').toUpperCase() === 'CARGA_INICIAL' ? 'Carga inicial' : 
                               (m.tipo||'').toUpperCase() === 'AJUSTE' ? 'Ajuste stock' :
                               (m.tipo||'').toLowerCase().includes('entrada') ? 'Entrada' : 'Salida' }
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-600 text-[12px]">{getUserDisplayName(m)}</td>
                      </tr>
                      {expandedRows[m.id] && (
                        <tr className="bg-blue-50/20 border-b border-slate-100">
                          <td colSpan={filterTipo === 'Entrada' ? 6 : 7} className="px-5 py-3 border-l-4 border-l-primary-600">
                             <div className="bg-white py-2.5 px-4 rounded-xl border border-slate-200/70 shadow-sm animate-fade-in-up">
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                                   
                                   {/* Lote */}
                                   <div className="md:col-span-2 space-y-0.5">
                                      <span className="text-[10px] font-semibold text-slate-400 block border-b border-slate-50 pb-0.5">Lote</span>
                                      <span className="font-mono font-semibold text-primary-600 text-[12px] block truncate">{m.lote}</span>
                                   </div>

                                   {/* Trazabilidad */}
                                   <div className="md:col-span-2 space-y-0.5 border-l border-slate-100 pl-4">
                                      <span className="text-[10px] font-semibold text-slate-400 block border-b border-slate-50 pb-0.5">Registrado por</span>
                                      <span className="font-medium text-slate-700 text-[12px] block truncate">{getUserDisplayName(m)}</span>
                                   </div>

                                   {/* Transacción */}
                                   <div className="md:col-span-2 space-y-0.5 border-l border-slate-100 pl-4">
                                      <span className="text-[10px] font-semibold text-slate-400 block border-b border-slate-50 pb-0.5">ID de transacción</span>
                                      <span className="font-mono text-[10px] text-slate-400 block truncate">{m.id}</span>
                                   </div>

                                   {/* Observación */}
                                   <div className="md:col-span-3 space-y-0.5 border-l border-slate-100 pl-4">
                                      <span className="text-[10px] font-semibold text-slate-400 block border-b border-slate-50 pb-0.5">Observación</span>
                                      <span className={`text-[11px] block leading-tight ${m.observacion ? 'text-slate-700 font-medium' : 'text-slate-400 italic'}`}>
                                         {m.observacion ? m.observacion : 'Sin observaciones.'}
                                      </span>
                                   </div>

                                   {/* Acciones - Misma Fila */}
                                   <div className="md:col-span-3 flex flex-col gap-1 pl-4 border-l border-slate-100">
                                      {(isAdmin || isSupervisor) && (
                                        <button 
                                          onClick={() => handleOpenEdit(m)} 
                                          className="font-sans w-full flex items-center justify-center gap-1.5 py-1 bg-primary-50 text-primary-700 rounded-lg text-[11px] font-semibold hover:bg-primary-600 hover:text-white transition-all active:scale-95 border border-primary-100/50"
                                        >
                                           <Wrench size={11} /> Corregir datos
                                        </button>
                                      )}
                                      {canRevertMov(m) && (
                                        <button 
                                          onClick={() => handleEliminar(m)} 
                                          className="font-sans w-full flex items-center justify-center gap-1.5 py-1 bg-rose-50 text-rose-700 rounded-lg text-[11px] font-semibold hover:bg-rose-600 hover:text-white transition-all active:scale-95 border border-rose-100/50"
                                        >
                                           <Trash2 size={11} /> Revertir operación
                                        </button>
                                      )}
                                   </div>

                                </div>
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
        </div>

        {/* Barra de Paginación Integrada en la Tabla (Footer) */}
        <Pagination 
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={isFiltered ? (totalFilteredExact || (currentPage * pageSize)) : activeTotalCount}
          pageSize={pageSize}
          onPageChange={fetchPage}
          itemLabel="movimientos"
          disabled={isPaging}
        />
      </div>

      {/* Vista de Tarjetas Móvil (Menor a md - Sin Desplazamiento Horizontal) */}
      <div className="block md:hidden space-y-3 font-data mb-6">
        {dataLoading ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-100 text-slate-400 italic text-xs font-semibold animate-pulse">
            Cargando registros...
          </div>
        ) : filteredMovs.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-100 text-slate-400 italic text-xs font-semibold">
            No hay movimientos registrados en este periodo.
          </div>
        ) : (
          filteredMovs.map(m => {
            const hour = m.fecha_registro?.seconds 
              ? new Date(m.fecha_registro.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
              : '—';
            const insumoFormato = m.nombre_insumo ? m.nombre_insumo.charAt(0).toUpperCase() + m.nombre_insumo.slice(1).toLowerCase() : '—';
            const isExpanded = !!expandedRows[m.id];

            return (
              <div 
                key={m.id} 
                className={`bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2.5 transition-all ${
                  isExpanded ? 'border-l-4 border-l-primary-600 bg-blue-50/20' : ''
                }`}
              >
                {/* Línea 1: Fecha/Hora + Operación */}
                <div className="flex items-center justify-between text-xs">
                   <span className="font-data text-[11px] font-medium text-slate-600">{m.fecha} <span className="text-slate-300">•</span> <span className="text-slate-500 font-medium">Reg: {hour}</span></span>
                   <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-semibold border ${
                     (m.tipo||'').toUpperCase() === 'CARGA_INICIAL' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                     (m.tipo||'').toUpperCase() === 'AJUSTE' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                     (m.tipo||'').toLowerCase().includes('entrada') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                     'bg-rose-50 text-rose-600 border-rose-100'
                   }`}>
                      { (m.tipo||'').toUpperCase() === 'CARGA_INICIAL' ? 'Carga inicial' : 
                        (m.tipo||'').toUpperCase() === 'AJUSTE' ? 'Ajuste stock' :
                        (m.tipo||'').toLowerCase().includes('entrada') ? 'Entrada' : 'Salida' }
                   </span>
                </div>

                {/* Línea 2: Nombre del Insumo a 100% de Ancho */}
                <div>
                   <h3 className="font-semibold text-slate-900 text-[13px] leading-snug w-full">{insumoFormato}</h3>
                </div>

                {/* Línea 3: Código, Cantidad y Personal */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-50 text-xs">
                   <div className="flex items-center gap-2">
                      <span className="text-[11px] text-primary-600 font-medium">Cód: {m.codigo_insumo}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[11px] font-semibold text-slate-800">Cant: {m.cantidad}</span>
                   </div>
                   <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-600 font-medium">{getUserDisplayName(m)}</span>
                   </div>
                </div>

                {/* Línea 4: Botón Desplegable */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                   <button 
                     onClick={() => toggleRow(m.id)}
                     className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-800 py-1"
                   >
                     <span>{isExpanded ? 'Ocultar detalles' : 'Ver detalle transacción'}</span>
                     <ChevronRight size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                   </button>
                </div>

                {/* Panel Desplegado en Móvil */}
                {isExpanded && (
                  <div className="pt-2.5 border-t border-slate-100 space-y-2 text-xs animate-fade-in">
                     <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/60">
                        <div>
                           <span className="text-[10px] text-slate-400 block font-semibold">Lote</span>
                           <span className="font-mono text-[11px] font-semibold text-primary-600">{m.lote}</span>
                        </div>
                        <div>
                           <span className="text-[10px] text-slate-400 block font-semibold">Registrado por</span>
                           <span className="text-[11px] font-medium text-slate-700">{getUserDisplayName(m)}</span>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-slate-100">
                           <span className="text-[10px] text-slate-400 block font-semibold">ID Transacción</span>
                           <span className="font-mono text-[10px] text-slate-400">{m.id}</span>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-slate-100">
                           <span className="text-[10px] text-slate-400 block font-semibold">Observación</span>
                           <span className="text-[11px] text-slate-700 italic">{m.observacion || 'Sin observaciones.'}</span>
                        </div>
                     </div>

                     <div className="flex flex-col gap-1.5 pt-1">
                        {(isAdmin || isSupervisor) && (
                          <button 
                            onClick={() => handleOpenEdit(m)} 
                            className="font-sans w-full flex items-center justify-center gap-1.5 py-1.5 bg-primary-50 text-primary-700 rounded-lg text-xs font-semibold"
                          >
                             <Wrench size={12} /> Corregir datos
                          </button>
                        )}
                        {canRevertMov(m) && (
                          <button 
                            onClick={() => handleEliminar(m)} 
                            className="font-sans w-full flex items-center justify-center gap-1.5 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold"
                          >
                             <Trash2 size={12} /> Revertir operación
                          </button>
                        )}
                      </div>
                   </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Paginación Móvil (debajo de las tarjetas, misma integración) */}
      <div className="block md:hidden">
        <Pagination 
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={isFiltered ? (totalFilteredExact || (currentPage * pageSize)) : activeTotalCount}
          pageSize={pageSize}
          onPageChange={fetchPage}
          itemLabel="movimientos"
          disabled={isPaging}
          className="rounded-2xl border border-slate-200/80 shadow-xs"
        />
      </div>

      {/* MODAL EDICION PREMIUM */}
      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
             <div className="bg-white w-full max-w-sm sm:max-w-md rounded-3xl shadow-2xl animate-zoom-in overflow-hidden border border-white/50 text-slate-700 relative">
                <div className="p-6 sm:p-7">
                  <div className="flex items-center justify-between mb-4">
                     <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
                       <Wrench className="text-primary-500" size={18} />
                       {modalTitle}
                     </h2>
                     <button onClick={() => setShowEditModal(false)} className="text-slate-300 hover:text-rose-500 transition-colors p-1 rounded-lg">
                        <X size={18} />
                     </button>
                  </div>

                  <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 mb-5 space-y-2 text-left shadow-2xs">
                     <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-primary-600 uppercase tracking-wider">
                           Registro original
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                           <span className="px-2 py-0.5 rounded-md text-[11px] font-mono text-slate-700 bg-white border border-slate-200/70 font-semibold shadow-2xs">
                              Cód: {editingMov?.codigo_insumo}
                           </span>
                           <span className="px-2 py-0.5 rounded-md text-[11px] font-mono text-slate-700 bg-white border border-slate-200/70 font-semibold shadow-2xs">
                              Lote: {editingMov?.lote || 'N/A'}
                           </span>
                           { (editingMov?.fecha || editingMov?.fecha_vencimiento) && (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono text-slate-700 bg-white border border-slate-200/70 font-semibold shadow-2xs">
                                 Fecha: {editingMov?.fecha || editingMov?.fecha_vencimiento}
                              </span>
                           )}
                        </div>
                     </div>

                     <h3 className="text-[13px] font-bold text-slate-800 leading-snug">
                        {editingMov?.nombre_insumo ? editingMov.nombre_insumo.charAt(0).toUpperCase() + editingMov.nombre_insumo.slice(1).toLowerCase() : ''}
                     </h3>

                     <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1 text-slate-500">
                           <span>Autor original:</span>
                           <span className="font-semibold text-slate-700">{getUserDisplayName(editingMov)}</span>
                        </div>
                        {editingMov?.fecha && (
                           <div className="text-[11px] text-slate-400">
                              <span>Reg: </span>
                              <span className="font-semibold text-slate-600">{editingMov.fecha}</span>
                           </div>
                        )}
                     </div>
                  </div>

                  <form onSubmit={handleEditSave} className="space-y-4">
                     <div className="grid grid-cols-2 gap-3">
                         <div className="text-left space-y-1.5">
                           <label className="text-[11px] font-semibold text-slate-500 block ml-1">Cantidad</label>
                           <input 
                             type="number" 
                             required
                             value={editForm.cantidad} 
                             onChange={e => setEditForm({...editForm, cantidad: e.target.value})} 
                             className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium" 
                           />
                         </div>
                         <div className="text-left space-y-1.5">
                           <label className="text-[11px] font-semibold text-slate-500 block ml-1">Lote</label>
                           <div className="relative">
                             { isEntradaMov ? (
                               <>
                                 <input 
                                   list="lotes-list"
                                   value={editForm.lote} 
                                   onChange={e => setEditForm({...editForm, lote: e.target.value.toUpperCase()})} 
                                   className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium"
                                   placeholder="Escribe o selecciona..."
                                 />
                                 <datalist id="lotes-list">
                                   {lotesSugeridos.map(l => <option key={l} value={l} />)}
                                 </datalist>
                               </>
                             ) : (
                               <>
                                 <select 
                                   value={editForm.lote} 
                                   onChange={e => setEditForm({...editForm, lote: e.target.value})} 
                                   className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium cursor-pointer"
                                 >
                                   <option value="">Selecciona un lote...</option>
                                   {lotesSugeridos.map(l => (
                                     <option key={l} value={l}>{l}</option>
                                   ))}
                                 </select>
                               </>
                             )}
                           </div>
                         </div>
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                         <div className="text-left space-y-1.5">
                           <label className="text-[11px] font-semibold text-slate-500 block ml-1">
                             { isEntradaMov 
                                ? 'Fecha de vencimiento' 
                                : 'Fecha de uso' 
                             }
                           </label>
                           <input 
                             type="date" 
                             value={ isEntradaMov 
                                      ? editForm.fecha_vencimiento 
                                      : editForm.fecha 
                                   } 
                             onChange={e => {
                                if (isEntradaMov) {
                                  setEditForm({...editForm, fecha_vencimiento: e.target.value})
                                } else {
                                  setEditForm({...editForm, fecha: e.target.value})
                                }
                             }} 
                             className="w-full px-3.5 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium" 
                           />
                         </div>
                         
                         { !isEntradaMov && (
                           <div className="text-left space-y-1.5">
                             <label className="text-[11px] font-semibold text-slate-500 block ml-1">Turno</label>
                             <select 
                               value={editForm.turno} 
                               onChange={e => setEditForm({...editForm, turno: e.target.value})} 
                               className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all font-data text-xs text-slate-700 shadow-inner font-medium cursor-pointer"
                             >
                                 <option value="M">Mañana</option>
                                 <option value="T">Tarde</option>
                                 <option value="N">Noche</option>
                             </select>
                           </div>
                         )}
                     </div>

                     <div className="text-left space-y-1.5">
                         <label className="text-[11px] font-semibold text-slate-500 block ml-1 flex items-center justify-between">
                            <span>Motivo de la corrección</span>
                            <span className="text-[10px] text-slate-400 font-normal">Requerido</span>
                         </label>
                         <textarea 
                           required
                           value={editForm.observacion} 
                           onChange={e => setEditForm({...editForm, observacion: e.target.value})} 
                           className="w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl focus:bg-white focus:border-primary-500/50 outline-none transition-all text-xs text-slate-700 shadow-inner placeholder:text-slate-400 font-medium resize-none" 
                           rows="2"
                           placeholder="Explica brevemente por qué se corrige este registro..."
                         ></textarea>
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
                           className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold text-xs tracking-wide shadow-md transition-all active:scale-95"
                         >
                           <CheckCircle size={14} />
                           Guardar cambios
                         </button>
                     </div>
                  </form>
                </div>
             </div>
          </div>
      )}

       {/* MODAL: CONFIRMAR REVERSIÓN DE MOVIMIENTO */}
       {showRevertModal && revertTarget && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
           <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-zoom-in relative">
              <div className="p-6 sm:p-7">
                 <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      <RotateCcw className="text-rose-600" size={18} /> Confirmar reversión
                    </h2>
                    <button 
                      onClick={() => { setShowRevertModal(false); setRevertTarget(null); setMotivoReversion(''); }} 
                      className="text-slate-400 hover:text-rose-500 transition-colors p-1 rounded-lg"
                    >
                      <X size={18} />
                    </button>
                 </div>

                 <p className="text-xs text-slate-500 leading-relaxed mb-4">
                   El stock se ajustará automáticamente y el movimiento será retirado del Kárdex operativo. La reversión quedará registrada en la bitácora de auditoría.
                 </p>

                 {/* Ficha Resumen del Movimiento (Sin Emojis, con Lucide Icons) */}
                 <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 mb-4 text-xs space-y-2">
                   <div className="flex items-center justify-between font-bold text-amber-950 text-xs">
                     <span className="flex items-center gap-1.5">
                       <Boxes size={15} className="text-amber-700" />
                       {revertTarget.nombre_insumo}
                     </span>
                     <span className="px-2 py-0.5 rounded-full bg-amber-100/80 text-amber-800 text-[10px] uppercase font-bold">
                       {revertTarget.tipo}
                     </span>
                   </div>
                   <div className="grid grid-cols-2 gap-2 text-[11px] text-amber-900/90 pt-2 border-t border-amber-200/60">
                     <div><span className="font-semibold text-amber-950">Cantidad:</span> {revertTarget.cantidad} u.</div>
                     <div><span className="font-semibold text-amber-950">Lote:</span> {revertTarget.lote || 'N/A'}</div>
                     <div><span className="font-semibold text-amber-950">Fecha:</span> {revertTarget.fecha || 'N/A'}</div>
                     <div><span className="font-semibold text-amber-950">Turno:</span> {revertTarget.turno ? (revertTarget.turno === 'M' ? 'Mañana' : revertTarget.turno === 'T' ? 'Tarde' : 'Noche') : 'N/A'}</div>
                     <div className="col-span-2 pt-1 border-t border-amber-200/40 text-[11px] text-amber-950 flex items-center gap-1.5">
                       <User size={13} className="text-amber-700" />
                       <span><strong>Registrado por:</strong> {getUserDisplayName(revertTarget)}</span>
                     </div>
                   </div>
                 </div>

                 {/* Textarea Motivo */}
                 <div className="space-y-1.5 mb-5 text-left">
                   <label className="text-[11px] font-semibold text-slate-600 block ml-0.5">
                     Motivo o justificación obligatoria <span className="text-rose-500">*</span>
                   </label>
                   <textarea
                     rows={3}
                     value={motivoReversion}
                     onChange={(e) => setMotivoReversion(e.target.value)}
                     placeholder="Describa el motivo detallado de la reversión (mínimo 10 caracteres)..."
                     className="w-full px-3.5 py-2.5 bg-slate-50/60 border border-slate-200/80 rounded-xl focus:bg-white focus:border-rose-500/50 outline-none text-xs text-slate-700 font-medium shadow-inner transition-all resize-none"
                   />
                 </div>

                 {/* Botones Estándar del Sistema */}
                 <div className="flex items-center gap-2.5">
                   <button
                     type="button"
                     onClick={() => { setShowRevertModal(false); setRevertTarget(null); setMotivoReversion(''); }}
                     className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition-all"
                   >
                     Cancelar
                   </button>
                   <button
                     type="button"
                     disabled={loading || motivoReversion.trim().length < 10}
                     onClick={confirmExecuteReversion}
                     className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                   >
                     <RotateCcw size={14} />
                     {loading ? 'Revertiendo...' : 'Revertir y Ajustar Stock'}
                   </button>
                 </div>
              </div>
           </div>
        </div>
       )}
    </>
  );
};

export default Historial;
