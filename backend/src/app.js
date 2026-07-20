import express from 'express';
import cors from 'cors';
import tipoMascotaRoutes from './routes/tipoMascota.routes.js';
import categoriaRoutes from './routes/categoria.routes.js';
import proveedorRoutes from './routes/proveedor.routes.js';
import productoRoutes from './routes/producto.routes.js';

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  }),
);

app.use(express.json());

app.use('/api/tipos-mascota', tipoMascotaRoutes);
app.use('/api/categorias', categoriaRoutes);
app.use('/api/proveedores', proveedorRoutes);
app.use('/api/productos', productoRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'API Petshop funcionando correctamente',
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
  });
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;

  if (statusCode === 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    error:
      statusCode === 500
        ? 'Error interno del servidor'
        : error.message,
  });
});

export default app;