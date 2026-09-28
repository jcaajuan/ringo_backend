require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

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

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Ringo corriendo en http://localhost:${PORT}`);
});