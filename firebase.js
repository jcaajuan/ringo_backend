const admin = require('firebase-admin');

let serviceAccount;

if (process.env.FIREBASE_CREDENTIALS) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } catch (err) {
    console.error('❌ Error al parsear FIREBASE_CREDENTIALS en Render:', err.message);
  }
} else {
  try {
    serviceAccount = require('./firebase-key.json');
  } catch (err) {
    console.error('❌ No se encontró firebase-key.json localmente');
  }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential ? admin.credential.cert(serviceAccount) : admin.cert(serviceAccount)
  });
}

const db = admin.firestore();

console.log('✅ Firebase Firestore inicializado correctamente');

module.exports = db;