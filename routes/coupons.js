const express = require('express');
const { FieldValue } = require('firebase-admin/firestore');
const db = require('../firebase');

const router = express.Router();

const CODIGO = 'PRIMERVIAJE';
const SERVICIOS = new Set(['delivery', 'mototaxi']);
const MENSAJE_USADO = 'El beneficio ya fue utilizado en este dispositivo.';

function texto(valor, maximo) {
  const limpio = String(valor || '').trim();
  if (!limpio || limpio.length > maximo || limpio.includes('/')) return null;
  if (limpio === '.' || limpio === '..') return null;
  return limpio;
}

// POST /api/coupons/claim
router.post('/claim', async (req, res) => {
  if (!db) {
    return res.status(503).json({
      success: false,
      message: 'Firebase no está configurado en el servidor'
    });
  }

  const body = req.body || {};
  const userId = texto(body.userId, 128);
  const deviceId = texto(body.deviceId, 128);
  const serviceType = String(body.serviceType || '').trim().toLowerCase();
  const code = String(body.code || CODIGO).trim().toUpperCase();

  if (!userId || !deviceId) {
    return res.status(400).json({
      success: false,
      message: 'Faltan el usuario o el identificador del dispositivo.'
    });
  }
  if (code !== CODIGO) {
    return res.status(400).json({
      success: false,
      message: 'El cupón no es válido.'
    });
  }
  if (!SERVICIOS.has(serviceType)) {
    return res.status(400).json({
      success: false,
      message: 'El cupón Primer Viaje Gratis solo aplica a delivery y mototaxi.'
    });
  }

  const deviceRef = db.collection('redeemed_devices').doc(deviceId);
  const userRef = db.collection('redeemed_users').doc(userId);
  const registro = {
    userId,
    deviceId,
    serviceType,
    code: CODIGO,
    discountPercent: 100,
    redeemedAt: FieldValue.serverTimestamp()
  };

  try {
    await db.runTransaction(async (tx) => {
      const deviceSnap = await tx.get(deviceRef);
      const userSnap = await tx.get(userRef);
      if (deviceSnap.exists || userSnap.exists) {
        const error = new Error(MENSAJE_USADO);
        error.statusCode = 400;
        throw error;
      }
      tx.set(deviceRef, registro);
      tx.set(userRef, registro);
    });

    console.log(`[coupons] PRIMERVIAJE canjeado user=${userId} device=${deviceId} servicio=${serviceType}`);
    return res.json({
      success: true,
      code: CODIGO,
      discountPercent: 100,
      serviceType,
      message: 'Cupón aplicado. Este viaje queda gratis.'
    });
  } catch (error) {
    console.error('[coupons/claim] No se pudo canjear el cupón');
    console.error('[coupons/claim] code:', error && error.code);
    console.error('[coupons/claim] message:', error && error.message);
    if (error && error.stack) console.error(error.stack);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: 'No se pudo validar el cupón.'
    });
  }
});

module.exports = router;
