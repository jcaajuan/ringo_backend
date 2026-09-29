const express = require('express');
const router = express.Router();
const db = require('../firebase');

// POST /api/pagos/webhook-pago
router.post('/webhook-pago', async (req, res) => {
  const { referencia, monto, telefono } = req.body || {};

  const refLimpia = referencia || 'N/A';
  const montoLimpio = monto || '0.00';
  const telLimpio = telefono || 'N/A';

  try {
    // Guardar en la colección "pagos"
    await db.collection('pagos').add({
      referencia: refLimpia,
      monto: montoLimpio,
      telefono: telLimpio,
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