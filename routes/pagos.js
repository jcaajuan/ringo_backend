const express = require('express');
const router = express.Router();
const db = require('../firebase');

// POST /api/pagos/webhook-pago
router.post('/webhook-pago', async (req, res) => {
  console.log('\n--- WEBHOOK PAGO RECIBIDO ---');
  console.log('Método HTTP :', req.method);
  console.log('Headers     :', req.headers);
  console.log('req.body    :', req.body);
  console.log('req.query   :', req.query);
  console.log('------------------------------\n');

  const referencia = String(req.body?.referencia || req.query?.referencia || '').trim();
  const monto = String(req.body?.monto || req.query?.monto || '0.00').trim() || '0.00';
  const telefono = String(req.body?.telefono || req.query?.telefono || 'N/A').trim() || 'N/A';

  if (!referencia) {
    return res.status(400).json({
      success: false,
      message: 'Referencia obligatoria vacía'
    });
  }

  if (!db) {
    return res.status(503).json({
      success: false,
      message: 'Servicio de base de datos no disponible'
    });
  }

  try {
    await db.collection('pagos').add({
      referencia,
      monto,
      telefono,
      usado: false,
      fechaIngreso: new Date()
    });

    console.log('\n--- 💳 PAGO GUARDADO EN FIREBASE ---');
    console.log(`Referencia : ${referencia}`);
    console.log(`Monto      : ${monto}`);
    console.log(`Teléfono   : ${telefono}`);
    console.log('-------------------------------------\n');

    return res.status(200).json({
      success: true,
      message: 'Pago registrado correctamente'
    });
  } catch (error) {
    console.error('❌ Error al guardar en Firebase:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error interno al guardar el pago'
    });
  }
});

module.exports = router;
