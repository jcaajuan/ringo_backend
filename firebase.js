const admin = require('firebase-admin');

function obtenerCredenciales() {
  if (process.env.FIREBASE_CREDENTIALS) {
    try {
      // 1. Limpieza de posibles comillas extras o espacios
      let rawCreds = process.env.FIREBASE_CREDENTIALS.trim();
      
      // 2. Parsear el JSON
      const parsed = JSON.parse(rawCreds);
      
      // 3. Formatear la clave privada para asegurar los saltos de línea correctos
      if (parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (err) {
      console.error('❌ Error al procesar FIREBASE_CREDENTIALS:', err.message);
    }
  }

  // Carga local si no existe la variable de entorno
  try {
    return require('./firebase-key.json');
  } catch (err) {
    console.error('❌ No se encontró el archivo firebase-key.json local');
  }

  return null;
}

const serviceAccount = obtenerCredenciales();

if (serviceAccount) {
  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Firestore conectado exitosamente');
    } catch (err) {
      console.error('❌ Error al inicializar Firebase Admin:', err.message);
    }
  }
} else {
  console.error('❌ CRÍTICO: No hay credenciales válidas para iniciar Firebase');
}

const db = admin.firestore();

module.exports = db;