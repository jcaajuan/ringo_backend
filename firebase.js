const admin = require('firebase-admin');

let serviceAccount;

if (process.env.FIREBASE_CREDENTIALS) {
  // En producción (Render)
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} else {
  // En desarrollo local
  serviceAccount = require('./firebase-key.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = db;