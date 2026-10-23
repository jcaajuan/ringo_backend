const express = require('express');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue } = require('firebase-admin/firestore');
const db = require('../firebase');

const router = express.Router();

function perfilDesdeToken(decoded) {
  const nombre = String(decoded.name || '').trim();
  const email = String(decoded.email || '').trim().toLowerCase();
  const foto = String(decoded.picture || '').trim();
  return {
    uid: decoded.uid,
    email,
    displayName: nombre,
    nombre,
    photoURL: foto,
    proveedor: 'google',
    rol: 'cliente'
  };
}

// Crea el perfil una sola vez. `users` es la colección pedida para Google.
// `usuarios` es la que ya lee la app al armar un viaje.
async function guardarPerfil(uid, datos) {
  const refs = [
    db.collection('users').doc(uid),
    db.collection('usuarios').doc(uid)
  ];
  let esNuevo = false;

  await db.runTransaction(async (tx) => {
    const snaps = [];
    for (const ref of refs) snaps.push(await tx.get(ref));
    esNuevo = snaps.every((snap) => !snap.exists);
    const carga = {
      ...datos,
      updatedAt: FieldValue.serverTimestamp()
    };
    if (esNuevo) {
      carga.telefono = '';
      carga.ciudad = 'El Tigre';
      carga.estado = 'Anzoátegui';
      carga.createdAt = FieldValue.serverTimestamp();
    }
    for (const ref of refs) tx.set(ref, carga, { merge: true });
  });

  return esNuevo;
}

// POST /api/auth/google
// Body: { idToken }  token de Firebase, no el token crudo de Google.
router.post('/google', async (req, res) => {
  if (!db) {
    return res.status(503).json({
      success: false,
      message: 'Firebase no está configurado en el servidor'
    });
  }

  const idToken = String((req.body && req.body.idToken) || '').trim();
  if (!idToken || idToken.length < 20) {
    return res.status(400).json({
      success: false,
      message: 'Falta el token de la sesión.'
    });
  }

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    if (!decoded.uid) {
      return res.status(401).json({
        success: false,
        message: 'La sesión de Google no es válida.'
      });
    }

    const datos = perfilDesdeToken(decoded);
    const esNuevo = await guardarPerfil(decoded.uid, datos);
    console.log(`[auth/google] ${esNuevo ? 'perfil nuevo' : 'perfil existente'} uid=${decoded.uid}`);

    return res.json({
      success: true,
      isNewUser: esNuevo,
      user: {
        uid: datos.uid,
        email: datos.email,
        displayName: datos.displayName,
        photoURL: datos.photoURL
      }
    });
  } catch (error) {
    console.error('[auth/google] No se pudo validar la sesión o guardar el perfil');
    console.error('[auth/google] code:', error && error.code);
    console.error('[auth/google] message:', error && error.message);
    if (error && error.stack) console.error(error.stack);
    const codigo = String(error && error.code || '');
    if (codigo.includes('id-token') || codigo.includes('argument-error')) {
      return res.status(401).json({
        success: false,
        message: 'La sesión de Google expiró. Intenta de nuevo.'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'No se pudo guardar el perfil.'
    });
  }
});

module.exports = router;
