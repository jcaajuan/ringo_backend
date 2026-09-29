const express = require('express');
const router = express.Router();
const db = require('../firebase');

// POST /api/pagos/webhook-pago
router.post('/webhook-pago', async (req, res) => {
  const { referencia, monto, telefono } = req.body;

  try {
    // Guardar en la colección "pagos" de Firebase
    await db.collection('pagos').add({
      referencia: referencia || 'N/A',
      monto: monto || '0.00',
      telefono: telefono || 'N/A',
      fecha: new Date().toISOString()
    });

    console.log('\n--- 💳 PAGO GUARDADO EN FIREBASE ---');
    console.log(`Referencia : ${referencia}`);
    console.log(`Monto      : ${monto}`);
    console.log(`Teléfono   : ${telefono}`);
    console.log('-------------------------------------\n');

    return res.status(200).json({
      success: true,
      message: 'Notificación de pago guardada en la base de datos',
      data: { referencia, monto, telefono }
    });
  } catch (error) {
    console.error('Error al guardar en Firebase:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al registrar el pago en la base de datos'
    });
  }
});

module.exports = router;