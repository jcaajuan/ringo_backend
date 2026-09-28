const express = require('express');
const router = express.Router();

// POST /api/pagos/webhook-pago
router.post('/webhook-pago', (req, res) => {
    const { referencia, monto, telefono } = req.body;

    console.log('\n--- 💳 NUEVO PAGO RECIBIDO DESDE MACRODROID ---');
    console.log(`Referencia : ${referencia}`);
    console.log(`Monto      : ${monto}`);
    console.log(`Teléfono   : ${telefono}`);
    console.log('-----------------------------------------------\n');

    res.status(200).json({
        success: true,
        message: 'Notificación de pago procesada correctamente',
        data: { referencia, monto, telefono }
    });
});

module.exports = router;