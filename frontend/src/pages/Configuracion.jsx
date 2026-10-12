import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, doc, writeBatch, Timestamp, deleteDoc, updateDoc, getDoc, limit, orderBy } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useArea } from '../contexts/AreaContext';
import { useData } from '../contexts/DataContext';
import Swal from 'sweetalert2';
import Pagination from '../components/Pagination';
import { 
  Settings, 
  ClipboardCheck, 
  Calendar, 
  FileText, 
  Search, 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowDownRight,
  ShieldAlert,
  Building2,
  Lock,
  Upload,
  Trash2,
  Image as ImageIcon,
  FileSpreadsheet,
  Eye,
  UserCheck,
  RefreshCw,
  Plus,
  FolderKanban,
  Tags,
  Edit3,
  Check,
  X,
  Layers,
  Wrench,
  ShieldCheck,
  AlertTriangle,
  Database,
  Filter,
  CheckSquare,
  Square
} from 'lucide-react';
import { CATEGORIAS_DETALLADAS } from '../utils/constants';

const compressImageToBase64 = (file, maxWidth = 250, maxHeight = 250) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/png', 0.8);
        resolve(compressedBase64);
      };
      img.onerror = (err) => reject(err);
      img.src = e.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

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

const getTwoMonthsAgoDate = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  // Set to last day of that month for clean accounting
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(new Date(year, d.getMonth() + 1, 0).getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Configuracion = () => {
  const { isSupervisor, isSuperAdmin, userData } = useAuth();
  const { area } = useArea();
  const { 
    insumos, logAudit, getHeaderConfig, saveHeaderConfig,
    getCategoriesForArea, saveCategoriesForArea, renameCategoryCascade
  } = useData();

  const [activeTab, setActiveTab] = useState('encabezados');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [saving, setSaving] = useState(false);

  // Parámetros de Conciliación
  const [fechaHistorica, setFechaHistorica] = useState(getTwoMonthsAgoDate());
  const [justificacion, setJustificacion] = useState('');
  
  // Mapa de stock físico ingresado por insumo ID: { [insumoId]: number }
  const [physicalCounts, setPhysicalCounts] = useState({});

  // Estados para Encabezados Institucionales
  const [selectedConfigArea, setSelectedConfigArea] = useState(['Emergencia', 'Encamamiento'].includes(area) ? area : 'Emergencia');
  const [headerForm, setHeaderForm] = useState({
    institucion: 'Instituto Guatemalteco de Seguridad Social',
    unidad_medica: 'Hospital General IGSS Sololá',
    subtitulo_sps: 'Control de existencias físicas de {categoria} en resguardo en servicio de enfermería.',
    jefe_servicio: '',
    codigo_formulario: 'SPS 1062',
    titulo_periodo_med: 'REGISTRO DE MEDICAMENTOS DEL CARRO DE URGENCIAS',
    titulo_periodo_mq: 'REGISTRO DE MATERIAL MÉDICO QUIRÚRGICO DE EMERGENCIA',
    titulos_por_categoria: {},
    campos_adicionales: [],
    logoBase64: '',
    logoUrl: ''
  });
  const [loadingHeaderConfig, setLoadingHeaderConfig] = useState(false);
  const [savingHeaderConfig, setSavingHeaderConfig] = useState(false);
  const [previewTab, setPreviewTab] = useState('sps1062'); // 'sps1062' | 'periodos'

  // Estados para Gestión Dinámica de Categorías por Área
  const [selectedCatArea, setSelectedCatArea] = useState(['Emergencia', 'Encamamiento'].includes(area) ? area : 'Emergencia');
  const [areaCategories, setAreaCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [savingCategories, setSavingCategories] = useState(false);
  const [catFilterSearch, setCatFilterSearch] = useState('');

  // Modal de Nueva / Edición de Categoría
  const [showCatModal, setShowCatModal] = useState(false);
  const [catModalMode, setCatModalMode] = useState('new'); // 'new' | 'edit'
  const [editingCatObj, setEditingCatObj] = useState(null);
  const [catForm, setCatForm] = useState({
    codigo: '',
    nombre: '',
    categoria_maestra: 'Medicamento',
    activa: true
  });

  // Para agregar un título personalizado de categoría específica
  const [newCatName, setNewCatName] = useState(CATEGORIAS_DETALLADAS[0] || '');
  const [newCatTitle, setNewCatTitle] = useState('');

  // Estados para Depuración y Edición Directa (Super Admin)
  const [adminCollection, setAdminCollection] = useState('movimientos'); // 'movimientos' | 'insumos' | 'auditoria' | 'lotes'
  const [adminSearch, setAdminSearch] = useState('');
  const [adminResults, setAdminResults] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState([]);

  // Modal de Edición Silenciosa Super Admin
  const [showAdminEditModal, setShowAdminEditModal] = useState(false);
  const [editingAdminDoc, setEditingAdminDoc] = useState(null);
  const [adminEditForm, setAdminEditForm] = useState({});
  const [savingAdminEdit, setSavingAdminEdit] = useState(false);
  const [adminPage, setAdminPage] = useState(1);
  const adminPerPage = 25;

  // Búsqueda Ultra-Optimizada a Demanda (0 lecturas al cargar, máx. 1-30 lecturas por búsqueda específica)
  const handleSearchAdminDocs = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!isSuperAdmin) return;
    setAdminPage(1);

    const q = adminSearch.trim();
    if (!q) {
      Swal.fire({
        title: 'Búsqueda Requerida',
        text: 'Por favor ingresa un ID de documento o código de insumo para buscar sin consumir lecturas masivas.',
        icon: 'info',
        confirmButtonColor: '#0f172a'
      });
      return;
    }

    setAdminLoading(true);
    setSelectedDocIds([]);
    const foundDocsMap = new Map();

    try {
      // 1. Intentar consulta por ID directo en Firestore (1 sola lectura)
      try {
        const docRef = doc(db, adminCollection, q);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          foundDocsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        }
      } catch (e) {
        // Ignorar si el string no es un path válido
      }

      // 2. Consultas por código con límite estricto de 30 lecturas
      if (adminCollection === 'movimientos') {
        const q1 = query(collection(db, 'movimientos'), where('codigo_insumo', '==', q), limit(30));
        const snap1 = await getDocs(q1);
        snap1.docs.forEach(d => foundDocsMap.set(d.id, { id: d.id, ...d.data() }));

        const q1Str = query(collection(db, 'movimientos'), where('codigo_insumo', '==', String(q)), limit(30));
        const snap1Str = await getDocs(q1Str);
        snap1Str.docs.forEach(d => foundDocsMap.set(d.id, { id: d.id, ...d.data() }));
      } else if (adminCollection === 'insumos') {
        const q1 = query(collection(db, 'insumos'), where('codigo', '==', q), limit(30));
        const snap1 = await getDocs(q1);
        snap1.docs.forEach(d => foundDocsMap.set(d.id, { id: d.id, ...d.data() }));

        const q1Str = query(collection(db, 'insumos'), where('codigo', '==', String(q)), limit(30));
        const snap1Str = await getDocs(q1Str);
        snap1Str.docs.forEach(d => foundDocsMap.set(d.id, { id: d.id, ...d.data() }));
      } else if (adminCollection === 'auditoria') {
        const q1 = query(collection(db, 'auditoria'), where('registroId', '==', q), limit(30));
        const snap1 = await getDocs(q1);
        snap1.docs.forEach(d => foundDocsMap.set(d.id, { id: d.id, ...d.data() }));
      } else if (adminCollection === 'lotes') {
        const q1 = query(collection(db, 'lotes'), where('codigo_insumo', '==', q), limit(30));
        const snap1 = await getDocs(q1);
        snap1.docs.forEach(d => foundDocsMap.set(d.id, { id: d.id, ...d.data() }));
      }

      // 3. Fallback de muestra (máximo 40 registros) si no se encontró por ID ni por código exacto
      if (foundDocsMap.size === 0) {
        const fallbackQ = query(collection(db, adminCollection), limit(40));
        const fallbackSnap = await getDocs(fallbackQ);
        const searchLower = q.toLowerCase();

        fallbackSnap.docs.forEach(d => {
          const item = d.data();
          const docId = d.id.toLowerCase();
          const codigo = String(item.codigo || item.codigo_insumo || item.registroId || '').toLowerCase();
          const nombre = (item.nombre || item.nombre_insumo || item.descripcion || item.accion || item.lote || '').toLowerCase();
          const usuario = (item.registrado_por || item.usuario || item.usuario_id || item.usuario_nombre || '').toLowerCase();
          const observacion = (item.observacion || item.justificacion || '').toLowerCase();
          const areaItem = (item.area || '').toLowerCase();

          if (
            docId.includes(searchLower) || 
            codigo.includes(searchLower) || 
            nombre.includes(searchLower) || 
            usuario.includes(searchLower) || 
            observacion.includes(searchLower) ||
            areaItem.includes(searchLower)
          ) {
            foundDocsMap.set(d.id, { id: d.id, ...item });
          }
        });
      }

      const resultsArray = Array.from(foundDocsMap.values());
      setAdminResults(resultsArray);

      if (resultsArray.length === 0) {
        Swal.fire({
          title: 'Sin resultados',
          text: `No se encontró ningún registro en '${adminCollection}' para: "${q}".`,
          icon: 'info',
          confirmButtonColor: '#0f172a'
        });
      }
    } catch (err) {
      console.error("Error al buscar en Firestore:", err);
      Swal.fire('Error', 'Ocurrió un problema durante la búsqueda: ' + err.message, 'error');
    } finally {
      setAdminLoading(false);
    }
  };

  // Alternar selección individual
  const handleToggleSelectDoc = (id) => {
    setSelectedDocIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Seleccionar / Deseleccionar todos
  const handleToggleSelectAllDocs = () => {
    if (selectedDocIds.length === adminResults.length) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(adminResults.map(d => d.id));
    }
  };

  // Borrado Único Permanente (Sin Auditoría)
  const handleDeleteAdminDoc = async (item) => {
    const result = await Swal.fire({
      title: '¿Eliminar Permanentemente?',
      html: `
        <div className="text-left text-xs text-slate-600 space-y-2 mt-1">
          <p>Estás a punto de eliminar <b>PERMANENTEMENTE</b> este registro de Firestore:</p>
          <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 font-mono text-[11px]">
            <div><b>ID Documento:</b> ${item.id}</div>
            <div><b>Colección:</b> ${adminCollection}</div>
            <div><b>Detalle:</b> ${item.nombre || item.nombre_insumo || item.descripcion || item.codigo || '—'}</div>
          </div>
          <p className="text-rose-600 font-bold">⚠️ Esta acción NO generará ningún registro en la bitácora de auditoría.</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar de Firestore',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      customClass: { popup: 'rounded-3xl' }
    });

    if (!result.isConfirmed) return;

    try {
      await deleteDoc(doc(db, adminCollection, item.id));
      setAdminResults(prev => prev.filter(d => d.id !== item.id));
      setSelectedDocIds(prev => prev.filter(id => id !== item.id));

      Swal.fire({
        title: 'Registro Eliminado',
        text: `El documento con ID ${item.id} se eliminó correctamente sin rastro en auditoría.`,
        icon: 'success',
        confirmButtonColor: '#0f172a',
        customClass: { popup: 'rounded-3xl' }
      });
    } catch (err) {
      console.error("Error al eliminar documento:", err);
      Swal.fire('Error', 'No se pudo eliminar el registro: ' + err.message, 'error');
    }
  };

  // Borrado Masivo Permanente (Sin Auditoría)
  const handleBulkDeleteAdminDocs = async () => {
    if (selectedDocIds.length === 0) return;

    const result = await Swal.fire({
      title: `¿Eliminar ${selectedDocIds.length} registros?`,
      html: `
        <div className="text-left text-xs text-slate-600 space-y-2 mt-1">
          <p>Se borrarán permanentemente <b>${selectedDocIds.length} documento(s)</b> de la colección <b>${adminCollection}</b>.</p>
          <p className="text-rose-600 font-bold">⚠️ Esta acción NO se registrará en la bitácora de auditoría.</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: `Sí, eliminar ${selectedDocIds.length} registros`,
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      customClass: { popup: 'rounded-3xl' }
    });

    if (!result.isConfirmed) return;

    try {
      const batch = writeBatch(db);
      selectedDocIds.forEach(id => {
        batch.delete(doc(db, adminCollection, id));
      });
      await batch.commit();

      setAdminResults(prev => prev.filter(d => !selectedDocIds.includes(d.id)));
      setSelectedDocIds([]);

      Swal.fire({
        title: 'Eliminación Masiva Completada',
        text: `Se eliminaron ${selectedDocIds.length} registros correctamente sin rastro en auditoría.`,
        icon: 'success',
        confirmButtonColor: '#0f172a',
        customClass: { popup: 'rounded-3xl' }
      });
    } catch (err) {
      console.error("Error en borrado masivo:", err);
      Swal.fire('Error', 'Error durante la eliminación masiva: ' + err.message, 'error');
    }
  };

  // Abrir Modal de Edición Silenciosa
  const handleOpenAdminEditModal = (item) => {
    setEditingAdminDoc(item);
    const formCopy = { ...item };
    delete formCopy.id;
    setAdminEditForm(formCopy);
    setShowAdminEditModal(true);
  };

  // Guardar Edición Silenciosa (Sin Auditoría)
  const handleSaveAdminEdit = async (e) => {
    e.preventDefault();
    if (!editingAdminDoc) return;
    setSavingAdminEdit(true);

    try {
      await updateDoc(doc(db, adminCollection, editingAdminDoc.id), adminEditForm);

      setAdminResults(prev => prev.map(d => d.id === editingAdminDoc.id ? { ...d, ...adminEditForm } : d));

      Swal.fire({
        title: 'Registro Editado (Silencioso)',
        text: `El documento ID ${editingAdminDoc.id} fue actualizado en Firestore sin registrar nada en la auditoría.`,
        icon: 'success',
        confirmButtonColor: '#0f172a',
        customClass: { popup: 'rounded-3xl' }
      });

      setShowAdminEditModal(false);
      setEditingAdminDoc(null);
    } catch (err) {
      console.error("Error al guardar edición silenciosa:", err);
      Swal.fire('Error', 'No se pudo actualizar el registro: ' + err.message, 'error');
    } finally {
      setSavingAdminEdit(false);
    }
  };

  // Cargar categorías del área seleccionada
  useEffect(() => {
    if (activeTab === 'categorias' && getCategoriesForArea) {
      setLoadingCategories(true);
      getCategoriesForArea(selectedCatArea).then(cats => {
        setAreaCategories(cats || []);
        setLoadingCategories(false);
      }).catch(err => {
        console.error("Error al cargar categorías del área:", err);
        setLoadingCategories(false);
      });
    }
  }, [activeTab, selectedCatArea]);

  // Manejadores para Modales y CRUD de Categorías
  const handleOpenNewCatModal = () => {
    setCatModalMode('new');
    setEditingCatObj(null);
    setCatForm({
      codigo: '',
      nombre: '',
      categoria_maestra: 'Medicamento',
      activa: true
    });
    setShowCatModal(true);
  };

  const handleOpenEditCatModal = (cat) => {
    setCatModalMode('edit');
    setEditingCatObj(cat);
    setCatForm({
      codigo: cat.codigo || '',
      nombre: cat.nombre || '',
      categoria_maestra: cat.categoria_maestra || 'Medicamento',
      activa: cat.activa !== false
    });
    setShowCatModal(true);
  };

  const handleSaveCatSubmit = async (e) => {
    e.preventDefault();
    if (!catForm.codigo.trim() || !catForm.nombre.trim()) {
      Swal.fire('Campos Obligatorios', 'Por favor ingresa tanto el código como el nombre de la categoría.', 'warning');
      return;
    }

    const codUpper = catForm.codigo.trim().toUpperCase();
    const nomTrim = catForm.nombre.trim();

    // Validar código duplicado
    const dupCod = areaCategories.find(c => (c.codigo || '').toUpperCase() === codUpper && (catModalMode === 'new' || c.id !== editingCatObj?.id));
    if (dupCod) {
      Swal.fire('Código Duplicado', `El código '${codUpper}' ya pertenece a la categoría '${dupCod.nombre}'.`, 'warning');
      return;
    }

    setSavingCategories(true);
    try {
      if (catModalMode === 'new') {
        const newCatItem = {
          id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          codigo: codUpper,
          nombre: nomTrim,
          categoria_maestra: catForm.categoria_maestra,
          activa: catForm.activa
        };
        const updatedList = [...areaCategories, newCatItem];
        await saveCategoriesForArea(selectedCatArea, updatedList);
        setAreaCategories(updatedList);
        Swal.fire({
          title: 'Categoría Creada',
          text: `La categoría '${nomTrim}' fue agregada exitosamente para el área ${selectedCatArea}.`,
          icon: 'success',
          confirmButtonColor: '#0f172a'
        });
        setShowCatModal(false);
      } else {
        const oldName = editingCatObj.nombre;
        const updatedCatItem = {
          ...editingCatObj,
          codigo: codUpper,
          nombre: nomTrim,
          categoria_maestra: catForm.categoria_maestra,
          activa: catForm.activa
        };
        const updatedList = areaCategories.map(c => c.id === editingCatObj.id ? updatedCatItem : c);

        if (oldName !== nomTrim) {
          const result = await Swal.fire({
            title: '¿Confirmar cambio de nombre?',
            text: `Estás modificando el nombre de '${oldName}' a '${nomTrim}'. Se actualizarán automáticamente los insumos registrados bajo esta categoría en el área ${selectedCatArea}.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, aplicar cambio',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#0f172a'
          });

          if (!result.isConfirmed) {
            setSavingCategories(false);
            return;
          }

          await renameCategoryCascade(selectedCatArea, oldName, updatedCatItem, updatedList);
        } else {
          await saveCategoriesForArea(selectedCatArea, updatedList);
        }

        setAreaCategories(updatedList);
        Swal.fire({
          title: 'Categoría Actualizada',
          text: `La categoría '${nomTrim}' ha sido guardada correctamente.`,
          icon: 'success',
          confirmButtonColor: '#0f172a'
        });
        setShowCatModal(false);
      }
    } catch (err) {
      console.error("Error al guardar categoría:", err);
      Swal.fire('Error', 'No se pudo guardar la categoría: ' + err.message, 'error');
    } finally {
      setSavingCategories(false);
    }
  };

  const handleToggleCatActive = async (cat) => {
    const updatedList = areaCategories.map(c => c.id === cat.id ? { ...c, activa: !c.activa } : c);
    setAreaCategories(updatedList);
    try {
      await saveCategoriesForArea(selectedCatArea, updatedList);
    } catch (err) {
      console.error("Error al alternar estado de categoría:", err);
      setAreaCategories(areaCategories); // revert
    }
  };

  const handleDeleteCat = async (cat) => {
    const insumosVinculados = insumos.filter(i => (i.area || area) === selectedCatArea && i.categoria === cat.nombre);
    if (insumosVinculados.length > 0) {
      Swal.fire({
        title: 'No se puede eliminar',
        text: `Existen ${insumosVinculados.length} insumo(s) registrados con la categoría '${cat.nombre}' en ${selectedCatArea}. Te sugerimos desactivarla o reasignar los insumos primero.`,
        icon: 'warning',
        confirmButtonColor: '#0f172a'
      });
      return;
    }

    const confirm = await Swal.fire({
      title: '¿Eliminar categoría?',
      text: `¿Estás seguro de eliminar la categoría '${cat.nombre}' del área ${selectedCatArea}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444'
    });

    if (confirm.isConfirmed) {
      const updatedList = areaCategories.filter(c => c.id !== cat.id);
      setAreaCategories(updatedList);
      try {
        await saveCategoriesForArea(selectedCatArea, updatedList);
        Swal.fire('Eliminada', `La categoría '${cat.nombre}' ha sido eliminada.`, 'success');
      } catch (err) {
        console.error("Error al eliminar categoría:", err);
        Swal.fire('Error', 'No se pudo eliminar la categoría: ' + err.message, 'error');
      }
    }
  };

  // Cargar configuración de encabezados cuando cambia el área seleccionada
  useEffect(() => {
    if (selectedConfigArea && getHeaderConfig) {
      setLoadingHeaderConfig(true);
      getHeaderConfig(selectedConfigArea).then(config => {
        setHeaderForm(prev => ({
          ...prev,
          institucion: 'Instituto Guatemalteco de Seguridad Social',
          unidad_medica: 'Hospital General IGSS Sololá',
          subtitulo_sps: 'Control de existencias físicas de {categoria} en resguardo en servicio de enfermería.',
          codigo_formulario: 'SPS 1062',
          titulo_periodo_med: 'REGISTRO DE MEDICAMENTOS DEL CARRO DE URGENCIAS',
          titulo_periodo_mq: 'REGISTRO DE MATERIAL MÉDICO QUIRÚRGICO DE EMERGENCIA',
          titulos_por_categoria: {},
          campos_adicionales: [],
          logoBase64: '',
          logoUrl: '',
          ...config
        }));
        setLoadingHeaderConfig(false);
      }).catch(err => {
        console.error("Error cargando configuración de encabezados:", err);
        setLoadingHeaderConfig(false);
      });
    }
  }, [selectedConfigArea]);

  // Manejador de subida de Logo con compresión Canvas (< 50KB)
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      Swal.fire({
        title: 'Formato no válido',
        text: 'Por favor selecciona un archivo de imagen (PNG, JPG, SVG).',
        icon: 'warning',
        confirmButtonColor: '#0f172a'
      });
      return;
    }

    try {
      const compressedBase64 = await compressImageToBase64(file);
      setHeaderForm(prev => ({ ...prev, logoBase64: compressedBase64, logoUrl: '' }));
    } catch (err) {
      console.error("Error al comprimir la imagen:", err);
      Swal.fire('Error', 'No se pudo optimizar la imagen subida.', 'error');
    }
  };

  const handleRemoveLogo = () => {
    setHeaderForm(prev => ({ ...prev, logoBase64: '', logoUrl: '' }));
  };

  // Agregar/Remover Campos Adicionales de Metadatos
  const handleAddCustomField = () => {
    setHeaderForm(prev => ({
      ...prev,
      campos_adicionales: [
        ...(prev.campos_adicionales || []),
        { etiqueta: '', valor: '' }
      ]
    }));
  };

  const handleUpdateCustomField = (index, field, value) => {
    setHeaderForm(prev => {
      const list = [...(prev.campos_adicionales || [])];
      list[index] = { ...list[index], [field]: value };
      return { ...prev, campos_adicionales: list };
    });
  };

  const handleRemoveCustomField = (index) => {
    setHeaderForm(prev => {
      const list = [...(prev.campos_adicionales || [])];
      list.splice(index, 1);
      return { ...prev, campos_adicionales: list };
    });
  };

  // Guardar cambios de encabezado
  const handleSaveHeaders = async () => {
    if (!selectedConfigArea) return;
    setSavingHeaderConfig(true);
    try {
      await saveHeaderConfig(selectedConfigArea, headerForm);
      Swal.fire({
        title: '¡Encabezados Guardados!',
        text: `La configuración institucional para el área "${selectedConfigArea}" se ha guardado correctamente.`,
        icon: 'success',
        confirmButtonColor: '#0f172a',
        customClass: { popup: 'rounded-3xl' }
      });
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Fallo al guardar la configuración: ' + err.message, 'error');
    } finally {
      setSavingHeaderConfig(false);
    }
  };

  // Agregar título de categoría personalizada
  const handleAddCategoryTitle = () => {
    if (!newCatName.trim() || !newCatTitle.trim()) return;
    setHeaderForm(prev => ({
      ...prev,
      titulos_por_categoria: {
        ...(prev.titulos_por_categoria || {}),
        [newCatName.trim()]: newCatTitle.trim()
      }
    }));
    setNewCatName('');
    setNewCatTitle('');
  };

  const handleRemoveCategoryTitle = (catKey) => {
    setHeaderForm(prev => {
      const copy = { ...(prev.titulos_por_categoria || {}) };
      delete copy[catKey];
      return { ...prev, titulos_por_categoria: copy };
    });
  };

  // Inicializar o actualizar physicalCounts cuando cambian los insumos
  useEffect(() => {
    if (insumos && insumos.length > 0) {
      const initialMap = {};
      insumos.forEach(item => {
        initialMap[item.id] = item.stock_actual !== undefined ? item.stock_actual : 0;
      });
      setPhysicalCounts(initialMap);
    }
  }, [insumos]);

  if (!isSupervisor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="glass-card p-10 rounded-3xl max-w-md w-full border border-slate-100 shadow-sm flex flex-col items-center">
           <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mb-6 border border-rose-100">
             <Lock size={28} />
           </div>
           <h2 className="text-xl font-bold text-slate-800 mb-2 tracking-tight">Acceso privado</h2>
           <p className="text-slate-500 text-xs font-normal leading-relaxed mb-6">El módulo de Configuración y Toma Física es de uso exclusivo para Supervisores.</p>
           <button onClick={() => window.history.back()} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm">Regresar</button>
        </div>
      </div>
    );
  }

  // Filtrado de insumos en la lista de toma física
  const filteredInsumos = insumos.filter(item => {
    const q = filterSearch.toLowerCase().trim();
    const matchSearch = !q || 
      (item.nombre || '').toLowerCase().includes(q) || 
      (item.codigo || '').toLowerCase().includes(q) ||
      (item.categoria || '').toLowerCase().includes(q);
    const matchCat = !filterCategory || item.categoria === filterCategory;
    return matchSearch && matchCat;
  });

  // Lista de categorías únicas
  const categories = Array.from(new Set(insumos.map(i => i.categoria).filter(Boolean)));

  // Manejar cambio en el input de stock físico real
  const handleCountChange = (insumoId, valStr) => {
    const val = valStr === '' ? '' : Math.max(0, parseInt(valStr, 10) || 0);
    setPhysicalCounts(prev => ({
      ...prev,
      [insumoId]: val
    }));
  };

  // Contar cuántos insumos tienen modificaciones respecto al sistema
  const modifiedItems = insumos.filter(item => {
    const current = item.stock_actual || 0;
    const entered = physicalCounts[item.id];
    return entered !== '' && entered !== undefined && entered !== current;
  });

  // Ejecutar Conciliación de Inventario
  const handleApplyConciliacion = async () => {
    if (!justificacion.trim()) {
      Swal.fire({
        title: 'Justificación requerida',
        text: 'Debes ingresar una justificación obligatoria explicando el motivo de la toma física para aplicar los cambios.',
        icon: 'warning',
        confirmButtonColor: '#0f172a',
        customClass: { popup: 'rounded-3xl' }
      });
      return;
    }

    if (!fechaHistorica) {
      Swal.fire({
        title: 'Fecha requerida',
        text: 'Por favor selecciona la fecha histórica de imputación para los ajustes.',
        icon: 'warning',
        confirmButtonColor: '#0f172a',
        customClass: { popup: 'rounded-3xl' }
      });
      return;
    }

    if (modifiedItems.length === 0) {
      Swal.fire({
        title: 'Sin diferencias detectadas',
        text: 'No hay variaciones entre el stock del sistema y las cantidades físicas ingresadas.',
        icon: 'info',
        confirmButtonColor: '#0f172a',
        customClass: { popup: 'rounded-3xl' }
      });
      return;
    }

    const result = await Swal.fire({
      title: '¿Confirmar Toma Física?',
      html: `
        <div style="text-align: left;" class="text-xs text-slate-600 space-y-3 mt-1">
          <p class="text-slate-600 leading-normal">
            Se actualizará el stock de <b class="text-slate-900 font-bold bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80">${modifiedItems.length} insumo(s)</b> con la siguiente configuración:
          </p>

          <div class="p-3 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-2 text-[12px]">
             <div class="flex items-center justify-between gap-3 pb-2 border-b border-slate-200/60">
                <div class="flex items-center gap-2">
                   <svg width="16" height="16" style="width:16px;height:16px;min-width:16px;display:inline-block;" class="text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                   <span class="text-slate-500 font-semibold text-[11px]">Fecha imputada:</span>
                </div>
                <span class="font-bold text-slate-800 font-mono text-xs bg-white px-2.5 py-0.5 rounded-lg border border-slate-200/80 shadow-2xs">${fechaHistorica}</span>
             </div>

             <div class="flex items-start justify-between gap-3 pb-2 border-b border-slate-200/60">
                <div class="flex items-center gap-2 shrink-0 pt-0.5">
                   <svg width="16" height="16" style="width:16px;height:16px;min-width:16px;display:inline-block;" class="text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                   <span class="text-slate-500 font-semibold text-[11px]">Justificación:</span>
                </div>
                <span class="font-semibold text-slate-800 text-xs text-right leading-snug">${justificacion.trim()}</span>
             </div>

             <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                   <svg width="16" height="16" style="width:16px;height:16px;min-width:16px;display:inline-block;" class="text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                   <span class="text-slate-500 font-semibold text-[11px]">Área de Imputación:</span>
                </div>
                <span class="font-bold text-slate-800 text-xs bg-white px-2.5 py-0.5 rounded-lg border border-slate-200/80 shadow-2xs">${area}</span>
             </div>
          </div>

          <div class="flex items-start gap-2 bg-amber-50/90 p-2.5 rounded-xl border border-amber-200/80 text-[11px] text-amber-900 leading-relaxed">
             <svg width="16" height="16" style="width:16px;height:16px;min-width:16px;margin-top:2px;display:inline-block;" class="text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
             <span>Los ajustes se registrarán a la fecha histórica seleccionada sin alterar las estadísticas del mes en curso.</span>
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, aplicar conciliación',
      cancelButtonText: 'Revisar',
      confirmButtonColor: '#0f172a',
      cancelButtonColor: '#94a3b8',
      customClass: { popup: 'rounded-[2rem]' }
    });

    if (!result.isConfirmed) return;

    setSaving(true);

    try {
      const batch = writeBatch(db);
      const userDisplayName = userData?.nombre || userData?.email || 'Supervisor';

      const conciliacionId = `concil_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const conciliacionDocRef = doc(db, 'metadata', `conciliacion_${conciliacionId}`);

      const detalleInsumos = [];
      let totalAumentos = 0;
      let totalFaltantes = 0;

      for (const item of modifiedItems) {
        const oldStock = item.stock_actual || 0;
        const newStock = Number(physicalCounts[item.id]) || 0;
        const diff = newStock - oldStock; // Positivo si hay más físico, negativo si faltan
        const tipoMovimiento = diff > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA';

        if (diff > 0) totalAumentos++;
        if (diff < 0) totalFaltantes++;

        detalleInsumos.push({
          codigo: item.codigo || '',
          nombre: item.nombre || '',
          categoria: item.categoria || '',
          stock_anterior: oldStock,
          stock_nuevo: newStock,
          diferencia: diff
        });

        // 1. Actualizar el insumo principal
        const insumoRef = doc(db, 'insumos', item.id);
        batch.update(insumoRef, { stock_actual: newStock });

        // 2. Registrar el movimiento histórico
        const movRef = doc(collection(db, 'movimientos'));
        batch.set(movRef, {
          codigo_insumo: item.codigo || '',
          nombre_insumo: item.nombre || '',
          tipo: 'AJUSTE',
          subtipo: tipoMovimiento,
          cantidad: Math.abs(diff),
          precio_unitario: Number(item.precio_unitario || 0),
          stock_anterior: oldStock,
          stock_nuevo: newStock,
          fecha: fechaHistorica,
          fecha_registro: Timestamp.now(),
          observacion: `Conciliación Toma Física: ${justificacion.trim()}`,
          area: area,
          usuario: userDisplayName,
          usuario_id: userData?.uid || userData?.email || '',
          conciliacion_id: conciliacionId,
          turno: 'M'
        });

        // 3. Crear o ajustar lote genérico si aplica (Colección raíz 'lotes')
        const lotesSnap = await getDocs(query(collection(db, 'lotes'), where('area', '==', area), where('codigo_insumo', '==', String(item.codigo || ''))));
        
        if (!lotesSnap.empty) {
          const firstLoteDoc = lotesSnap.docs[0];
          const currentLoteQty = firstLoteDoc.data().cantidad || 0;
          const newLoteQty = Math.max(0, currentLoteQty + diff);
          batch.update(doc(db, 'lotes', firstLoteDoc.id), {
            cantidad: newLoteQty
          });
        }
      }

      // 4. Guardar Acta/Documento oficial de Conciliación
      batch.set(conciliacionDocRef, {
        id: conciliacionId,
        fecha_imputada: fechaHistorica,
        fecha_registro: Timestamp.now(),
        fecha_registro_str: new Date().toLocaleDateString('en-CA'),
        hora_registro_str: new Date().toLocaleTimeString('es-GT', { hour12: false }),
        justificacion: justificacion.trim(),
        area: area,
        usuario: userDisplayName,
        usuario_id: userData?.uid || userData?.email || '',
        total_insumos: modifiedItems.length,
        total_aumentos: totalAumentos,
        total_faltantes: totalFaltantes,
        detalle_insumos: detalleInsumos
      });

      await batch.commit();

      // 5. Registrar en Bitácora de Auditoría
      logAudit({
        modulo: 'Configuración',
        accion: 'CONCILIACIÓN',
        descripcion: `Conciliación por Toma Física realizada en ${modifiedItems.length} insumo(s) a fecha ${fechaHistorica}. Justificación: ${justificacion.trim()}`,
        registroId: conciliacionId,
        conciliacionId: conciliacionId
      });

      Swal.fire({
        title: '¡Conciliación Exitosa!',
        text: `Se han actualizado los saldos de ${modifiedItems.length} insumo(s) a la fecha ${fechaHistorica} correctamente.`,
        icon: 'success',
        confirmButtonColor: '#0f172a',
        customClass: { popup: 'rounded-3xl' }
      });

    } catch (err) {
      console.error("Error al aplicar conciliación:", err);
      Swal.fire({
        title: 'Error en la conciliación',
        text: 'Ocurrió un error al guardar los ajustes en el servidor: ' + err.message,
        icon: 'error',
        confirmButtonColor: '#0f172a',
        customClass: { popup: 'rounded-3xl' }
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-3.5 animate-fade-in pb-2 lg:pb-0">
      
      {/* Header del Módulo */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1 shrink-0 animate-fade-in-up">
        <div className="flex items-center gap-3.5">
           <div className="w-11 h-11 bg-white shadow-sm rounded-2xl flex items-center justify-center border border-slate-100/60 shrink-0">
             <Settings className="text-primary-600" size={20} />
           </div>
           <div>
             <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-tight">Configuración y Administración</h1>
             <p className="text-slate-400 text-[11px] font-medium mt-0.5">
               Gestión de parámetros institucionales y herramientas avanzadas de inventario
             </p>
           </div>
        </div>
      </header>

      {/* Navegación por Pestañas */}
      <div className="flex items-center gap-2 border-b border-slate-200/70 pb-1 shrink-0 overflow-x-auto">
         <button
           onClick={() => setActiveTab('encabezados')}
           className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
             activeTab === 'encabezados'
               ? 'bg-slate-900 text-white shadow-xs'
               : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
           }`}
         >
            <Building2 size={15} />
            <span>Encabezados Institucionales</span>
         </button>

         <button
           onClick={() => setActiveTab('categorias')}
           className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
             activeTab === 'categorias'
               ? 'bg-slate-900 text-white shadow-xs'
               : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
           }`}
         >
            <FolderKanban size={15} />
            <span>Gestión de Categorías por Área</span>
         </button>

         <button
           onClick={() => setActiveTab('toma-fisica')}
           className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
             activeTab === 'toma-fisica'
               ? 'bg-slate-900 text-white shadow-xs'
               : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
           }`}
         >
            <ClipboardCheck size={15} />
            <span>Toma Física y Conciliación</span>
         </button>

         {isSuperAdmin && (
           <button
             onClick={() => setActiveTab('super-admin')}
             className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
               activeTab === 'super-admin'
                 ? 'bg-rose-950 text-rose-200 border border-rose-800 shadow-xs'
                 : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80'
             }`}
           >
              <ShieldAlert size={15} className="text-rose-500" />
              <span>Depuración y Edición Directa (Super Admin)</span>
           </button>
         )}
      </div>

      {/* Contenido: Sección Toma Física */}
      {activeTab === 'toma-fisica' && (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          
          {/* Panel de Configuración de Imputación Histórica & Justificación */}
          <section className="glass-card p-4 rounded-2xl border border-white/60 shadow-xs shrink-0 space-y-3">
             <div className="flex items-center justify-between border-b border-slate-100/80 pb-2">
                <div className="flex items-center gap-2">
                   <Calendar size={16} className="text-primary-600" />
                   <h2 className="text-xs font-semibold text-slate-700 tracking-wide">Parámetros de la Conciliación Histórica</h2>
                </div>
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/60">
                  Los ajustes no afectarán los reportes del mes actual
                </span>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
                {/* Selector de Fecha Histórica */}
                <div className="md:col-span-4 space-y-1">
                   <label className="text-[11px] font-semibold text-slate-600 block">
                     Fecha histórica de imputación <span className="text-rose-500">*</span>
                   </label>
                   <input 
                     type="date" 
                     value={fechaHistorica} 
                     onChange={e => setFechaHistorica(e.target.value)}
                     className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200/70 rounded-xl font-data text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-primary-500 transition-all shadow-inner"
                   />
                   <p className="text-[10px] text-slate-400 font-medium">Sugerido: 2 meses atrás ({getTwoMonthsAgoDate()})</p>
                </div>

                {/* Justificación Obligatoria */}
                <div className="md:col-span-8 space-y-1">
                   <label className="text-[11px] font-semibold text-slate-600 block">
                     Justificación obligatoria del ajuste <span className="text-rose-500">*</span>
                   </label>
                   <input 
                     type="text" 
                     placeholder="Ej: Conciliación por toma física inicial en estantería para corregir desfasamiento antiguo..."
                     value={justificacion}
                     onChange={e => setJustificacion(e.target.value)}
                     className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200/70 rounded-xl text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-primary-500 transition-all shadow-inner placeholder:text-slate-400"
                   />
                </div>
             </div>
          </section>

          {/* Barra de Filtros & Resumen de Cambios */}
          <section className="glass-card p-2.5 px-3.5 rounded-2xl border border-white/60 shadow-xs shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
             <div className="flex flex-1 items-center gap-3">
                {/* Búsqueda */}
                <div className="relative flex-1 max-w-sm">
                   <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                   <input 
                     type="text" 
                     placeholder="Buscar por código, insumo..."
                     value={filterSearch}
                     onChange={e => setFilterSearch(e.target.value)}
                     className="w-full pl-8 pr-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-primary-500/50 shadow-inner"
                   />
                </div>

                {/* Categorías */}
                <select 
                  value={filterCategory} 
                  onChange={e => setFilterCategory(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50/60 border border-slate-200/60 rounded-xl text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-primary-500/50 shadow-inner max-w-xs"
                >
                   <option value="">Todas las categorías</option>
                   {categories.map(cat => (
                     <option key={cat} value={cat}>{cat}</option>
                   ))}
                </select>
             </div>

             {/* Botón Aplicar Conciliación */}
             <div className="flex items-center gap-3 self-end sm:self-auto">
                <div className="text-[11px] font-medium text-slate-500">
                   Modificados: <span className="font-bold text-slate-800">{modifiedItems.length}</span> insumo(s)
                </div>
                <button
                  onClick={handleApplyConciliacion}
                  disabled={saving || modifiedItems.length === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all shadow-xs shrink-0"
                >
                   <Save size={14} className={saving ? 'animate-spin' : ''} />
                   <span>{saving ? 'Guardando...' : 'Aplicar Conciliación'}</span>
                </button>
             </div>
          </section>

          {/* VISTA MÓVIL: Tarjetas de Toma Física Real (< md) */}
          <div className="block md:hidden flex-1 overflow-y-auto space-y-3 mb-2">
            {filteredInsumos.length === 0 ? (
              <div className="py-12 text-center text-slate-400 italic text-xs font-medium bg-white rounded-2xl border border-slate-100 p-4">
                No hay insumos registrados en esta área.
              </div>
            ) : (
              filteredInsumos.map(item => {
                const isDisabledItem = item.activo === false || item.estado === 'desactivado' || item.desactivado === true || (item.nombre || '').toUpperCase().includes('(DESACTIVADO)');
                const systemStock = item.stock_actual !== undefined ? item.stock_actual : 0;
                const enteredVal = physicalCounts[item.id];
                const realStock = enteredVal === '' || enteredVal === undefined || isDisabledItem ? systemStock : Number(enteredVal);
                const diff = realStock - systemStock;

                return (
                  <div key={item.id} className={`p-3.5 bg-white rounded-2xl border transition-colors space-y-3 ${isDisabledItem ? 'bg-slate-50/60 border-slate-200/80 opacity-80' : diff !== 0 ? 'border-amber-300 bg-amber-50/20' : 'border-slate-100'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-primary-600">#{item.codigo}</span>
                          {isDisabledItem && (
                            <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300/80 rounded uppercase tracking-wider">
                              Desactivado
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-sm text-slate-800 leading-snug">{formatNombreInsumo(item.nombre)}</h3>
                        <p className="text-[11px] text-slate-400 font-medium">{item.categoria}</p>
                      </div>
                      {isDisabledItem ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80 shrink-0">
                           Inactivo
                        </span>
                      ) : diff === 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                           <CheckCircle2 size={11} className="text-emerald-500" /> Sin cambio
                        </span>
                      ) : diff > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                           <ArrowUpRight size={11} /> +{diff} u.
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                           <ArrowDownRight size={11} /> {diff} u.
                        </span>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                      <div className="text-xs">
                        <span className="text-slate-400 block text-[10px]">Stock Sistema</span>
                        <span className="font-mono font-bold text-slate-700">{systemStock} u.</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-semibold text-slate-500">Conteo Físico:</label>
                        <input 
                          type="number" 
                          min="0"
                          disabled={isDisabledItem}
                          title={isDisabledItem ? 'Insumo deshabilitado. Reactívelo en Inventario para modificar conteo.' : ''}
                          value={isDisabledItem ? systemStock : (physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : '')}
                          onChange={e => handleCountChange(item.id, e.target.value)}
                          className={`w-24 text-center px-2 py-1.5 border rounded-xl font-mono text-xs font-bold outline-none ${
                            isDisabledItem
                              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                              : diff !== 0 
                                ? 'bg-amber-50 border-amber-400 text-amber-900 focus:bg-white' 
                                : 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white focus:border-primary-500'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* VISTA ESCRITORIO: Tabla de Conteo Físico Real (>= md) */}
          <div className="hidden md:flex flex-col flex-1 min-h-0 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm font-data mb-2">
            <div className="flex-1 overflow-y-auto min-h-0">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
                  <tr className="bg-slate-50/50">
                    <th className="pl-4 pr-2 py-2.5 text-xs font-semibold text-slate-400 tracking-wide w-28">Código</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide">Insumo médico / Medicamento</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center w-36">Stock Sistema</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center w-44">Stock Físico Real</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center w-36">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px]">
                  {filteredInsumos.length === 0 ? (
                    <tr><td colSpan="5" className="py-20 text-center text-slate-400 italic text-xs font-medium">No hay insumos registrados en esta área.</td></tr>
                  ) : (
                    filteredInsumos.map(item => {
                      const isDisabledItem = item.activo === false || item.estado === 'desactivado' || item.desactivado === true || (item.nombre || '').toUpperCase().includes('(DESACTIVADO)');
                      const systemStock = item.stock_actual !== undefined ? item.stock_actual : 0;
                      const enteredVal = physicalCounts[item.id];
                      const realStock = enteredVal === '' || enteredVal === undefined || isDisabledItem ? systemStock : Number(enteredVal);
                      const diff = realStock - systemStock;

                      return (
                        <tr key={item.id} className={`transition-colors cursor-pointer group ${isDisabledItem ? 'bg-slate-50/70 text-slate-400' : diff !== 0 ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-slate-100/70'}`}>
                          {/* Código */}
                          <td className="pl-4 pr-2 py-3">
                             <div className="flex items-center gap-1.5">
                                <span className={`font-mono text-xs font-semibold ${isDisabledItem ? 'text-slate-400' : 'text-primary-600'}`}>#{item.codigo}</span>
                                {isDisabledItem && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300/80 rounded uppercase tracking-wider">
                                    Desactivado
                                  </span>
                                )}
                             </div>
                          </td>

                          {/* Insumo */}
                          <td className="px-4 py-3">
                             <div className={`font-medium text-[13px] leading-snug ${isDisabledItem ? 'text-slate-500 line-through opacity-75' : 'text-slate-800'}`}>{formatNombreInsumo(item.nombre)}</div>
                             <div className="text-[10px] font-medium text-slate-400 mt-0.5">{item.categoria}</div>
                          </td>

                          {/* Stock Sistema */}
                          <td className="px-3 py-3 text-center">
                             <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200/60">
                               {systemStock} u.
                             </span>
                          </td>

                          {/* Stock Físico Real (Input) */}
                          <td className="px-3 py-3 text-center">
                             <div className="flex items-center justify-center">
                                <input 
                                  type="number" 
                                  min="0"
                                  disabled={isDisabledItem}
                                  title={isDisabledItem ? 'Insumo deshabilitado. Reactívelo en Inventario para modificar conteo.' : ''}
                                  value={isDisabledItem ? systemStock : (physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : '')}
                                  onChange={e => handleCountChange(item.id, e.target.value)}
                                  className={`w-28 text-center px-3 py-1.5 border rounded-xl font-mono text-xs font-bold outline-none transition-all ${
                                    isDisabledItem
                                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                      : diff !== 0 
                                        ? 'bg-amber-50 border-amber-300 text-amber-900 focus:bg-white focus:border-amber-500 shadow-xs' 
                                        : 'bg-slate-50/80 border-slate-200/80 text-slate-800 focus:bg-white focus:border-primary-500'
                                  }`}
                                />
                             </div>
                          </td>

                          {/* Diferencia Real-Time */}
                          <td className="px-4 py-3 text-center">
                             {isDisabledItem ? (
                               <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80">
                                  Inactivo (bloqueado)
                               </span>
                             ) : diff === 0 ? (
                               <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                                  <CheckCircle2 size={13} className="text-emerald-500" /> Sin cambio
                               </span>
                             ) : diff > 0 ? (
                               <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                  <ArrowUpRight size={13} /> +{diff} u.
                               </span>
                             ) : (
                               <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/80">
                                  <ArrowDownRight size={13} /> {diff} u.
                               </span>
                             )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Barra inferior con resumen (Estilo Usuarios.jsx) */}
            <div className="shrink-0 bg-slate-50/80 border-t border-slate-100 px-4 py-2 flex flex-col sm:flex-row justify-between items-center gap-2 z-10 font-data">
               <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">
                  Mostrando <span className="text-slate-700">{filteredInsumos.length}</span> de <span className="text-slate-700">{insumos.length}</span> insumos
               </div>
               <div className="flex items-center gap-2.5 text-[10px] font-medium text-slate-500">
                  <span className="flex items-center gap-1">
                     <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                     {modifiedItems.length} Modificados
                  </span>
               </div>
            </div>
          </div>

        </div>
      )}

      {/* Contenido: Sección Gestión de Categorías por Área */}
      {activeTab === 'categorias' && (
        <div className="flex flex-col flex-1 min-h-0 gap-3 pb-2">
           
           {/* Header de la Pestaña, Búsqueda & Selector de Área */}
           <div className="glass-card p-4 rounded-2xl border border-white/60 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center border border-primary-100/80">
                    <FolderKanban size={20} />
                 </div>
                 <div>
                    <h2 className="text-sm font-bold text-slate-800">Gestión de categorías y códigos por área</h2>
                    <p className="text-[11px] text-slate-500 font-medium">Administra los nombres de categorías, prefijos/códigos y su mapeo maestro por servicio.</p>
                 </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                 {/* Búsqueda inteligente a la par de Área a Configurar */}
                 <div className="relative w-full sm:w-56">
                    <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filtrar por código o nombre..."
                      value={catFilterSearch}
                      onChange={e => setCatFilterSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50/70 border border-slate-200/70 rounded-xl text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-primary-500 transition-all shadow-inner placeholder:text-slate-400"
                    />
                 </div>

                 <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Área a configurar:</label>
                    <select
                      value={selectedCatArea}
                      onChange={e => setSelectedCatArea(e.target.value)}
                      className="px-3.5 py-1.5 bg-slate-50/70 border border-slate-200/70 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-primary-500 transition-all shadow-inner cursor-pointer"
                    >
                      {['Emergencia', 'Encamamiento'].map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                      {!['Emergencia', 'Encamamiento'].includes(area) && area && (
                        <option value={area}>{area}</option>
                      )}
                    </select>
                 </div>

                 <button
                   onClick={handleOpenNewCatModal}
                   className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold transition-all shadow-xs shrink-0"
                 >
                    <Plus size={15} />
                    <span>+ Nueva categoría</span>
                 </button>
              </div>
           </div>

           {/* VISTA MÓVIL: Tarjetas de Categorías (< md) */}
           <div className="block md:hidden flex-1 overflow-y-auto space-y-3 mb-2">
              {loadingCategories ? (
                <div className="py-12 text-center text-slate-400 italic text-xs font-medium bg-white rounded-2xl border border-slate-100 p-4">
                  <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-primary-600" />
                  <span>Cargando categorías de {selectedCatArea}...</span>
                </div>
              ) : areaCategories.filter(c => 
                !catFilterSearch || 
                (c.nombre || '').toLowerCase().includes(catFilterSearch.toLowerCase()) || 
                (c.codigo || '').toLowerCase().includes(catFilterSearch.toLowerCase())
              ).length === 0 ? (
                <div className="py-12 text-center text-slate-400 italic text-xs font-medium bg-white rounded-2xl border border-slate-100 p-4">
                  Sin categorías coincidentes en {selectedCatArea}.
                </div>
              ) : (
                areaCategories.filter(c => 
                  !catFilterSearch || 
                  (c.nombre || '').toLowerCase().includes(catFilterSearch.toLowerCase()) || 
                  (c.codigo || '').toLowerCase().includes(catFilterSearch.toLowerCase())
                ).map((cat) => (
                  <div key={cat.id} className="p-3.5 bg-white rounded-2xl border border-slate-100 shadow-xs space-y-2.5">
                     <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                           {cat.codigo || '—'}
                        </span>
                        <div className="flex items-center gap-1.5">
                           <span className={`w-1.5 h-1.5 rounded-full ${cat.activa !== false ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                           <button
                             onClick={() => handleToggleCatActive(cat)}
                             className={`text-[10px] font-semibold tracking-wide hover:underline ${cat.activa !== false ? 'text-emerald-700' : 'text-rose-600'}`}
                           >
                              {cat.activa !== false ? 'Activa' : 'Inactiva'}
                           </button>
                        </div>
                     </div>

                     <div>
                        <h3 className="font-semibold text-sm text-slate-800 leading-snug">{cat.nombre}</h3>
                        <div className="mt-1">
                           <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-semibold tracking-wide border ${
                             cat.categoria_maestra === 'Médico-quirúrgico'
                               ? 'bg-purple-50 border-purple-100 text-purple-700'
                               : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                           }`}>
                              Maestra: {cat.categoria_maestra || 'Medicamento'}
                           </span>
                        </div>
                     </div>

                     <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditCatModal(cat)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-primary-50 text-primary-700 border border-primary-100 rounded-lg text-xs font-semibold"
                        >
                           <Edit3 size={12} /> Editar
                        </button>
                        <button
                          onClick={() => handleDeleteCat(cat)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-xs font-semibold"
                        >
                           <Trash2 size={12} /> Eliminar
                        </button>
                     </div>
                  </div>
                ))
              )}
           </div>

           {/* VISTA ESCRITORIO: Tabla Principal de Categorías (>= md) */}
           <div className="hidden md:flex flex-col flex-1 min-h-0 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm font-data mb-2">
              <div className="flex-1 overflow-y-auto min-h-0">
                 <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
                       <tr className="bg-slate-50/50">
                          <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 tracking-wide">Código / prefijo</th>
                          <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 tracking-wide">Nombre de la categoría</th>
                          <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center">Categoría maestra (SPS 1062)</th>
                          <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-center">Estado</th>
                          <th className="px-5 py-2.5 text-xs font-semibold text-slate-400 tracking-wide text-right">Acciones</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                       {loadingCategories ? (
                         <tr>
                            <td colSpan={5} className="py-12 text-center text-slate-400 font-semibold text-xs italic">
                               <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-primary-600" />
                               <span>Cargando categorías de {selectedCatArea}...</span>
                            </td>
                         </tr>
                       ) : areaCategories.filter(c => 
                         !catFilterSearch || 
                         (c.nombre || '').toLowerCase().includes(catFilterSearch.toLowerCase()) || 
                         (c.codigo || '').toLowerCase().includes(catFilterSearch.toLowerCase())
                       ).length === 0 ? (
                         <tr>
                            <td colSpan={5} className="py-16 text-center text-slate-400 italic font-semibold text-xs">
                               <span>Sin categorías coincidentes en {selectedCatArea}.</span>
                            </td>
                         </tr>
                       ) : (
                         areaCategories.filter(c => 
                           !catFilterSearch || 
                           (c.nombre || '').toLowerCase().includes(catFilterSearch.toLowerCase()) || 
                           (c.codigo || '').toLowerCase().includes(catFilterSearch.toLowerCase())
                         ).map((cat) => (
                           <tr key={cat.id} className="hover:bg-slate-100/70 transition-colors group cursor-pointer">
                              <td className="px-5 py-4 font-data text-[12px] font-medium text-slate-700">
                                 {cat.codigo || '—'}
                              </td>
                              <td className="px-5 py-4">
                                 <span className="font-medium text-slate-700 text-xs leading-tight block">{cat.nombre}</span>
                              </td>
                              <td className="px-5 py-4 text-center">
                                 <span className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold tracking-wide border ${
                                   cat.categoria_maestra === 'Médico-quirúrgico'
                                     ? 'bg-purple-50 border-purple-100 text-purple-700'
                                     : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                 }`}>
                                    {cat.categoria_maestra || 'Medicamento'}
                                 </span>
                              </td>
                              <td className="px-5 py-4 text-center">
                                 <div className="flex items-center justify-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${cat.activa !== false ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                    <button
                                      onClick={() => handleToggleCatActive(cat)}
                                      title="Clic para cambiar estado"
                                      className={`text-[10px] font-semibold tracking-wide hover:underline ${cat.activa !== false ? 'text-emerald-700' : 'text-rose-600'}`}
                                    >
                                       {cat.activa !== false ? 'Activa' : 'Inactiva'}
                                    </button>
                                 </div>
                              </td>
                              <td className="px-5 py-4 text-right">
                                 <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleOpenEditCatModal(cat)}
                                      className="font-sans inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-primary-50/80 text-primary-700 border border-primary-100/80 rounded-lg text-[11px] font-medium tracking-wide hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all active:scale-95"
                                    >
                                       <Edit3 size={11} /> Editar
                                    </button>
                                    <button
                                      onClick={() => handleDeleteCat(cat)}
                                      className="font-sans inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-[11px] font-medium tracking-wide hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all active:scale-95"
                                    >
                                       <Trash2 size={11} /> Eliminar
                                    </button>
                                 </div>
                              </td>
                           </tr>
                         ))
                       )}
                    </tbody>
                 </table>
              </div>

              {/* Barra inferior con resumen (Estilo Idéntico Usuarios.jsx) */}
              <div className="shrink-0 bg-slate-50/80 border-t border-slate-100 px-4 py-2 flex flex-col sm:flex-row justify-between items-center gap-2 z-10 font-data">
                 <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">
                    Mostrando <span className="text-slate-700">{areaCategories.filter(c => !catFilterSearch || (c.nombre || '').toLowerCase().includes(catFilterSearch.toLowerCase()) || (c.codigo || '').toLowerCase().includes(catFilterSearch.toLowerCase())).length}</span> de <span className="text-slate-700">{areaCategories.length}</span> categorías
                 </div>
                 <div className="flex items-center gap-2.5 text-[10px] font-medium text-slate-500">
                    <span className="flex items-center gap-1">
                       <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                       {areaCategories.filter(c => (c.categoria_maestra || 'Medicamento') === 'Medicamento').length} Medicamentos
                    </span>
                    <span className="flex items-center gap-1">
                       <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                       {areaCategories.filter(c => c.categoria_maestra === 'Médico-quirúrgico').length} Médico-quirúrgico
                    </span>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Contenido: Sección Encabezados Institucionales */}
      {activeTab === 'encabezados' && (
        <div className="flex flex-col flex-1 min-h-0 gap-4 overflow-y-auto pr-1">
          
          {/* Header de la Pestaña & Selector de Área */}
          <div className="glass-card p-4 rounded-2xl border border-white/60 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center border border-primary-100/80">
                   <Building2 size={20} />
                </div>
                <div>
                   <h2 className="text-sm font-bold text-slate-800">Parámetros e Identidad por Área</h2>
                   <p className="text-[11px] text-slate-500 font-medium">Configura logos, textos oficiales y metadatos específicos para cada servicio.</p>
                </div>
             </div>

             <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Área a Configurar:</label>
                <select
                  value={selectedConfigArea}
                  onChange={e => setSelectedConfigArea(e.target.value)}
                  className="px-3.5 py-1.5 bg-slate-50/70 border border-slate-200/70 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-primary-500 transition-all shadow-inner cursor-pointer"
                >
                  {['Emergencia', 'Encamamiento'].map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                  {!['Emergencia', 'Encamamiento'].includes(area) && area && (
                    <option value={area}>{area}</option>
                  )}
                </select>

                <button
                  onClick={handleSaveHeaders}
                  disabled={savingHeaderConfig}
                  className="flex items-center gap-2 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-sm shrink-0 disabled:opacity-50"
                >
                   <Save size={14} className={savingHeaderConfig ? 'animate-spin' : ''} />
                   <span>{savingHeaderConfig ? 'Guardando...' : 'Guardar Encabezados'}</span>
                </button>
             </div>
          </div>

          {/* Grid Principal: Formulario Form + Preview Excel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
             
             {/* Formulario de Configuración (6 cols en desktop) */}
             <div className="lg:col-span-6 space-y-4">
                
                {/* 1. Logotipo Institucional */}
                <div className="glass-card p-4 rounded-2xl border border-white/60 shadow-xs space-y-3">
                   <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                         <ImageIcon size={16} className="text-primary-600" /> Logotipo Institucional (para Excel/PDF)
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">Archivo o URL</span>
                   </div>

                   <div className="flex items-center gap-4">
                      <div className="w-20 h-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center relative overflow-hidden shrink-0 group">
                         {(headerForm.logoBase64 || headerForm.logoUrl) ? (
                           <img src={headerForm.logoBase64 || headerForm.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                         ) : (
                           <div className="text-center p-2">
                              <Building2 size={24} className="mx-auto text-slate-300 mb-1" />
                              <span className="text-[9px] text-slate-400 font-medium block">Sin logo</span>
                           </div>
                         )}
                      </div>

                      <div className="space-y-2 flex-1">
                         <div className="flex items-center gap-2">
                            <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all">
                               <Upload size={13} />
                               <span>{(headerForm.logoBase64 || headerForm.logoUrl) ? 'Cambiar Imagen' : 'Subir Archivo'}</span>
                               <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                            </label>

                            {(headerForm.logoBase64 || headerForm.logoUrl) && (
                              <button
                                onClick={handleRemoveLogo}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-semibold transition-all"
                              >
                                 <Trash2 size={13} /> Eliminar
                              </button>
                            )}
                         </div>

                         <div>
                            <input
                              type="text"
                              value={headerForm.logoUrl || ''}
                              onChange={e => setHeaderForm({ ...headerForm, logoUrl: e.target.value, logoBase64: '' })}
                              placeholder="O pega una URL de imagen (http...)"
                              className="w-full px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-700 outline-none"
                            />
                         </div>
                         <p className="text-[10px] text-slate-400 leading-tight">
                           Las imágenes subidas localmente se comprimen automáticamente a &lt;50KB.
                         </p>
                      </div>
                   </div>
                </div>

                {/* 2. Datos Institucionales */}
                <div className="glass-card p-4 rounded-2xl border border-white/60 shadow-xs space-y-3">
                   <div className="border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                         <Building2 size={16} className="text-primary-600" /> Datos de la Institución
                      </span>
                   </div>

                   <div className="space-y-3">
                      <div>
                         <label className="text-[11px] font-semibold text-slate-500 block mb-1">Nombre de la Institución / Ente Superior</label>
                         <input
                           type="text"
                           value={headerForm.institucion || ''}
                           onChange={e => setHeaderForm({ ...headerForm, institucion: e.target.value })}
                           placeholder="Ej: Instituto Guatemalteco de Seguridad Social"
                           className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-primary-500 transition-all shadow-inner"
                         />
                      </div>

                      <div>
                         <label className="text-[11px] font-semibold text-slate-500 block mb-1">Nombre de la Unidad Médica / Hospital</label>
                         <input
                           type="text"
                           value={headerForm.unidad_medica || ''}
                           onChange={e => setHeaderForm({ ...headerForm, unidad_medica: e.target.value })}
                           placeholder="Ej: Hospital General IGSS Sololá"
                           className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-primary-500 transition-all shadow-inner"
                         />
                      </div>

                      <div>
                         <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-semibold text-slate-500 block">Subtítulo Oficial (SPS-1062)</label>
                            <span className="text-[10px] text-amber-700 font-medium">Usa <code className="bg-amber-100 px-1 rounded text-amber-900 font-bold">&#123;categoria&#125;</code> para reemplazo dinámico</span>
                         </div>
                         <textarea
                           rows={2}
                           value={headerForm.subtitulo_sps || ''}
                           onChange={e => setHeaderForm({ ...headerForm, subtitulo_sps: e.target.value })}
                           placeholder="Ej: Control de existencias físicas de {categoria} en resguardo en servicio de enfermería."
                           className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-primary-500 transition-all shadow-inner resize-none font-mono"
                         />
                      </div>

                      <div>
                         <label className="text-[11px] font-semibold text-slate-500 block mb-1">Código del Formulario Oficial</label>
                         <input
                           type="text"
                           value={headerForm.codigo_formulario || ''}
                           onChange={e => setHeaderForm({ ...headerForm, codigo_formulario: e.target.value })}
                           placeholder="Ej: SPS -1062"
                           className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-primary-500 transition-all shadow-inner"
                         />
                      </div>
                   </div>
                </div>

                {/* 3. Responsables & Campos Personalizados */}
                <div className="glass-card p-4 rounded-2xl border border-white/60 shadow-xs space-y-3">
                   <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                         <UserCheck size={16} className="text-primary-600" /> Responsables y Campos Personalizados
                      </span>
                      <button
                        onClick={handleAddCustomField}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-all"
                      >
                         <Plus size={13} /> Agregar Fila
                      </button>
                   </div>

                   <div className="space-y-3">
                      <div>
                         <label className="text-[11px] font-semibold text-slate-500 block mb-1">Jefe del servicio o encargado(a)</label>
                         <input
                           type="text"
                           value={headerForm.jefe_servicio || ''}
                           onChange={e => setHeaderForm({ ...headerForm, jefe_servicio: e.target.value })}
                           placeholder="Nombre completo..."
                           className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-primary-500 transition-all shadow-inner"
                         />
                      </div>

                      {/* Filas Adicionales Personalizadas */}
                      {(headerForm.campos_adicionales || []).map((field, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-slate-50/80 p-2 rounded-xl border border-slate-200/60">
                           <input
                             type="text"
                             placeholder="Etiqueta (ej: Supervisado por)"
                             value={field.etiqueta || ''}
                             onChange={e => handleUpdateCustomField(idx, 'etiqueta', e.target.value)}
                             className="w-1/2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 outline-none"
                           />
                           <input
                             type="text"
                             placeholder="Valor"
                             value={field.valor || ''}
                             onChange={e => handleUpdateCustomField(idx, 'valor', e.target.value)}
                             className="w-1/2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 outline-none"
                           />
                           <button
                             onClick={() => handleRemoveCustomField(idx)}
                             className="text-rose-500 hover:text-rose-700 p-1"
                           >
                              <Trash2 size={13} />
                           </button>
                        </div>
                      ))}
                   </div>
                </div>

                {/* 4. Títulos Personalizados por Categoría */}
                <div className="glass-card p-4 rounded-2xl border border-white/60 shadow-xs space-y-3">
                   <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                         <FileText size={16} className="text-primary-600" /> Títulos de Reporte por Periodos (Por Categoría)
                      </span>
                   </div>

                   <div className="space-y-3">
                      <div>
                         <label className="text-[11px] font-semibold text-slate-500 block mb-1">Título predeterminado para MEDICAMENTOS</label>
                         <input
                           type="text"
                           value={headerForm.titulo_periodo_med || ''}
                           onChange={e => setHeaderForm({ ...headerForm, titulo_periodo_med: e.target.value })}
                           placeholder="REGISTRO DE MEDICAMENTOS DEL CARRO DE URGENCIAS"
                           className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-primary-500 transition-all shadow-inner"
                         />
                      </div>

                      <div>
                         <label className="text-[11px] font-semibold text-slate-500 block mb-1">Título predeterminado para MÉDICO-QUIRÚRGICO</label>
                         <input
                           type="text"
                           value={headerForm.titulo_periodo_mq || ''}
                           onChange={e => setHeaderForm({ ...headerForm, titulo_periodo_mq: e.target.value })}
                           placeholder="REGISTRO DE MATERIAL MÉDICO QUIRÚRGICO DE EMERGENCIA"
                           className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-primary-500 transition-all shadow-inner"
                         />
                      </div>

                      {/* Títulos para categorías adicionales */}
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                         <span className="text-[11px] font-semibold text-slate-500 block">Títulos Específicos para otras Categorías / Subcategorías:</span>
                         
                         {/* Lista de categorías configuradas */}
                         {Object.entries(headerForm.titulos_por_categoria || {}).map(([catKey, catVal]) => (
                           <div key={catKey} className="flex items-center justify-between bg-slate-50 p-2 px-3 rounded-xl border border-slate-200/60 text-xs">
                              <div>
                                 <span className="font-bold text-slate-800">{catKey}: </span>
                                 <span className="text-slate-600 font-mono text-[11px]">{catVal}</span>
                              </div>
                              <button
                                onClick={() => handleRemoveCategoryTitle(catKey)}
                                className="text-rose-500 hover:text-rose-700 p-1"
                              >
                                 <Trash2 size={13} />
                              </button>
                           </div>
                         ))}

                         {/* Formulario rápido con selector de categorías existentes */}
                         <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center pt-1">
                            <div className="sm:col-span-5">
                               <select
                                 value={newCatName}
                                 onChange={e => setNewCatName(e.target.value)}
                                 className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none font-medium"
                               >
                                  {CATEGORIAS_DETALLADAS.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                  <option value="Medicamento">Medicamento (Maestra)</option>
                                  <option value="Médico-quirúrgico">Médico-quirúrgico (Maestra)</option>
                               </select>
                            </div>
                            <div className="sm:col-span-5">
                               <input
                                 type="text"
                                 placeholder="Título exacto para el encabezado..."
                                 value={newCatTitle}
                                 onChange={e => setNewCatTitle(e.target.value)}
                                 className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none"
                               />
                            </div>
                            <div className="sm:col-span-2">
                               <button
                                 onClick={handleAddCategoryTitle}
                                 className="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
                               >
                                  <Plus size={13} /> Añadir
                               </button>
                            </div>
                         </div>
                      </div>
                   </div>
                </div>

             </div>

             {/* Vista Previa Excel A4 (6 cols en desktop) */}
             <div className="lg:col-span-6 flex flex-col h-full">
                <div className="glass-card p-4 rounded-2xl border border-white/60 shadow-xs flex-1 flex flex-col">
                   <div className="flex items-center justify-between border-b border-slate-200/70 pb-3 mb-3">
                      <div className="flex items-center gap-2">
                         <Eye size={16} className="text-primary-600" />
                         <h3 className="text-xs font-bold text-slate-800">Vista Previa de la Plantilla Excel</h3>
                      </div>

                      {/* Selector de vista previa */}
                      <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200/60">
                         <button
                           onClick={() => setPreviewTab('sps1062')}
                           className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                             previewTab === 'sps1062' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                           }`}
                         >
                            SPS-1062
                         </button>
                         <button
                           onClick={() => setPreviewTab('periodos')}
                           className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                             previewTab === 'periodos' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                           }`}
                         >
                            Reporte Periodos
                         </button>
                      </div>
                   </div>

                   {/* Canvas / Container de la Hoja Excel */}
                   <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4 shadow-inner overflow-x-auto font-data text-[11px] leading-relaxed text-slate-800 space-y-4">
                      
                      {previewTab === 'sps1062' && (
                        <div className="min-w-[420px] space-y-4">
                           
                           {/* Encabezado Superior (Logo + Título + Código SPS-1062) */}
                           <div className="relative pt-1 pb-2 text-center">
                              <div className="absolute right-0 top-0 font-mono font-bold text-[10px] text-slate-600">
                                 {headerForm.codigo_formulario || 'SPS -1062'}
                              </div>

                              <div className="flex items-start gap-3 justify-center">
                                 {(headerForm.logoBase64 || headerForm.logoUrl) && (
                                   <img src={headerForm.logoBase64 || headerForm.logoUrl} alt="Logo" className="h-12 object-contain absolute left-0 top-0" />
                                 )}

                                 <div>
                                    <div className="font-bold text-xs uppercase tracking-tight text-slate-900">
                                       {headerForm.institucion || 'Instituto Guatemalteco de Seguridad Social'}
                                    </div>
                                    <div className="text-[11px] text-slate-700 font-normal mt-0.5">
                                       {(headerForm.subtitulo_sps || 'Control de existencias físicas de {categoria} en resguardo en servicio de enfermería.').replace('{categoria}', 'Medicamentos')}
                                    </div>
                                 </div>
                              </div>
                           </div>

                           {/* Tabla de Metadatos (Diseño exacto con subrayado inferior sin recuadros exteriores) */}
                           <div className="space-y-1.5 py-2 max-w-lg mx-auto font-sans text-[11px]">
                              
                              <div className="grid grid-cols-12 items-center">
                                 <div className="col-span-5 text-right font-medium text-slate-700 pr-2">Unidad medica</div>
                                 <div className="col-span-5 text-center font-normal text-slate-900 border-b border-slate-700 pb-0.5">
                                    {headerForm.unidad_medica || 'Hospital General IGSS Sololá'}
                                 </div>
                                 <div className="col-span-2"></div>
                              </div>

                              <div className="grid grid-cols-12 items-center">
                                 <div className="col-span-5 text-right font-medium text-slate-700 pr-2">Nombre del servicio</div>
                                 <div className="col-span-5 text-center font-normal text-slate-900 border-b border-slate-700 pb-0.5">
                                    {selectedConfigArea}
                                 </div>
                                 <div className="col-span-2"></div>
                              </div>

                              <div className="grid grid-cols-12 items-center">
                                 <div className="col-span-5 text-right font-medium text-slate-700 pr-2">Jefe del servicio o encargado (a)</div>
                                 <div className="col-span-5 text-center font-normal text-slate-900 border-b border-slate-700 pb-0.5 min-h-[20px]">
                                    {headerForm.jefe_servicio || ''}
                                 </div>
                                 <div className="col-span-2"></div>
                              </div>

                              {(headerForm.campos_adicionales || []).map((f, i) => (
                                <div key={i} className="grid grid-cols-12 items-center">
                                   <div className="col-span-5 text-right font-medium text-slate-700 pr-2">{f.etiqueta || 'Campo'}</div>
                                   <div className="col-span-5 text-center font-normal text-slate-900 border-b border-slate-700 pb-0.5">
                                      {f.valor || ''}
                                   </div>
                                   <div className="col-span-2"></div>
                                </div>
                              ))}

                              <div className="grid grid-cols-12 items-center">
                                 <div className="col-span-5 text-right font-medium text-slate-700 pr-2">Mes y año correspondiente</div>
                                 <div className="col-span-5 text-center font-normal text-slate-900 border-b border-slate-700 pb-0.5">
                                    Septiembre 2026
                                 </div>
                                 <div className="col-span-2"></div>
                              </div>

                              <div className="grid grid-cols-12 items-center">
                                 <div className="col-span-5 text-right font-medium text-slate-700 pr-2">Fecha de impresión del informe</div>
                                 <div className="col-span-5 text-center font-normal text-slate-900 border-b border-slate-700 pb-0.5">
                                    4/08/2026
                                 </div>
                                 <div className="col-span-2"></div>
                              </div>

                           </div>

                           {/* Preview Tabla de Datos con Bordes Completos */}
                           <div className="border border-slate-400 overflow-hidden text-[9px] font-sans mt-3">
                              <div className="bg-white text-slate-900 font-bold grid grid-cols-12 text-center border-b border-slate-400 p-1">
                                 <div className="col-span-1 border-r border-slate-400">No.</div>
                                 <div className="col-span-2 border-r border-slate-400">Código</div>
                                 <div className="col-span-4 border-r border-slate-400">Descripción del insumo</div>
                                 <div className="col-span-1 border-r border-slate-400">Saldo inicial</div>
                                 <div className="col-span-1 border-r border-slate-400">Ingresos</div>
                                 <div className="col-span-1 border-r border-slate-400">Consumo mensual</div>
                                 <div className="col-span-2">Saldo final</div>
                              </div>
                              <div className="grid grid-cols-12 p-1 border-b border-slate-300 bg-white font-mono">
                                 <div className="col-span-1 text-center font-sans">1</div>
                                 <div className="col-span-2 text-center">89E22GH10</div>
                                 <div className="col-span-4 font-sans font-medium">TRAJE</div>
                                 <div className="col-span-1 text-center">33</div>
                                 <div className="col-span-1 text-center">0</div>
                                 <div className="col-span-1 text-center">0</div>
                                 <div className="col-span-2 text-center font-bold text-slate-800">33</div>
                              </div>
                              <div className="grid grid-cols-12 p-1 border-b border-slate-300 bg-white font-mono">
                                 <div className="col-span-1 text-center font-sans">2</div>
                                 <div className="col-span-2 text-center">098</div>
                                 <div className="col-span-4 font-sans font-medium">CATGUT CROMIC 2-0</div>
                                 <div className="col-span-1 text-center">2</div>
                                 <div className="col-span-1 text-center">0</div>
                                 <div className="col-span-1 text-center">0</div>
                                 <div className="col-span-2 text-center font-bold text-slate-800">2</div>
                              </div>
                           </div>

                        </div>
                      )}

                      {previewTab === 'periodos' && (
                        <div className="min-w-[420px] space-y-3">
                           {/* Encabezado del Reporte de Periodo */}
                           <div className="text-center border-b border-slate-200 pb-2 space-y-1">
                              {(headerForm.logoBase64 || headerForm.logoUrl) && (
                                <img src={headerForm.logoBase64 || headerForm.logoUrl} alt="Logo" className="h-10 mx-auto mb-1" />
                              )}
                              <div className="font-bold text-xs text-primary-900 uppercase tracking-tight">
                                 {headerForm.titulo_periodo_med || 'REGISTRO DE MEDICAMENTOS DEL CARRO DE URGENCIAS'}
                              </div>
                              <div className="text-[10px] font-bold text-slate-500">SEP-26</div>
                              <div className="flex justify-between text-[9px] text-slate-600 font-semibold px-2">
                                 <span>Area: {selectedConfigArea}</span>
                                 <span>Periodo: 01/09/2026 al 07/09/2026</span>
                              </div>
                           </div>

                           {/* Mini preview tabla de periodos */}
                           <div className="border border-slate-300 rounded-lg overflow-hidden text-[9px]">
                              <div className="bg-primary-600 text-white font-bold grid grid-cols-12 text-center p-1 font-sans">
                                 <div className="col-span-4 border-r border-primary-500">Insumo</div>
                                 <div className="col-span-2 border-r border-primary-500">Stock Inic.</div>
                                 <div className="col-span-4 border-r border-primary-500">01/09 (M/T/N)</div>
                                 <div className="col-span-2">Stock Fin.</div>
                              </div>
                              <div className="grid grid-cols-12 p-1 border-b border-slate-200 bg-white font-mono">
                                 <div className="col-span-4 font-sans truncate">AGUJA NO. 22</div>
                                 <div className="col-span-2 text-center">164</div>
                                 <div className="col-span-4 text-center">- | 3 | -</div>
                                 <div className="col-span-2 text-center font-bold text-emerald-700">157</div>
                              </div>
                              <div className="grid grid-cols-12 p-1 bg-slate-50 font-mono">
                                 <div className="col-span-4 font-sans truncate">ALCOHOL ETILICO</div>
                                 <div className="col-span-2 text-center">8</div>
                                 <div className="col-span-4 text-center">2 | - | -</div>
                                 <div className="col-span-2 text-center font-bold text-emerald-700">6</div>
                              </div>
                           </div>

                        </div>
                      )}

                   </div>
                </div>
             </div>

          </div>
        </div>
      )}

      {/* Contenido: Pestaña Super Admin */}
      {activeTab === 'super-admin' && isSuperAdmin && (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          
          {/* Header del Panel Super Admin */}
          <section className="glass-card p-4 rounded-2xl border border-rose-200/70 bg-gradient-to-r from-rose-50/80 via-white to-amber-50/40 shadow-xs shrink-0 space-y-3">
             <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                <div className="flex items-center gap-2.5">
                   <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs font-bold text-xs">
                     SA
                   </div>
                   <div>
                     <h2 className="text-sm font-bold text-slate-800 tracking-wide">Panel Maestro de Depuración y Edición Directa</h2>
                     <p className="text-[11px] text-slate-500 font-medium">Herramientas exclusivas para Super Admin. Modifica o elimina registros sin dejar rastro en la bitácora de auditoría.</p>
                   </div>
                </div>
                <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-3 py-1 rounded-full border border-rose-300">
                  ACCESO RESTRINGIDO
                </span>
             </div>

             {/* Controles de Selección de Colección y Búsqueda a Demanda */}
             <form onSubmit={handleSearchAdminDocs} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                {/* Selector de Colección */}
                <div className="md:col-span-4 space-y-1">
                   <label className="text-[11px] font-semibold text-slate-600 block">Colección de Firestore:</label>
                   <select
                     value={adminCollection}
                     onChange={e => {
                       setAdminCollection(e.target.value);
                       setAdminResults([]);
                       setSelectedDocIds([]);
                     }}
                     className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-rose-500 shadow-xs cursor-pointer"
                   >
                      <option value="movimientos">📦 Movimientos de Inventario (movimientos)</option>
                      <option value="insumos">💊 Insumos / Catálogo (insumos)</option>
                      <option value="auditoria">📜 Bitácora de Auditoría (auditoria)</option>
                      <option value="lotes">🏷️ Lotes (lotes)</option>
                   </select>
                </div>

                {/* Buscador Multi-Criterio */}
                <div className="md:col-span-6 space-y-1">
                   <label className="text-[11px] font-semibold text-slate-600 block">
                     Búsqueda Puntual <span className="text-emerald-600 font-bold">(0 lecturas automáticas)</span>:
                   </label>
                   <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Ingresa el ID del documento o código del insumo..."
                        value={adminSearch}
                        onChange={e => setAdminSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-rose-500 shadow-xs placeholder:text-slate-400 font-mono"
                      />
                   </div>
                </div>

                {/* Botón Buscar Puntual */}
                <div className="md:col-span-2 flex items-end justify-end pt-5">
                   <button
                     type="submit"
                     disabled={adminLoading}
                     className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-900 text-white rounded-xl text-xs font-bold hover:bg-rose-800 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                   >
                      <Search size={13} className={adminLoading ? 'animate-spin' : ''} />
                      <span>{adminLoading ? 'Buscando...' : 'Buscar (Ahorro)'}</span>
                   </button>
                </div>
             </form>
          </section>

          {/* Tabla de Registros y Acciones Directas */}
          <section className="glass-card p-3 rounded-2xl border border-white/60 shadow-xs flex-1 min-h-0 flex flex-col gap-3">
             
             {/* Barra de Acciones Masivas */}
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                   <span className="text-xs font-bold text-slate-700">Registros encontrados:</span>
                   <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs rounded-full">
                     {adminResults.length}
                   </span>
                   {selectedDocIds.length > 0 && (
                     <span className="px-2.5 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs rounded-full">
                       {selectedDocIds.length} seleccionado(s)
                     </span>
                   )}
                </div>

                {selectedDocIds.length > 0 && (
                  <button
                    onClick={handleBulkDeleteAdminDocs}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                  >
                     <Trash2 size={13} />
                     <span>Eliminar {selectedDocIds.length} Seleccionado(s) Definitivamente</span>
                  </button>
                )}
             </div>

             {/* Tabla Scrollable */}
             <div className="flex-1 min-h-0 overflow-auto border border-slate-200/70 rounded-xl bg-white shadow-inner">
                {adminLoading ? (
                  <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-2">
                     <RefreshCw size={24} className="animate-spin text-rose-500" />
                     <p className="text-xs font-medium">Cargando colección {adminCollection}...</p>
                  </div>
                ) : adminResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-2">
                     <Database size={28} className="text-rose-400" />
                     <p className="text-xs font-bold text-slate-700">Modo Ahorro de Lecturas Activado (0 lecturas al ingresar)</p>
                     <p className="text-[11px] text-slate-500 text-center max-w-md leading-relaxed">
                        Ingresa el código del insumo o ID del documento en el buscador superior y presiona <b>"Buscar (Ahorro)"</b> para hacer una consulta puntual sin descargar toda la base de datos.
                     </p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                     <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                        <tr>
                           <th className="p-2.5 text-center w-10">
                              <input
                                type="checkbox"
                                checked={selectedDocIds.length > 0 && selectedDocIds.length === adminResults.length}
                                onChange={handleToggleSelectAllDocs}
                                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                              />
                           </th>
                           <th className="p-2.5">ID Documento</th>
                           <th className="p-2.5">Código / Identificación</th>
                           <th className="p-2.5">Nombre / Descripción / Acción</th>
                           <th className="p-2.5">Detalles (Stock / Cant / Tipo)</th>
                           <th className="p-2.5">Área / Usuario / Fecha</th>
                           <th className="p-2.5 text-center w-28">Acciones</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 text-slate-700">
                        {adminResults.slice((adminPage - 1) * adminPerPage, adminPage * adminPerPage).map(item => {
                          const isSelected = selectedDocIds.includes(item.id);
                          const docCode = item.codigo || item.codigo_insumo || item.registroId || '—';
                          const docName = item.nombre || item.nombre_insumo || item.descripcion || item.accion || item.lote || '—';
                          const docDetail = item.stock_actual !== undefined ? `Stock: ${item.stock_actual}` : item.cantidad !== undefined ? `Cant: ${item.cantidad} (${item.tipo || '—'})` : item.modulo || '—';
                          const docUser = item.registrado_por || item.usuario || item.usuario_id || item.usuario_nombre || '—';
                          const docArea = item.area || '—';
                          const docDate = item.fecha || (item.fecha_registro?.toDate ? item.fecha_registro.toDate().toLocaleString() : '—');

                          return (
                            <tr key={item.id} className={`hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-rose-50/40' : ''}`}>
                               <td className="p-2.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleToggleSelectDoc(item.id)}
                                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                  />
                               </td>
                               <td className="p-2.5 font-mono text-[11px] font-bold text-slate-600 truncate max-w-[120px]" title={item.id}>
                                  {item.id}
                               </td>
                               <td className="p-2.5 font-mono text-xs font-bold text-slate-800">
                                  {docCode}
                               </td>
                               <td className="p-2.5 font-medium text-slate-800 max-w-[250px] truncate" title={docName}>
                                  {docName}
                               </td>
                               <td className="p-2.5 font-data text-xs text-slate-600">
                                  {docDetail}
                               </td>
                               <td className="p-2.5 text-[11px] text-slate-500">
                                  <div><span className="font-semibold text-slate-700">{docUser}</span> ({docArea})</div>
                                  <div className="text-[10px] text-slate-400 font-data">{docDate}</div>
                               </td>
                               <td className="p-2.5 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                     <button
                                       onClick={() => handleOpenAdminEditModal(item)}
                                       title="Editar silenciosamente sin auditoría"
                                       className="p-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg border border-amber-200 transition-all cursor-pointer"
                                     >
                                        <Edit3 size={13} />
                                     </button>
                                     <button
                                       onClick={() => handleDeleteAdminDoc(item)}
                                       title="Eliminar permanentemente sin auditoría"
                                       className="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg border border-rose-200 transition-all cursor-pointer"
                                     >
                                        <Trash2 size={13} />
                                     </button>
                                  </div>
                               </td>
                            </tr>
                          );
                        })}
                     </tbody>
                  </table>
                )}
             </div>

             {/* Barra de Paginación Fija Abajo */}
             {adminResults.length > 0 && (
               <Pagination 
                 currentPage={adminPage}
                 totalPages={Math.ceil(adminResults.length / adminPerPage) || 1}
                 totalItems={adminResults.length}
                 pageSize={adminPerPage}
                 onPageChange={setAdminPage}
                 itemLabel="registros"
               />
             )}

          </section>

        </div>
      )}

      {/* Modal de Nueva / Editar Categoría */}
      {showCatModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
           <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scale-in">
              
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                 <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center border border-primary-100">
                       <FolderKanban size={18} />
                    </div>
                    <div>
                       <h3 className="text-sm font-bold text-slate-800">
                          {catModalMode === 'new' ? `Nueva Categoría (${selectedCatArea})` : `Editar Categoría`}
                       </h3>
                       <p className="text-[11px] text-slate-400 font-medium">Asigna un código y clasifica la categoría en su categoría maestra</p>
                    </div>
                 </div>
                 <button
                   type="button"
                   onClick={() => setShowCatModal(false)}
                   className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-all"
                 >
                    <X size={18} />
                 </button>
              </div>

              <form onSubmit={handleSaveCatSubmit} className="space-y-4">
                 <div className="grid grid-cols-12 gap-3">
                    {/* Código / Prefijo */}
                    <div className="col-span-4 space-y-1">
                       <label className="text-[11px] font-semibold text-slate-500 block">
                         Código / Prefijo <span className="text-rose-500">*</span>
                       </label>
                       <input
                         type="text"
                         placeholder="Ej: MXT"
                         value={catForm.codigo}
                         onChange={e => setCatForm({ ...catForm, codigo: e.target.value.toUpperCase() })}
                         className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:bg-white focus:border-primary-500 shadow-inner"
                         required
                       />
                    </div>

                    {/* Nombre Completo */}
                    <div className="col-span-8 space-y-1">
                       <label className="text-[11px] font-semibold text-slate-500 block">
                         Nombre de la Categoría <span className="text-rose-500">*</span>
                       </label>
                       <input
                         type="text"
                         placeholder="Ej: (MXT) Medicamentos en Tabletas..."
                         value={catForm.nombre}
                         onChange={e => setCatForm({ ...catForm, nombre: e.target.value })}
                         className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-primary-500 shadow-inner"
                         required
                       />
                    </div>
                 </div>

                 {/* Selector de Categoría Maestra */}
                 <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 block">
                      Categoría Maestra (SPS-1062 e Informes Institucionales) <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                       <button
                         type="button"
                         onClick={() => setCatForm({ ...catForm, categoria_maestra: 'Medicamento' })}
                         className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                           catForm.categoria_maestra === 'Medicamento'
                             ? 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-xs'
                             : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                         }`}
                       >
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>Medicamento</span>
                       </button>

                       <button
                         type="button"
                         onClick={() => setCatForm({ ...catForm, categoria_maestra: 'Médico-quirúrgico' })}
                         className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                           catForm.categoria_maestra === 'Médico-quirúrgico'
                             ? 'bg-purple-50 border-purple-400 text-purple-800 shadow-xs'
                             : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                         }`}
                       >
                          <span className="w-2 h-2 rounded-full bg-purple-500" />
                          <span>Médico-quirúrgico</span>
                       </button>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Determina en qué sección consolidada del formulario mensual SPS-1062 se contabilizarán los insumos de esta categoría.
                    </p>
                 </div>

                 {/* Botones de Acción */}
                 <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowCatModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all"
                    >
                       Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingCategories}
                      className="flex items-center gap-2 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-sm disabled:opacity-50"
                    >
                       <Save size={14} className={savingCategories ? 'animate-spin' : ''} />
                       <span>{savingCategories ? 'Guardando...' : 'Guardar Categoría'}</span>
                    </button>
                 </div>
              </form>

           </div>
        </div>
      )}

      {/* Modal de Edición Silenciosa (Super Admin) */}
      {showAdminEditModal && editingAdminDoc && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
           <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scale-in max-h-[90vh] flex flex-col">
              
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                 <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center border border-amber-200">
                       <Edit3 size={18} />
                    </div>
                    <div>
                       <h3 className="text-sm font-bold text-slate-800">
                          Edición Silenciosa (Super Admin)
                       </h3>
                       <p className="text-[11px] text-slate-400 font-medium">
                          Modifica los campos del documento ID: <span className="font-mono text-slate-700 font-bold">{editingAdminDoc.id}</span>
                       </p>
                    </div>
                 </div>
                 <button
                   type="button"
                   onClick={() => setShowAdminEditModal(false)}
                   className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-all"
                 >
                    <X size={18} />
                 </button>
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-[11px] text-amber-900 shrink-0">
                 ⚠️ <b>Aviso:</b> Los cambios guardados desde este modal modificarán la base de datos directamente <b>sin generar ninguna bitácora en la auditoría</b>.
              </div>

              <form onSubmit={handleSaveAdminEdit} className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-1">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {Object.keys(adminEditForm).map(key => {
                      const val = adminEditForm[key];
                      if (typeof val === 'object' && val !== null) {
                        return null;
                      }

                      const isNumber = typeof val === 'number';
                      const isBoolean = typeof val === 'boolean';

                      return (
                        <div key={key} className="space-y-1">
                           <label className="text-[11px] font-semibold text-slate-600 capitalize block">
                             {key.replace(/_/g, ' ')}:
                           </label>
                           {isBoolean ? (
                             <select
                               value={val ? 'true' : 'false'}
                               onChange={e => setAdminEditForm({ ...adminEditForm, [key]: e.target.value === 'true' })}
                               className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-amber-500 shadow-inner"
                             >
                                <option value="true">Verdadero (True)</option>
                                <option value="false">Falso (False)</option>
                             </select>
                           ) : (
                             <input
                               type={isNumber ? 'number' : 'text'}
                               value={val !== undefined && val !== null ? val : ''}
                               onChange={e => setAdminEditForm({ 
                                 ...adminEditForm, 
                                 [key]: isNumber ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value 
                               })}
                               className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-amber-500 shadow-inner"
                             />
                           )}
                        </div>
                      );
                    })}
                 </div>

                 {/* Botones de Acción */}
                 <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowAdminEditModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all"
                    >
                       Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingAdminEdit}
                      className="flex items-center gap-2 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-sm disabled:opacity-50"
                    >
                       <Save size={14} className={savingAdminEdit ? 'animate-spin' : ''} />
                       <span>{savingAdminEdit ? 'Guardando...' : 'Guardar Cambios Silenciosamente'}</span>
                    </button>
                 </div>
              </form>

           </div>
        </div>
      )}

    </div>
  );
};

export default Configuracion;
