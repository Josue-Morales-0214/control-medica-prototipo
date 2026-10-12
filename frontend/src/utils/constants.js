/**
 * Sistema de Categorías y Mapeo Maestro por Área
 * Permite desglosar categorías para el usuario sin romper la lógica de reportes globales.
 */

export const DEFAULT_CATEGORIES_EMERGENCIA = [
    { id: 'mxt', codigo: 'MXT', nombre: '(MXT) Medicamentos en Tabletas, Sobres, Ovulos, etc.', categoria_maestra: 'Medicamento', activa: true },
    { id: 'mxa', codigo: 'MXA', nombre: '(MXA) Medicamentos en Ampollas, Viales y Soluciones.', categoria_maestra: 'Medicamento', activa: true },
    { id: 'mxs', codigo: 'MXS', nombre: '(MXS) Medicamentos en Suspensiones, Inhalados; Goteros y Oftalmicos.', categoria_maestra: 'Medicamento', activa: true },
    { id: 'mq', codigo: 'MQ', nombre: '(MQ) Medicoquirurjicos', categoria_maestra: 'Médico-quirúrgico', activa: true },
    { id: 'vac', codigo: 'VAC', nombre: 'Vacunas', categoria_maestra: 'Medicamento', activa: true }
];

export const DEFAULT_CATEGORIES_ENCAMAMIENTO = [
    { id: 'mxt', codigo: 'MXT', nombre: '(MXT) Medicamentos en Tabletas, Sobres, Ovulos, etc.', categoria_maestra: 'Medicamento', activa: true },
    { id: 'mxa', codigo: 'MXA', nombre: '(MXA) Medicamentos en Ampollas, Viales y Soluciones.', categoria_maestra: 'Medicamento', activa: true },
    { id: 'mxs', codigo: 'MXS', nombre: '(MXS) Medicamentos en Suspensiones, Inhalados; Goteros y Oftalmicos.', categoria_maestra: 'Medicamento', activa: true },
    { id: 'mq', codigo: 'MQ', nombre: '(MQ) Medicoquirurjicos', categoria_maestra: 'Médico-quirúrgico', activa: true },
    { id: 'vac', codigo: 'VAC', nombre: 'Vacunas', categoria_maestra: 'Medicamento', activa: true },
    { id: 'med', codigo: 'MED', nombre: 'Medicamento', categoria_maestra: 'Medicamento', activa: true },
    { id: 'mq_alt', codigo: 'MQ_ALT', nombre: 'Médico-quirúrgico', categoria_maestra: 'Médico-quirúrgico', activa: true }
];

export const getDefaultCategoriesForArea = (areaName) => {
    if (areaName === 'Encamamiento') return DEFAULT_CATEGORIES_ENCAMAMIENTO;
    return DEFAULT_CATEGORIES_EMERGENCIA;
};

export const CATEGORIAS_DETALLADAS = [
    "(MXT) Medicamentos en Tabletas, Sobres, Ovulos, etc.",
    "(MXA) Medicamentos en Ampollas, Viales y Soluciones.",
    "(MXS) Medicamentos en Suspensiones, Inhalados; Goteros y Oftalmicos.",
    "(MQ) Medicoquirurjicos",
    "Vacunas"
];

// Mapeo de categorías detalladas a Categorías Maestras (Medicamento / Médico-quirúrgico)
export const CATEGORY_MAP = {
    "(MXT) Medicamentos en Tabletas, Sobres, Ovulos, etc.": "Medicamento",
    "(MXA) Medicamentos en Ampollas, Viales y Soluciones.": "Medicamento",
    "(MXS) Medicamentos en Suspensiones, Inhalados; Goteros y Oftalmicos.": "Medicamento",
    "(MQ) Medicoquirurjicos": "Médico-quirúrgico",
    "Vacunas": "Medicamento",
    // Retro-compatibilidad para Encamamiento y registros antiguos
    "Medicamento": "Medicamento",
    "Médicoquirúrgico": "Médico-quirúrgico",
    "Medicoquirurjico": "Médico-quirúrgico",
    "Médico-quirúrgico": "Médico-quirúrgico"
};

/**
 * Retorna la categoría maestra (Medicamento o Médico-quirúrgico)
 * útil para estadísticas y reportes agrupados.
 */
export const getMasterCategory = (cat, dynamicCategories = null) => {
    if (dynamicCategories && Array.isArray(dynamicCategories)) {
        const found = dynamicCategories.find(c => c.nombre === cat || c.codigo === cat);
        if (found && found.categoria_maestra) return found.categoria_maestra;
    }
    return CATEGORY_MAP[cat] || "Medicamento"; // Default a Medicamento por seguridad
};

/**
 * Calcula el timestamp en milisegundos de un movimiento para ordenamiento preciso
 * Prioriza fecha_registro (Timestamp Firestore) > timestamp > fecha + hora
 */
export const getMovementTimeMs = (m) => {
    if (!m) return 0;
    if (m.fecha_registro?.seconds) {
        return m.fecha_registro.seconds * 1000 + Math.floor((m.fecha_registro.nanoseconds || 0) / 1000000);
    }
    if (m.timestamp?.seconds) {
        return m.timestamp.seconds * 1000 + Math.floor((m.timestamp.nanoseconds || 0) / 1000000);
    }
    if (m.timestamp instanceof Date) {
        return m.timestamp.getTime();
    }
    if (m.fecha) {
        const datePart = String(m.fecha).slice(0, 10);
        const timePart = m.hora && m.hora !== '—' ? (m.hora.length === 5 ? `${m.hora}:00` : m.hora) : '00:00:00';
        const parsed = new Date(`${datePart}T${timePart}`).getTime();
        if (!isNaN(parsed)) return parsed;
    }
    return 0;
};

