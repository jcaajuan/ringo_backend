const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function obtenerCredenciales() {
  if (process.env.FIREBASE_CREDENTIALS) {
    try {
      let rawCreds = process.env.FIREBASE_CREDENTIALS.trim();
      const parsed = JSON.parse(rawCreds);
      
      if (parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (err) {
      console.error('❌ Error al parsear FIREBASE_CREDENTIALS:', err.message);
    }
  }

  try {
    return require('./firebase-key.json');
  } catch (err) {
    console.error('❌ No se encontró firebase-key.json en local');
  }

  return null;
}

const serviceAccount = obtenerCredenciales();

if (!serviceAccount) {
  console.error('❌ CRÍTICO: No se pudieron cargar las credenciales de Firebase');
} else {
  if (getApps().length === 0) {
    try {
      initializeApp({
        credential: cert(serviceAccount)
      });
      console.log('✅ Firebase conectado exitosamente');
    } catch (err) {
      console.error('❌ Error al inicializar Firebase:', err.message);
    }
  }
}

const db = getFirestore();

module.exports = db;