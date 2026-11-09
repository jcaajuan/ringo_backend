const express = require('express');
const db = require('../firebase');

const router = express.Router();

function porcentaje(valor) {
  if (typeof valor === 'boolean' || valor == null || valor === '') return null;
  const numero = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(numero)) return null;
  return numero;
}

// POST /api/admin/update-commission
// Body: { driverShare, platformShare } — deben sumar 100.
router.post('/update-commission', async (req, res) => {
  if (!db) {
    return res.status(503).json({
      success: false,
      message: 'Firebase no está configurado en el servidor'
    });
  }

  const body = req.body || {};
  const driverShare = porcentaje(body.driverShare);
  const platformShare = porcentaje(body.platformShare);

  if (driverShare == null || platformShare == null) {
    return res.status(400).json({
      success: false,
      message: 'driverShare y platformShare deben ser números.'
    });
  }
  if (driverShare < 0 || driverShare > 100 || platformShare < 0 || platformShare > 100) {
    return res.status(400).json({
      success: false,
      message: 'Cada porcentaje debe estar entre 0 y 100.'
    });
  }

  const suma = Math.round((driverShare + platformShare) * 100) / 100;
  if (suma !== 100) {
    return res.status(400).json({
      success: false,
      message: 'driverShare y platformShare deben sumar 100%.'
    });
  }

  try {
    await db.collection('settings').doc('configuracion').set({
      driverSharePercentage: driverShare,
      platformSharePercentage: platformShare
    }, { merge: true });

    return res.json({
      success: true,
      driverSharePercentage: driverShare,
      platformSharePercentage: platformShare
    });
  } catch (error) {
    console.error('Error al guardar la comisión:', error.message);
    return res.status(500).json({
      success: false,
      message: 'No se pudo guardar la comisión.'
    });
  }
});

module.exports = router;
