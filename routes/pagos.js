const express = require('express');
const router = express.Router();
const db = require('../firebase');

// POST /api/pagos/webhook-pago
router.post('/webhook-pago', async (req, res) => {
  if (!db) {
    return res.status(503).json({
      success: false,
      message: 'Firebase no está configurado en el servidor'
    });
  }

  const { referencia, monto, telefono } = req.body || {};
  const refLimpia = referencia != null ? String(referencia).trim() : '';

  if (!refLimpia) {
    return res.status(400).json({
      success: false,
      message: 'La referencia de pago es obligatoria'
    });
  }

  const montoLimpio = monto != null && String(monto).trim() !== '' ? String(monto).trim() : '0.00';
  const telLimpio = telefono != null && String(telefono).trim() !== '' ? String(telefono).trim() : 'N/A';

  try {
    await db.collection('pagos').add({
      referencia: refLimpia,
      monto: montoLimpio,
      telefono: telLimpio,
      usado: false,
      fecha: new Date().toISOString()
    });

    console.log('\n--- 💳 PAGO GUARDADO EN FIREBASE ---');
    console.log(`Referencia : ${refLimpia}`);
    console.log(`Monto      : ${montoLimpio}`);
    console.log(`Teléfono   : ${telLimpio}`);
    console.log('-------------------------------------\n');

    return res.status(200).json({
      success: true,
      message: 'Notificación guardada en Firebase correctamente',
      data: { referencia: refLimpia, monto: montoLimpio, telefono: telLimpio }
    });
  } catch (error) {
    console.error('❌ Error al guardar en Firebase:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error al registrar el pago en la base de datos'
    });
  }
});

module.exports = router;
