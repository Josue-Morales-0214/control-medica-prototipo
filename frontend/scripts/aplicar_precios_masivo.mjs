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

async function aplicarPrecios() {
  console.log("=== INICIANDO CARGA MASIVA DE PRECIOS EN FIRESTORE ===");
  
  // 2. Leer Excel
  const excelPath = path.resolve(__dirname, '../PRECIO-INSUMOS.xlsx');
  const wb = xlsx.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  const priceMap = new Map();
  for (const r of rows) {
    if (r[0] !== undefined && r[1] !== undefined && !isNaN(Number(r[0]))) {
      const codeStr = String(r[0]).trim();
      const priceNum = parseFloat(r[1]) || 0;
      priceMap.set(codeStr, priceNum);
    }
  }

  console.log(`Códigos únicos en Excel: ${priceMap.size}`);

  // 3. Consultar insumos actuales en Firestore
  const insumosSnap = await db.collection('insumos').get();
  console.log(`Documentos encontrados en Firestore: ${insumosSnap.size}`);

  let updatedCount = 0;
  const batches = [];
  let currentBatch = db.batch();
  let opCount = 0;

  insumosSnap.forEach(docSnap => {
    const data = docSnap.data();
    const codigoStr = String(data.codigo || '').trim();

    if (priceMap.has(codigoStr)) {
      const nuevoPrecio = priceMap.get(codigoStr);
      currentBatch.update(docSnap.ref, { precio_unitario: nuevoPrecio });
      updatedCount++;
      opCount++;

      // Firestore limita 500 operaciones por batch
      if (opCount === 450) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        opCount = 0;
      }
    }
  });

  if (opCount > 0) {
    batches.push(currentBatch);
  }

  console.log(`Guardando cambios para ${updatedCount} insumos en ${batches.length} batch(es)...`);
  for (let i = 0; i < batches.length; i++) {
    await batches[i].commit();
    console.log(`Batch ${i + 1}/${batches.length} completado.`);
  }

  console.log(`\n✅ ¡ÉXITO! Se actualizaron ${updatedCount} insumos con su Precio Unitario.`);
}

aplicarPrecios().catch(err => {
  console.error("Error aplicando precios:", err);
  process.exit(1);
});
