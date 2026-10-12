
# Control Médica — Prototipo PWA para el Control de Insumos Clínicos

**Proyecto de graduación — Universidad del Valle de Guatemala (UVG)**  
**Año:** 2026  
**Versión documentada:** `v1.0.0-tesis`

## 1. Descripción del proyecto

Control Médica es un prototipo funcional de sistema de información web, implementado como aplicación web progresiva (PWA), desarrollado para apoyar la digitalización y trazabilidad del control interno de medicamentos e insumos clínicos en las áreas de Emergencia y Encamamiento del Servicio de Enfermería del Consultorio y Sala Anexa del Hospital Nacional de Sololá, Guatemala.

El prototipo permite gestionar inventarios, lotes, ingresos, egresos, existencias, reportes, usuarios y registros de auditoría mediante una interfaz web adaptable a diferentes dispositivos.

Su desarrollo forma parte de un trabajo de graduación de la Licenciatura en Tecnología de Sistemas Informáticos de la Universidad del Valle de Guatemala.

La solución se orienta al registro y seguimiento de movimientos de inventario, sin sustituir formalmente los procedimientos ni documentos institucionales vigentes.

## 2. Objetivo

Desarrollar un prototipo funcional de sistema de información web para apoyar el control interno y la trazabilidad de insumos clínicos, incorporando mecanismos de registro de movimientos, gestión de lotes, control de existencias, generación de reportes y diferenciación de permisos según el rol del usuario.

## 3. Tecnologías utilizadas

| Componente | Tecnología |
|---|---|
| Interfaz web | React |
| Herramienta de desarrollo y compilación | Vite |
| Estilos e interfaz | Tailwind CSS |
| Aplicación web progresiva | vite-plugin-pwa y Workbox |
| Autenticación | Firebase Authentication |
| Base de datos | Cloud Firestore |
| Alojamiento | Firebase Hosting |
| Generación de archivos Excel | ExcelJS y SheetJS |
| Control de versiones | Git |
| Repositorio de código | GitHub |

El prototipo utiliza una arquitectura web basada en React y servicios de Firebase para autenticación, almacenamiento documental y alojamiento.

## 4. Funcionalidades principales

### 4.1. Autenticación y control de acceso

El sistema utiliza Firebase Authentication y un esquema de control de acceso basado en roles (RBAC).

Se contemplan tres roles funcionales:

- **Enfermero:** consulta de información autorizada, registro de egresos, consulta de movimientos permitidos y reversión de movimientos propios dentro de las primeras 24 horas.
- **Encargado de servicio:** administración operativa de insumos y lotes, ingresos, egresos, historial, reportes y reversiones autorizadas.
- **Supervisor:** supervisión de ambas áreas, auditoría, reportes, administración de usuarios, configuración y ajustes de inventario.

Las operaciones disponibles dependen del rol autenticado y de las reglas de negocio aplicables.

### 4.2. Separación de áreas

El prototipo permite trabajar con las áreas de:

- Emergencia.
- Encamamiento.

Los inventarios, lotes, movimientos, historiales y reportes se mantienen diferenciados según el área activa.

El Supervisor puede cambiar de área durante una sesión autorizada.

### 4.3. Gestión de inventario

El módulo de Inventario permite, según los permisos del usuario:

- Consultar insumos y existencias.
- Crear y modificar fichas de insumos.
- Gestionar lotes y fechas de vencimiento.
- Configurar umbrales de stock bajo.
- Registrar cargas iniciales y reabastecimientos.
- Inactivar insumos conservando su información histórica.

### 4.4. Registro de movimientos

El módulo de Movimientos permite registrar ingresos y egresos de insumos clínicos.

Las operaciones conservan información relacionada con el insumo, lote, cantidad, área, turno, fecha y usuario responsable.

Se aplican validaciones para impedir operaciones que produzcan existencias negativas.

### 4.5. Priorización FEFO

Control Médica incorpora el criterio FEFO (*First Expired, First Out*).

Durante el registro de un egreso, el sistema consulta los lotes disponibles y propone el lote cuya fecha de vencimiento sea más próxima.

El usuario autorizado puede seleccionar un lote diferente cuando la situación operativa lo requiera, siempre que disponga de existencias suficientes.

### 4.6. Historial y reversión de movimientos

El módulo Historial/Kárdex permite consultar movimientos y ejecutar reversiones conforme a los permisos establecidos.

Las reglas principales son:

- El Enfermero puede revertir movimientos propios dentro de un máximo de 24 horas.
- El Encargado de servicio y el Supervisor pueden realizar reversiones autorizadas sin esa restricción temporal, dentro del área correspondiente.
- Toda reversión requiere una justificación de al menos diez caracteres después de eliminar espacios iniciales y finales.
- No se permite revertir nuevamente un movimiento que ya fue revertido.
- La reversión de egresos restituye existencias.
- La reversión de ingresos y cargas iniciales descuenta existencias, siempre que el stock disponible sea suficiente.

La implementación de reversión utiliza transacciones de Cloud Firestore para coordinar las modificaciones de existencias, la retirada del movimiento del Kárdex operativo y el registro de evidencia histórica en auditoría.

### 4.7. Conservación de precios históricos (RF-32 / RN-16)

El prototipo conserva el precio unitario asociado con cada nuevo movimiento mediante el campo `precio_unitario`.

Esto permite que los reportes utilicen el precio registrado al momento de la operación, evitando que cambios posteriores en el catálogo alteren la valorización de los movimientos que contienen dicho campo.

Para movimientos anteriores que no incluyen `precio_unitario`, la aplicación utiliza un mecanismo de compatibilidad que consulta el precio disponible en el catálogo.

Por tanto, los registros anteriores no cuentan necesariamente con la misma protección histórica.

### 4.8. Reportes

El sistema proporciona reportes según los permisos correspondientes:

- Reporte Diario/Por Turno.
- Reporte Por Período.
- Reporte Mensual basado en el formato SPS-1062.
- Exportación de reportes habilitados a Excel.

Los reportes permiten consultar y consolidar información de movimientos, existencias y consumos.

El reporte mensual se basa en la estructura operativa utilizada como referencia durante el desarrollo y no constituye por sí mismo una sustitución formal de los documentos institucionales de entrega.

### 4.9. Auditoría y conciliación

El módulo de Auditoría permite al Supervisor consultar eventos relevantes relacionados con modificaciones, reversiones y otras operaciones sensibles.

Las reversiones conservan evidencia histórica del movimiento original y de la operación realizada.

El prototipo también contempla conciliaciones de inventario mediante comparación de existencias registradas y cantidades físicas.

Las actas de conciliación se conservan en documentos de la colección `metadata`, identificados mediante el prefijo `conciliacion_`.

Los usuarios autorizados pueden consultar estas actas desde Auditoría y exportarlas a Excel.

### 4.10. Administración

El rol Supervisor dispone de funcionalidades para:

- Gestionar usuarios y roles.
- Activar o inactivar cuentas.
- Configurar categorías de insumos.
- Administrar información institucional utilizada en reportes.
- Realizar ajustes físicos de inventario.
- Consultar registros de auditoría.

## 5. Arquitectura del proyecto

El prototipo utiliza una arquitectura cliente basada en React y servicios administrados de Firebase.

**Componentes principales:**

1. Interfaz PWA desarrollada con React.
2. Firebase Authentication para autenticación.
3. Cloud Firestore para almacenamiento documental.
4. Reglas de seguridad Firestore para controlar el acceso a los datos.
5. Firebase Hosting para alojamiento de la aplicación.

La actualización de existencias y determinadas operaciones críticas utilizan mecanismos transaccionales para mantener la consistencia de la información.

## 6. Estructura del repositorio

```text
control-medica-prototipo/
├── README.md
├── .gitignore
├── firebase.json
├── firestore.rules
├── .firebaserc
└── frontend/
    ├── .env.example
    ├── package.json
    ├── package-lock.json
    ├── vite.config.js
    ├── public/
    └── src/
        ├── components/
        ├── contexts/
        ├── pages/
        │   ├── Login.jsx
        │   ├── Dashboard.jsx
        │   ├── Inventario.jsx
        │   ├── Movimientos.jsx
        │   ├── Historial.jsx
        │   ├── Reportes.jsx
        │   ├── Auditoria.jsx
        │   ├── Usuarios.jsx
        │   └── Configuracion.jsx
        ├── services/
        └── utils/
```

La estructura muestra los principales archivos y directorios funcionales del proyecto.

## 7. Requisitos para ejecución local

Para ejecutar el frontend se requiere:

- Node.js compatible con la versión de Vite instalada.
- npm.
- Git.
- Un proyecto Firebase configurado para evaluación.
- Acceso a los servicios Firebase necesarios.

Se recomienda utilizar una versión LTS de Node.js compatible con las dependencias declaradas en `frontend/package.json`.

## 8. Instalación

### 8.1. Clonar el repositorio

```bash
git clone https://github.com/Josue-Morales-0214/control-medica-prototipo.git
cd control-medica-prototipo/frontend
```

Si el repositorio es privado, se requiere una cuenta de GitHub con acceso autorizado.

### 8.2. Instalar dependencias

```bash
npm ci
```

Este comando instala las dependencias definidas en `package-lock.json`.

### 8.3. Configurar Firebase

Crear un archivo `.env.local` a partir de la plantilla:

```bash
cp .env.example .env.local
```

Configurar las variables requeridas:

```env
VITE_FIREBASE_API_KEY=valor_de_configuracion
VITE_FIREBASE_AUTH_DOMAIN=proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=identificador_del_proyecto
VITE_FIREBASE_STORAGE_BUCKET=valor_del_proyecto
VITE_FIREBASE_MESSAGING_SENDER_ID=identificador_del_remitente
VITE_FIREBASE_APP_ID=identificador_de_aplicacion
```

Los valores deben corresponder a un proyecto Firebase autorizado.

La configuración del cliente Firebase no sustituye las reglas de seguridad de Firestore ni el control de acceso a los recursos.

No se deben publicar claves privadas, credenciales administrativas ni archivos de entorno con información sensible.

### 8.4. Ejecutar la aplicación

```bash
npm run dev
```

Vite mostrará en la terminal la dirección local disponible, normalmente:

```text
http://localhost:5173
```

La aplicación requiere cuentas y datos de prueba configurados en el proyecto Firebase correspondiente para evaluar las funcionalidades protegidas.

## 9. Compilación

Para generar una compilación de producción del frontend:

```bash
npm run build
```

Los archivos generados se almacenan en el directorio de salida configurado por Vite, normalmente `dist/`.

Para comprobar localmente la compilación:

```bash
npm run preview
```

La publicación mediante Firebase Hosting debe realizarse únicamente con un proyecto autorizado y después de revisar la configuración correspondiente.

Este README no incluye comandos automáticos de despliegue a producción para evitar modificaciones accidentales sobre entornos operativos.

## 10. Entornos de evaluación

Durante la evaluación académica del prototipo se utilizó un entorno independiente de la instancia operativa.

El entorno de evaluación empleó cuentas, inventarios, lotes y movimientos ficticios para ejecutar pruebas sin modificar información utilizada en las áreas estudiadas.

Se recomienda mantener esta separación al reproducir pruebas funcionales o verificar cambios posteriores.

## 11. Seguridad y privacidad

El repositorio de entrega no debe incluir:

- Credenciales privadas o claves de cuentas de servicio.
- Archivos `.env` con información de configuración no destinada a publicación.
- Bases de datos operativas.
- Información personal o clínica de pacientes.
- Documentos institucionales restringidos.
- Archivos de resultados que permitan identificar individualmente a participantes.
- Dependencias descargadas o archivos temporales de compilación.

Las operaciones sobre Cloud Firestore deben protegerse mediante reglas de seguridad apropiadas para el entorno utilizado.

La existencia de controles en la interfaz no sustituye las validaciones de autorización que correspondan en los servicios de almacenamiento.

## 12. Evaluación académica

El prototipo fue evaluado mediante:

- Pruebas funcionales y verificación de reglas de negocio.
- Medición comparativa del tiempo de registro de egresos.
- Revisión documental de completitud de trazabilidad.
- Evaluación estructurada con usuarios.

La investigación consideró 12 participantes para la medición temporal, 120 movimientos para la revisión documental y 15 usuarios para la valoración del prototipo.

Los resultados y sus limitaciones se encuentran documentados en el trabajo de graduación.

El repositorio proporciona el código fuente correspondiente al prototipo, pero no sustituye los instrumentos, anexos ni evidencias académicas de la investigación.

## 13. Uso de inteligencia artificial generativa

Durante el desarrollo y documentación del proyecto se utilizaron herramientas de inteligencia artificial generativa como apoyo complementario.

- **Gemini mediante Antigravity IDE:** asistencia para generación, revisión y corrección de código a partir de instrucciones funcionales y técnicas proporcionadas por el autor.
- **Claude:** apoyo para elaboración y revisión de diagramas técnicos.
- **ChatGPT:** apoyo para revisión de redacción académica, organización documental e identificación de inconsistencias técnicas.

Las herramientas se utilizaron como asistencia durante el proceso de desarrollo y documentación.

La responsabilidad por las decisiones de diseño, la implementación presentada, la evaluación y el contenido académico corresponde al autor del proyecto.

## 14. Alcance y limitaciones

Control Médica constituye un prototipo funcional desarrollado y evaluado en el contexto definido para el trabajo de graduación.

No representa una certificación de software sanitario ni una autorización para su implementación generalizada en otras unidades hospitalarias.

Su utilización en otros entornos requiere autorización, configuración de infraestructura, evaluación de seguridad y validación de los procedimientos correspondientes.

La herramienta no sustituye formalmente los registros institucionales ni los procesos de conciliación física de inventarios.

## 15. Repositorio y versión académica

**Repositorio:**

https://github.com/Josue-Morales-0214/control-medica-prototipo

**Rama principal:** `main`

**Versión de tesis:** `v1.0.0-tesis`

**Referencia de versión:**

https://github.com/Josue-Morales-0214/control-medica-prototipo/tree/v1.0.0-tesis

La etiqueta identifica la versión del código fuente correspondiente a la entrega académica.

El repositorio de entrega se mantiene separado del repositorio reutilizado durante las etapas previas de desarrollo.

## 16. Autoría

Proyecto desarrollado como trabajo de graduación de la Licenciatura en Tecnología de Sistemas Informáticos de la Universidad del Valle de Guatemala.

**Autor:** Josué David Morales Sajché  
**Año:** 2026

---

**Control Médica — Prototipo funcional de control interno y trazabilidad de insumos clínicos.**
