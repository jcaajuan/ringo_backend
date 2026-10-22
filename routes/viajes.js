const express = require('express');
const router = express.Router();
const db = require('../firebase');

const VIGENCIA_MS = 5 * 60 * 1000;

// POST /api/viajes/expirar
// Marca como expiradas las solicitudes pendientes con más de 5 minutos.
router.post('/expirar', async (req, res) => {
  if (!db) {
    return res.status(503).json({
      success: false,
      message: 'Firebase no está configurado en el servidor'
    });
  }

  try {
    const snap = await db.collection('viajes').where('estado', '==', 'pendiente').get();
    const limite = Date.now() - VIGENCIA_MS;
    let expirados = 0;

    for (const doc of snap.docs) {
      const created = doc.get('createdAt');
      const fecha = created && typeof created.toDate === 'function' ? created.toDate() : null;
      if (!fecha || fecha.getTime() > limite) continue;
      await doc.ref.update({
        estado: 'expirado',
        expiradoAt: new Date().toISOString()
      });
      expirados += 1;
    }

    return res.status(200).json({
      success: true,
      expirados
    });
  } catch (error) {
    console.error('Error al expirar viajes:', error.message);
    return res.status(500).json({
      success: false,
      message: 'No se pudieron expirar las solicitudes vencidas'
    });
  }
});

module.exports = router;
