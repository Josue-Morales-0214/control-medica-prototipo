import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Leer .env para obtener credenciales
const envPath = path.resolve(__dirname, '../../.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const match = envContent.match(/FIREBASE_CONFIG='([\s\S]*?)'/);
if (!match) {
  console.error("No se encontró FIREBASE_CONFIG en .env");
  process.exit(1);
}

const serviceAccount = JSON.parse(match[1]);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function simular() {
  console.log("=== SIMULACIÓN DE ACTUALIZACIÓN DE PRECIOS ===");
  
  // 2. Leer Excel
  const excelPath = path.resolve(__dirname, '../PRECIO-INSUMOS.xlsx');
  const wb = xlsx.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  // Mapa de Precios: { "14754": 1.78571429, ... }
  const priceMap = new Map();
  for (const r of rows) {
    if (r[0] !== undefined && r[1] !== undefined && !isNaN(Number(r[0]))) {
      const codeStr = String(r[0]).trim();
      const priceNum = parseFloat(r[1]) || 0;
      priceMap.set(codeStr, priceNum);
    }
  }

  console.log(`Códigos únicos con precio en el Excel: ${priceMap.size}`);

  // 3. Consultar insumos actuales en Firestore
  const insumosSnap = await db.collection('insumos').get();
  console.log(`Total documentos en colección 'insumos' en Firebase: ${insumosSnap.size}`);

  let coincidencias = 0;
  let sinPrecioEnExcel = 0;
  const porArea = {};
  const sampleMatches = [];

  insumosSnap.forEach(docSnap => {
    const data = docSnap.data();
    const codigoStr = String(data.codigo || '').trim();
    const area = data.area || 'Sin Área';
    
    if (!porArea[area]) porArea[area] = { total: 0, conPrecio: 0 };
    porArea[area].total++;

    if (priceMap.has(codigoStr)) {
      coincidencias++;
      porArea[area].conPrecio++;
      if (sampleMatches.length < 5) {
        sampleMatches.push({
          id: docSnap.id,
          codigo: codigoStr,
          nombre: data.nombre,
          area: data.area,
          precioActual: data.precio_unitario ?? 'No asignado',
          nuevoPrecio: priceMap.get(codigoStr)
        });
      }
    } else {
      sinPrecioEnExcel++;
    }
  });

  console.log("\n--- RESULTADOS POR ÁREA ---");
  for (const [area, stats] of Object.entries(porArea)) {
    console.log(`Área [${area}]: ${stats.conPrecio} de ${stats.total} insumos recibirán precio del Excel.`);
  }

  console.log(`\nTotal insumos en Firebase que coinciden con el Excel: ${coincidencias}`);
  console.log(`Insumos en Firebase sin precio en el Excel (mantendrán 0 o su precio previo): ${sinPrecioEnExcel}`);

  console.log("\n--- MUESTRA DE COINCIDENCIAS (Primeros 5) ---");
  console.log(JSON.stringify(sampleMatches, null, 2));
}

simular().catch(err => {
  console.error("Error en simulación:", err);
  process.exit(1);
});
