import express from 'express';
import cors from 'cors';

import sequelize from './config/database.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tipoMascotaRoutes from './routes/tipoMascota.routes.js';
import categoriaRoutes from './routes/categoria.routes.js';
import proveedorRoutes from './routes/proveedor.routes.js';
import productoRoutes from './routes/producto.routes.js';
import clienteRoutes from './routes/cliente.routes.js';
import medioPagoRoutes from './routes/medioPago.routes.js';
import ventaRoutes from './routes/venta.routes.js';
import usuarioRoutes from './routes/usuario.routes.js';
import promocionProductoRoutes from './routes/promocionProducto.routes.js';
import compraRoutes from './routes/compra.routes.js';
import solicitudCancelacionRoutes from './routes/solicitudCancelacion.routes.js';
import georefRoutes from './routes/georef.routes.js';
import favoritoRoutes from './routes/favorito.routes.js';
import avisoRoutes from './routes/aviso.routes.js';
import solicitudVendedorRoutes from './routes/solicitudVendedor.routes.js';
import tiendaRoutes from './routes/tienda.routes.js';
import carritoRoutes from './routes/carrito.routes.js';

import {
  rutaNoEncontrada,
  manejarErrores,
} from './middlewares/error.middleware.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendDist = path.resolve(__dirname, '../../frontend/dist');

// credentials:true es necesario para que el navegador mande/reciba las
// cookies de sesión (ver docs/backend-autenticacion.md) en pedidos
// cross-origin (el frontend y el backend corren en puertos distintos, así
// que técnicamente son orígenes distintos aunque compartan host). Por eso
// origin no puede ser '*': con credentials:true el navegador exige un
// origen explícito.
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    // Permite que el frontend lea el nombre del archivo enviado en
    // Content-Disposition durante una descarga cross-origin.
    exposedHeaders: ['Content-Disposition'],
  }),
);

app.use(express.json());

// `entorno` (no es un secreto: solo indica contra qué configuración corre
// esta instancia — "desarrollo" si ENTORNO no está definida, o el valor
// literal de ENTORNO en .env.test/.env.e2e) permite que un script o una
// prueba E2E verifique, ANTES de sembrar o escribir nada, que efectivamente
// está hablando con la instancia aislada esperada y no con la de
// desarrollo por error (ver playwright.config.js y
// scripts/sembrarDatosE2E.js). No expone ninguna credencial ni detalle
// interno más allá de ese nombre.
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'API Petshop funcionando correctamente',
    entorno: process.env.ENTORNO || 'desarrollo',
  });
});

// En E2E permite comprobar la base y el usuario efectivos de la conexión.
// La ruta está deshabilitada en los demás entornos y /api/health no depende
// de MySQL.
app.get('/api/health/aislamiento', async (req, res) => {
  if (process.env.ENTORNO !== 'e2e') {
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }

  try {
    const [[fila]] = await sequelize.query(
      'SELECT DATABASE() AS baseDeDatos, CURRENT_USER() AS usuarioConexion',
    );
    res.status(200).json({
      entorno: process.env.ENTORNO,
      baseDeDatos: fila.baseDeDatos,
      usuarioConexion: fila.usuarioConexion,
    });
  } catch (error) {
    // El detalle del error queda en los logs y no se expone en esta ruta
    // pública.
    console.error('Fallo al confirmar la base de datos efectiva:', error.message);
    res.status(503).json({
      error: 'No se pudo confirmar la base de datos efectiva.',
    });
  }
});

app.use('/api/tipos-mascota', tipoMascotaRoutes);
app.use('/api/categorias', categoriaRoutes);
app.use('/api/proveedores', proveedorRoutes);
app.use('/api/productos', productoRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/medios-pago', medioPagoRoutes);
app.use('/api/ventas', ventaRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/promociones', promocionProductoRoutes);
app.use('/api/compras', compraRoutes);
app.use('/api/solicitudes-cancelacion', solicitudCancelacionRoutes);
app.use('/api/georef', georefRoutes);
app.use('/api/favoritos', favoritoRoutes);
app.use('/api/avisos', avisoRoutes);
app.use('/api/solicitudes-vendedor', solicitudVendedorRoutes);
app.use('/api/tiendas', tiendaRoutes);
app.use('/api/carrito', carritoRoutes);

// Servir los archivos compilados del frontend (React + Vite).
app.use(express.static(frontendDist));

// Para las rutas administradas por React Router,
// entregar index.html y permitir que React muestre la página correspondiente.
app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
  if (!req.accepts('html')) {
    return next();
  }

  res.sendFile(path.join(frontendDist, 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.use(rutaNoEncontrada);
app.use(manejarErrores);

export default app;