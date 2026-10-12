import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth } from '../services/firebase';
import { 
  collection, query, where, onSnapshot, orderBy, limit, 
  getDocs, startAfter, getDocsFromCache, getDocsFromServer,
  getCountFromServer, doc, getDoc, setDoc, addDoc, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useArea } from './AreaContext';
import { useAuth } from './AuthContext';
import { getDefaultCategoriesForArea, getMovementTimeMs } from '../utils/constants';

const DataContext = createContext();

export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
  const { area } = useArea();
  const { userData, currentUser } = useAuth();

  const [insumos, setInsumos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState([null]); // [0: null, 1: lastDocPage1, 2: lastDocPage2...]
  const [isPaging, setIsPaging] = useState(false);
  const [totalMovs, setTotalMovs] = useState(0);
  const [totalEntradas, setTotalEntradas] = useState(0);
  const [totalSalidas, setTotalSalidas] = useState(0);
  const [serverFilters, setServerFilters] = useState({ tipo: null, desde: null, hasta: null });
  const [recentMovs, setRecentMovs] = useState([]);

  // 📁 CACHÉ COMPARTIDO DE REPORTES Y AUDITORÍA HISTÓRICA (En memoria global del DataContext)
  const reportsCacheRef = React.useRef({});
  const masterAreaMovsRef = React.useRef({});
  const [reportsCache, setReportsCache] = useState({});

  // 📡 Función unificada para consultar reportes con caché en memoria (0 lecturas si ya está en memoria)
  const fetchMovimientosRango = useCallback(async (startStr, endStr, forceRefresh = false) => {
    if (!area || !startStr || !endStr) return [];
    const cacheKey = `${area}_${startStr}_${endStr}`;

    // 1. Si la fecha de inicio es dentro de los últimos 7 días, reusar recentMovs (0 lecturas a Firestore)
    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 7);
    const hace7DiasStr = `${hace7Dias.getFullYear()}-${String(hace7Dias.getMonth() + 1).padStart(2, '0')}-${String(hace7Dias.getDate()).padStart(2, '0')}`;

    if (!forceRefresh && startStr >= hace7DiasStr && recentMovs && recentMovs.length > 0) {
      console.log(`⚡ Retornando reporte desde recentMovs en Vivo (${cacheKey})`);
      const filteredRecent = recentMovs.filter(m => {
        const fStr = (m.fecha || '').slice(0, 10);
        return m.area === area && fStr >= startStr && fStr <= endStr;
      });
      filteredRecent.sort((a, b) => getMovementTimeMs(b) - getMovementTimeMs(a));
      return filteredRecent;
    }

    // 2. Reusar caché por rango exacto si ya fue cargado
    if (!forceRefresh && reportsCacheRef.current[cacheKey]) {
      console.log(`⚡ Retornando reporte desde Caché Compartido Exacto (${cacheKey}):`, reportsCacheRef.current[cacheKey].length, "registros");
      return reportsCacheRef.current[cacheKey];
    }

    // 3. Reusar caché maestro del área si ya fueron cargados los movimientos históricos del área
    if (!forceRefresh && masterAreaMovsRef.current[area]?.loaded) {
      console.log(`⚡ Retornando reporte desde Caché Maestro del Área (${area}):`, masterAreaMovsRef.current[area].data.length, "registros totales");
      const filteredMaster = masterAreaMovsRef.current[area].data.filter(m => {
        const fStr = (m.fecha || '').slice(0, 10);
        return fStr >= startStr && fStr <= endStr;
      });
      filteredMaster.sort((a, b) => getMovementTimeMs(b) - getMovementTimeMs(a));
      reportsCacheRef.current[cacheKey] = filteredMaster;
      return filteredMaster;
    }

    try {
      console.log(`🔥 Consultando Firestore para Reporte Rango (${startStr} a ${endStr}) del área ${area}...`);
      const q = query(
        collection(db, 'movimientos'),
        where('area', '==', area)
      );
      const snap = await getDocs(q);
      const allAreaMovs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      allAreaMovs.sort((a, b) => getMovementTimeMs(b) - getMovementTimeMs(a));

      // Guardar en caché maestro del área
      masterAreaMovsRef.current[area] = { loaded: true, data: allAreaMovs };

      const filtered = allAreaMovs.filter(m => {
        const fStr = (m.fecha || '').slice(0, 10);
        return fStr >= startStr && fStr <= endStr;
      });

      reportsCacheRef.current[cacheKey] = filtered;
      setReportsCache(prev => ({ ...prev, [cacheKey]: filtered }));

      return filtered;
    } catch (err) {
      console.error("Error al consultar reporte por rango:", err);
      return [];
    }
  }, [area, recentMovs]);

  // 🔄 Mutaciones en caliente del Caché en Memoria (0 lecturas adicionales a Firestore)
  const updateReportCacheItem = (movId, updatedFields) => {
    if (!movId) return;
    
    // 1. Actualizar recentMovs
    setRecentMovs(prev => prev.map(m => m.id === movId ? { ...m, ...updatedFields } : m));
    
    // 2. Actualizar movimientos de la página del Historial
    setMovimientos(prev => prev.map(m => m.id === movId ? { ...m, ...updatedFields } : m));

    // 3. Actualizar refs de caché
    if (masterAreaMovsRef.current[area]?.data) {
      masterAreaMovsRef.current[area].data = masterAreaMovsRef.current[area].data.map(m => 
        m.id === movId ? { ...m, ...updatedFields } : m
      );
    }
    Object.keys(reportsCacheRef.current).forEach(key => {
      reportsCacheRef.current[key] = reportsCacheRef.current[key].map(m => 
        m.id === movId ? { ...m, ...updatedFields } : m
      );
    });

    // 4. Actualizar todas las entradas en reportsCache state
    setReportsCache(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        next[key] = next[key].map(m => m.id === movId ? { ...m, ...updatedFields } : m);
      });
      return next;
    });
  };

  const removeReportCacheItem = (movId) => {
    if (!movId) return;
    
    // 1. Remover de recentMovs
    setRecentMovs(prev => prev.filter(m => m.id !== movId));
    
    // 2. Remover de movimientos (Historial)
    setMovimientos(prev => prev.filter(m => m.id !== movId));

    // 3. Remover de refs
    if (masterAreaMovsRef.current[area]?.data) {
      masterAreaMovsRef.current[area].data = masterAreaMovsRef.current[area].data.filter(m => m.id !== movId);
    }
    Object.keys(reportsCacheRef.current).forEach(key => {
      reportsCacheRef.current[key] = reportsCacheRef.current[key].filter(m => m.id !== movId);
    });

    // 4. Remover de reportsCache state
    setReportsCache(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        next[key] = next[key].filter(m => m.id !== movId);
      });
      return next;
    });
  };

  const addReportCacheItem = (newMov) => {
    if (!newMov || !newMov.id) return;
    const fStr = (newMov.fecha || '').slice(0, 10);

    // 1. Agregar a recentMovs si es reciente
    setRecentMovs(prev => [newMov, ...prev.filter(m => m.id !== newMov.id)]);

    // 2. Agregar a ref de área
    if (masterAreaMovsRef.current[area]?.data) {
      masterAreaMovsRef.current[area].data = [newMov, ...masterAreaMovsRef.current[area].data.filter(m => m.id !== newMov.id)];
    }

    // 3. Agregar a reportsCache si el rango lo cubre
    Object.keys(reportsCacheRef.current).forEach(key => {
      const parts = key.split('_'); // [area, startStr, endStr]
      if (parts.length === 3) {
        const startStr = parts[1];
        const endStr = parts[2];
        if (fStr >= startStr && fStr <= endStr) {
          reportsCacheRef.current[key] = [newMov, ...reportsCacheRef.current[key].filter(m => m.id !== newMov.id)];
        }
      }
    });

    setReportsCache(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        const parts = key.split('_'); // [area, startStr, endStr]
        if (parts.length === 3) {
          const startStr = parts[1];
          const endStr = parts[2];
          if (fStr >= startStr && fStr <= endStr) {
            next[key] = [newMov, ...next[key].filter(m => m.id !== newMov.id)];
          }
        }
      });
      return next;
    });
  };

  const clearReportsCache = () => {
    reportsCacheRef.current = {};
    masterAreaMovsRef.current = {};
    setReportsCache({});
  };

  const [hasMore, setHasMore] = useState(true);
  const [lastPageLength, setLastPageLength] = useState(0);
  const [maxDiscoveredPage, setMaxDiscoveredPage] = useState(1);

  // Función para aplicar filtros de servidor desde la UI
  const applyServerFilters = (filters) => {
    const currentStr = JSON.stringify(serverFilters);
    const newStr = JSON.stringify(filters);
    
    if (currentStr === newStr) {
      return;
    }

    console.log("DEBUG: Aplicando Filtros de Servidor ->", filters);
    setMovimientos([]); // Limpiar tabla inmediatamente para no ver datos viejos
    setServerFilters(filters);
    setCurrentPage(1);
    setMaxDiscoveredPage(1);
    setHasMore(true);
    setLastPageLength(0);
    setPageCursors([null]);
  };

  // Helper para construir la query con filtros
  const buildQuery = (baseRef, filters, extraClauses = []) => {
    const filtersArray = [where('area', '==', area)];
    
    if (filters.tipo) {
      if (filters.tipo === 'Entrada' || filters.tipo === 'Ingreso') {
        filtersArray.push(where('tipo', 'in', ['Entrada', 'Ingreso', 'CARGA_INICIAL']));
      } else {
        filtersArray.push(where('tipo', '==', filters.tipo));
      }
    }
    
    if (filters.desde) {
      filtersArray.push(where('fecha', '>=', filters.desde));
    }
    
    if (filters.hasta) {
      filtersArray.push(where('fecha', '<=', filters.hasta + 'T23:59:59'));
    }

    if (filters.turno) {
      filtersArray.push(where('turno', '==', filters.turno));
    }

    // 🔐 SEGURIDAD: El Enfermero solo puede ver sus propios movimientos
    if (userData?.rol === 'Enfermero' && currentUser?.email) {
      filtersArray.push(where('usuario_id', '==', currentUser.email.toLowerCase()));
    }
    
    return query(baseRef, ...filtersArray, ...extraClauses);
  };

  // Escuchar cambios de autenticación
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      if (!user) {
        setInsumos([]);
        setMovimientos([]);
        setRecentMovs([]);
        setLotes([]);
        setTotalMovs(0);
        setCurrentPage(1);
        setMaxDiscoveredPage(1);
        setHasMore(true);
        setLastPageLength(0);
        setPageCursors([null]);
        setLoading(true);
      }
    });
    return () => unsubAuth();
  }, []);

  // El conteo total ahora se obtiene de un documento de metadatos (Costo: 1 lectura)
  useEffect(() => {
    if (!isAuthenticated || !area) return;

    const metaRef = doc(db, 'metadata', `${area}_meta`);
    const unsubMeta = onSnapshot(metaRef, (snap) => {
      if (snap.exists()) {
        setTotalMovs(snap.data().totalMovimientos || 0);
      } else {
        setTotalMovs(0);
      }
    }, (err) => {
      console.warn("Metadatos no encontrados o bloqueados:", err);
    });

    return () => unsubMeta();
  }, [isAuthenticated, area]);

  // 🔌 BLOQUE 1: LISTENERS ESTABLES (Catálogo e Inventario)
  useEffect(() => {
    if (!isAuthenticated || !area) return;

    console.log("Iniciando Sincronización de Catálogo (Insumos/Lotes)...");
    setLoading(true);

    const qIns = query(collection(db, 'insumos'), where('area', '==', area));
    const unsubIns = onSnapshot(qIns, (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      data.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      setInsumos(data);
      setLoading(false);
    }, (error) => console.error("Error en Insumos:", error));

    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 7);
    const hace7DiasStr = `${hace7Dias.getFullYear()}-${String(hace7Dias.getMonth() + 1).padStart(2, '0')}-${String(hace7Dias.getDate()).padStart(2, '0')}`;

    const qRecent = query(
      collection(db, 'movimientos'), 
      where('area', '==', area),
      where('fecha', '>=', hace7DiasStr),
      orderBy('fecha', 'desc'), 
      limit(800)
    );
    const unsubRecent = onSnapshot(qRecent, (snap) => {
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      list.sort((a, b) => getMovementTimeMs(b) - getMovementTimeMs(a));
      setRecentMovs(list);
    });

    const catDocRef = doc(db, 'configuracion_categorias', area);
    const unsubCats = onSnapshot(catDocRef, (snap) => {
      if (snap.exists() && Array.isArray(snap.data().items) && snap.data().items.length > 0) {
        setCategorias(snap.data().items);
      } else {
        setCategorias(getDefaultCategoriesForArea(area));
      }
    }, (err) => {
      console.warn("Error leyendo categorías dinámicas por área:", err);
      setCategorias(getDefaultCategoriesForArea(area));
    });

    return () => {
      unsubIns();
      unsubRecent();
      unsubCats();
    };
  }, [isAuthenticated, area]);

  // 📡 BLOQUE 2: LISTENERS DINÁMICOS (Historial Paginado)
  useEffect(() => {
    if (!isAuthenticated || !area) return;

    console.log("Actualizando Filtros de Historial...");
    
    const qMovs = buildQuery(
      collection(db, 'movimientos'), 
      serverFilters, 
      [orderBy('fecha', 'desc'), limit(PAGE_SIZE)]
    );
    
    const unsubMovs = onSnapshot(qMovs, (snap) => {
      if (currentPage === 1) {
        const docsLength = snap.docs.length;
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        list.sort((a, b) => getMovementTimeMs(b) - getMovementTimeMs(a));
        setMovimientos(list);
        setLastPageLength(docsLength);
        setHasMore(docsLength === PAGE_SIZE);
        setMaxDiscoveredPage(1);

        setPageCursors(prev => {
          const newCursors = [null]; 
          if (docsLength > 0) {
            newCursors[1] = snap.docs[docsLength - 1];
          }
          return newCursors;
        });
      }
    }, (error) => {
      console.error("Error en Historial Dinámico:", error);
    });

    return () => unsubMovs();
  }, [isAuthenticated, area, JSON.stringify(serverFilters)]);

  // Función para obtener una página específica
  const fetchPage = async (pageNumber) => {
    if (isPaging || pageNumber === currentPage) return;
    setIsPaging(true);
    
    try {
      const cursor = pageCursors[pageNumber - 1];
      const q = buildQuery(
        collection(db, 'movimientos'),
        serverFilters,
        [
          orderBy('fecha', 'desc'),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(PAGE_SIZE)
        ]
      );

      let snap;
      try {
        snap = await getDocsFromCache(q);
        if (snap.empty) throw new Error("cache-empty");
      } catch (e) {
        snap = await getDocsFromServer(q);
      }

      const docsLength = snap.docs.length;
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      data.sort((a, b) => getMovementTimeMs(b) - getMovementTimeMs(a));
      setMovimientos(data);
      setLastPageLength(docsLength);
      setHasMore(docsLength === PAGE_SIZE);
      
      setPageCursors(prev => {
        const newCursors = [...prev];
        if (docsLength > 0) {
          newCursors[pageNumber] = snap.docs[docsLength - 1];
        }
        return newCursors;
      });

      setMaxDiscoveredPage(prev => Math.max(prev, pageNumber));
      setCurrentPage(pageNumber);
    } catch (err) {
      console.error("Error cambiando página:", err);
    } finally {
      setIsPaging(false);
    }
  };

  const goToNextPage = () => {
    const isFiltered = serverFilters.tipo || serverFilters.desde || serverFilters.hasta;
    const canGo = isFiltered ? hasMore : (currentPage * PAGE_SIZE < totalMovs);
    if (canGo) {
      fetchPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      fetchPage(currentPage - 1);
    }
  };

  // 📜 MOTOR DE AUDITORÍA GLOBAL (Económico: Solo Escritura)
  const logAudit = async ({ modulo, accion, descripcion, motivo = '', registroId = '', conciliacionId = '' }) => {
    try {
      const activeUser = auth.currentUser || currentUser;
      if (!activeUser) {
        console.warn("logAudit: No se pudo registrar auditoría porque no hay un usuario activo.");
        return;
      }
      const userMail = activeUser.email || 'desconocido';
      const userName = userData?.nombre || userData?.displayName || activeUser.displayName || activeUser.email?.split('@')[0] || 'Usuario';
      
      await addDoc(collection(db, 'auditoria'), {
        modulo,
        accion,
        descripcion,
        motivo,
        registro_afectado: registroId,
        conciliacion_id: conciliacionId || (accion === 'CONCILIACIÓN' ? registroId : ''),
        usuario: userName,
        usuario_id: userMail,
        rol: userData?.rol || 'Operativo',
        area: area,
        fecha: new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD Local GT
        hora: new Date().toLocaleTimeString('es-GT', { hour12: false }),
        timestamp: serverTimestamp()
      });
      console.log(`✅ Auditoría registrada exitosamente: ${accion} en ${modulo}`);
    } catch (err) {
      console.error("Error al registrar auditoría en Firestore:", err);
    }
  };

  // 📦 CARGA SELECTIVA: Obtener lotes solo de un insumo específico (Ahorro de lecturas)
  const getLotesByInsumo = async (codigoInsumo) => {
    if (!area || !codigoInsumo) return [];
    try {
      const q = query(
        collection(db, 'lotes'), 
        where('area', '==', area), 
        where('codigo_insumo', '==', String(codigoInsumo))
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id }));
    } catch (err) {
      console.error("Error cargando lotes del insumo:", err);
      return [];
    }
  };

  // 🏛️ Obtener Configuración de Encabezados Institucionales por Área
  const getHeaderConfig = async (targetArea) => {
    const areaToFetch = targetArea || area;
    if (!areaToFetch) return DEFAULT_HEADER_CONFIG;
    
    try {
      const docRef = doc(db, 'configuracion_encabezados', areaToFetch);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { ...DEFAULT_HEADER_CONFIG, ...snap.data() };
      }
    } catch (err) {
      console.error("Error al obtener encabezados institucionales:", err);
    }
    return DEFAULT_HEADER_CONFIG;
  };

  // 💾 Guardar Configuración de Encabezados Institucionales por Área
  const saveHeaderConfig = async (targetArea, configData) => {
    const areaToSave = targetArea || area;
    if (!areaToSave) throw new Error("No se ha especificado un área para guardar.");
    
    const docRef = doc(db, 'configuracion_encabezados', areaToSave);
    await setDoc(docRef, {
      ...configData,
      area: areaToSave,
      updatedAt: serverTimestamp()
    }, { merge: true });

    logAudit({
      modulo: 'Configuración',
      accion: 'ACTUALIZAR_ENCABEZADOS',
      descripcion: `Actualización de encabezados institucionales para el área ${areaToSave}`,
      registroId: areaToSave
    });
  };

  // 🏷️ Obtener Categorías por Área (con fallback predeterminado)
  const getCategoriesForArea = async (targetArea) => {
    const areaToFetch = targetArea || area;
    if (!areaToFetch) return getDefaultCategoriesForArea('Emergencia');
    try {
      const snap = await getDoc(doc(db, 'configuracion_categorias', areaToFetch));
      if (snap.exists() && Array.isArray(snap.data().items) && snap.data().items.length > 0) {
        return snap.data().items.map((item, idx) => {
          if (typeof item === 'string') {
            return {
              id: `cat_${idx}_${Date.now()}`,
              codigo: item.slice(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, '') || `CAT${idx + 1}`,
              nombre: item,
              categoria_maestra: item.toLowerCase().includes('quirúr') || item.toLowerCase().includes('medico') ? 'Médico-quirúrgico' : 'Medicamento',
              activa: true
            };
          }
          return {
            id: item.id || `cat_${idx}_${Date.now()}`,
            codigo: item.codigo || `CAT${idx + 1}`,
            nombre: item.nombre || 'Categoría Sin Nombre',
            categoria_maestra: item.categoria_maestra || 'Medicamento',
            activa: item.activa !== false
          };
        });
      }
    } catch (err) {
      console.error("Error al obtener categorías por área:", err);
    }
    return getDefaultCategoriesForArea(areaToFetch);
  };

  // 💾 Guardar Categorías por Área
  const saveCategoriesForArea = async (targetArea, itemsList) => {
    const areaToSave = targetArea || area;
    if (!areaToSave) throw new Error("No se ha especificado un área.");
    
    const docRef = doc(db, 'configuracion_categorias', areaToSave);
    await setDoc(docRef, {
      items: itemsList,
      area: areaToSave,
      updatedAt: serverTimestamp()
    }, { merge: true });

    logAudit({
      modulo: 'Configuración',
      accion: 'ACTUALIZAR_CATEGORIAS',
      descripcion: `Actualización del catálogo de categorías para el área ${areaToSave}`,
      registroId: areaToSave
    });
  };

  // 🔄 Renombrar Categoría con Actualización en Cascada en los Insumos del Área
  const renameCategoryCascade = async (targetArea, oldCategoryName, updatedCategoryObj, updatedItemsList) => {
    const areaToSave = targetArea || area;
    if (!areaToSave) throw new Error("No se ha especificado un área.");

    // 1. Guardar la nueva lista de categorías en Firestore
    await saveCategoriesForArea(areaToSave, updatedItemsList);

    // 2. Si el nombre cambió, actualizar todos los insumos que pertenezcan a esa categoría vieja en esa área
    if (oldCategoryName && oldCategoryName !== updatedCategoryObj.nombre) {
      const qIns = query(
        collection(db, 'insumos'),
        where('area', '==', areaToSave),
        where('categoria', '==', oldCategoryName)
      );
      const snap = await getDocs(qIns);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach(d => {
          batch.update(doc(db, 'insumos', d.id), {
            categoria: updatedCategoryObj.nombre
          });
        });
        await batch.commit();
        console.log(`Actualización en cascada: ${snap.docs.length} insumos de ${areaToSave} modificados de '${oldCategoryName}' a '${updatedCategoryObj.nombre}'`);
      }
    }
  };

  const value = useMemo(() => ({
    insumos, movimientos, recentMovs, lotes, categorias, loading, 
    goToNextPage, goToPrevPage, fetchPage, applyServerFilters, isPaging, 
    currentPage, pageSize: PAGE_SIZE, totalMovs, totalEntradas, totalSalidas, logAudit,
    hasMore, lastPageLength, maxDiscoveredPage,
    getLotesByInsumo, fetchMovimientosRango, updateReportCacheItem,
    removeReportCacheItem, addReportCacheItem, clearReportsCache,
    getHeaderConfig, saveHeaderConfig,
    getCategoriesForArea, saveCategoriesForArea, renameCategoryCascade
  }), [
    insumos, movimientos, recentMovs, lotes, categorias, loading, 
    isPaging, currentPage, totalMovs, totalEntradas, totalSalidas, logAudit, fetchMovimientosRango,
    hasMore, lastPageLength, maxDiscoveredPage
  ]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};

export const DEFAULT_HEADER_CONFIG = {
  institucion: 'Instituto Guatemalteco de Seguridad Social',
  unidad_medica: 'Hospital General IGSS Sololá',
  subtitulo_sps: 'Control de existencias físicas de medicamentos en resguardo en servicio de enfermería.',
  jefe_servicio: '',
  encargado_insumos: '',
  codigo_formulario: 'SPS 1062',
  titulo_periodo_med: 'REGISTRO DE MEDICAMENTOS DEL CARRO DE URGENCIAS',
  titulo_periodo_mq: 'REGISTRO DE MATERIAL MÉDICO QUIRÚRGICO DE EMERGENCIA',
  titulos_por_categoria: {},
  logoBase64: ''
};

