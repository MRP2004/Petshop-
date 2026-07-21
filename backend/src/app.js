import express from 'express';
import cors from 'cors';

import tipoMascotaRoutes from './routes/tipoMascota.routes.js';
import categoriaRoutes from './routes/categoria.routes.js';
import proveedorRoutes from './routes/proveedor.routes.js';
import productoRoutes from './routes/producto.routes.js';
import clienteRoutes from './routes/cliente.routes.js';
import medioPagoRoutes from './routes/medioPago.routes.js';
import ventaRoutes from './routes/venta.routes.js';

import {
  rutaNoEncontrada,
  manejarErrores,
} from './middlewares/error.middleware.js';

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  }),
);

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'API Petshop funcionando correctamente',
  });
});

app.use('/api/tipos-mascota', tipoMascotaRoutes);
app.use('/api/categorias', categoriaRoutes);
app.use('/api/proveedores', proveedorRoutes);
app.use('/api/productos', productoRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/medios-pago', medioPagoRoutes);
app.use('/api/ventas', ventaRoutes);

app.use(rutaNoEncontrada);
app.use(manejarErrores);

export default app;