const admin = require('firebase-admin');

function getCredentials() {
  if (process.env.FIREBASE_CREDENTIALS) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_CREDENTIALS);
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
    console.error('❌ No se encontró firebase-key.json localmente');
  }

  return null;
}

const serviceAccount = getCredentials();

if (!admin.apps.length) {
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Firestore inicializado correctamente');
  } else {
    console.error('❌ No se pudieron cargar las credenciales de Firebase');
  }
}

const db = admin.firestore();

module.exports = db;