# 🏥 Control Médica — Prototipo PWA de Gestión Hospitalaria de Inventarios

> **Proyecto de Tesis de Grado**  
> Sistema Progresivo Web (PWA) para el control, trazabilidad, valoración histórica y gestión de inventarios de medicamentos e insumos médicos en áreas hospitalarias (**Emergencia** y **Encamamiento**).

---

## 📌 1. Descripción del Proyecto

**Control Médica** es una aplicación web moderna orientada al entorno clínico-hospitalario que optimiza la dispensación, control de existencias por lote/vencimiento y fiscalización de insumos médicos. El sistema resuelve la problemática de inconsistencias en la valorización histórica de operaciones mediante la captura y congelamiento de precios unitarios vigentes (**RF-32 / RN-16**) y la aplicación automatizada del algoritmo de despacho **FEFO** (*First Expired, First Out*).

---

## 🚀 2. Arquitectura Tecnológica

* **Frontend**: React 19, Vite 8, TailwindCSS, Lucide React, SweetAlert2.
* **Capacidades PWA**: `vite-plugin-pwa`, Service Workers con Workbox (soporte de caché y funcionamiento offline).
* **Backend as a Service (BaaS)**: Google Cloud Firestore (Base de datos NoSQL documental con persistencia y multi-tab synchronization).
* **Autenticación**: Firebase Authentication (Control de Acceso basado en Roles: **Enfermero**, **Encargado de Servicio**, **Supervisor**).
* **Hosting y Despliegue**: Firebase Hosting con entornos separados de **Staging** y **Producción**.
* **Generación de Reportes**: ExcelJS y SheetJS para emisión oficial del formulario **SPS 1062** y actas de conciliación.

---

## 📁 3. Estructura del Repositorio

```text
├── firebase.json                # Configuración de Firebase Hosting y reglas
├── firestore.rules              # Reglas de seguridad de Cloud Firestore
├── .firebaserc                  # Alias de proyectos (Staging y Producción)
├── .gitignore                   # Exclusiones de seguridad y dependencias
├── README.md                    # Documentación principal del proyecto
└── frontend/                    # Código fuente de la aplicación React (PWA)
    ├── .env.example             # Plantilla de variables de entorno requeridas
    ├── package.json             # Dependencias y scripts de construcción
    ├── vite.config.js           # Configuración de compilador Vite y PWA
    ├── public/                  # Íconos, manifiesto PWA y activos estáticos
    └── src/
        ├── components/          # Componentes reutilizables (Sidebar, Modales, Paginación)
        ├── contexts/            # Proveedores de estado (Auth, Area, DataContext)
        ├── pages/               # Vistas principales:
        │   ├── Dashboard.jsx    # Monitoreo de stocks y métricas en tiempo real
        │   ├── Inventario.jsx   # Catálogo de insumos y gestión de lotes
        │   ├── Movimientos.jsx  # Registro de entradas y salidas (Algoritmo FEFO)
        │   ├── Historial.jsx    # Kárdex operativo y reversiones atómicas
        │   ├── Auditoria.jsx    # Bitácora fiscalizadora y actas de conciliación
        │   ├── Reportes.jsx     # Consumos valorizados y Formulario SPS 1062
        │   ├── Configuracion.jsx# Toma física, actas y gestión institucional
        │   ├── Usuarios.jsx     # Administración de usuarios y roles RBAC
        │   └── Login.jsx        # Acceso seguro por credenciales
        ├── services/            # Inicialización de Firebase SDK
        └── utils/               # Constantes y formateadores
```

---

## ⚙️ 4. Instalación y Ejecución Local

### Prerrequisitos
* Node.js v18 o superior.
* Gestor de paquetes `npm` (incluido con Node.js).

### Pasos de Configuración:

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/tu-usuario/control-medica.git
   cd control-medica/frontend
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**:
   Copia el archivo de ejemplo y coloca tus credenciales del proyecto de Firebase:
   ```bash
   cp .env.example .env.local
   ```
   Variables requeridas en `.env.local`:
   ```env
   VITE_FIREBASE_API_KEY=tu_api_key_aqui
   VITE_FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=tu_proyecto_id
   VITE_FIREBASE_STORAGE_BUCKET=tu_proyecto.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
   VITE_FIREBASE_APP_ID=tu_app_id
   ```

4. **Iniciar en modo desarrollo**:
   ```bash
   npm run dev
   ```
   Abre tu navegador en `http://localhost:5173`.

---

## 🔨 5. Compilación y Despliegue

```bash
# Compilar para entorno de Staging
npm run build:staging

# Compilar para entorno de Producción
npm run build:production

# Desplegar reglas y hosting a Firebase
npx firebase deploy --project staging      # Para Staging
npx firebase deploy --project default      # Para Producción
```

---

## 🔒 6. Cumplimiento de Requisitos de Tesis

* **RF-32 & RN-16 (Inmutabilidad Financiera)**: Cada movimiento de inventario congela el precio unitario del insumo al instante de la transacción. Posteriores ediciones al catálogo no alteran los costos históricos ni reportes financieros pasados.
* **Algoritmo FEFO**: Asignación y sugerencia automatizada del lote activo más próximo a caducar.
* **Atomicidad en Reversiones**: Las anulaciones de movimientos, el ajuste de existencias y la inserción del log con snapshot en la colección `auditoria` se ejecutan dentro de una transacción atómica `runTransaction` de Firestore.
* **Control de Existencias Negativas**: El sistema bloquea reversiones de ingresos si el stock remanente es inferior a la cantidad a revertir.
