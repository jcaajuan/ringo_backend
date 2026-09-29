const admin = require('firebase-admin');

let serviceAccount;

if (process.env.FIREBASE_CREDENTIALS) {
  try {
    // Si la variable viene como string JSON desde Render
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    
    // Corregir posibles saltos de línea en la clave privada
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } catch (err) {
    console.error('❌ Error al parsear FIREBASE_CREDENTIALS:', err.message);
  }
} else {
  try {
    // Carga local
    serviceAccount = require('./firebase-key.json');
  } catch (err) {
    console.error('❌ No se encontró firebase-key.json localmente');
  }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

console.log('✅ Firebase Firestore inicializado correctamente');

module.exports = db;