require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares de parseo: deben ir antes de cualquier ruta
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta principal
app.get('/', (req, res) => {
    res.json({
        app: 'Ringo Delivery API',
        status: 'Online',
        version: '1.0.0'
    });
});

// Rutas de la API
const pagosRoutes = require('./routes/pagos');
app.use('/api/pagos', pagosRoutes);

const viajesRoutes = require('./routes/viajes');
app.use('/api/viajes', viajesRoutes);

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const couponsRoutes = require('./routes/coupons');
app.use('/api/coupons', couponsRoutes);

const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

const db = require('./firebase');
const { escucharNotificaciones } = require('./notificaciones');
if (db) escucharNotificaciones(db);

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Ringo corriendo en http://localhost:${PORT}`);
});