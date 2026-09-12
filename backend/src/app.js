import express from 'express';
import cors from 'cors';

import sequelize from './config/database.js';

import tipoMascotaRoutes from './routes/tipoMascota.routes.js';
import categoriaRoutes from './routes/categoria.routes.js';
import proveedorRoutes from './routes/proveedor.routes.js';
import productoRoutes from './routes/producto.routes.js';
import clienteRoutes from './routes/cliente.routes.js';
import medioPagoRoutes from './routes/medioPago.routes.js';
import ventaRoutes from './routes/venta.routes.js';
import usuarioRoutes from './routes/usuario.routes.js';
import promocionProductoRoutes from './routes/promocionProducto.routes.js';

import {
  rutaNoEncontrada,
  manejarErrores,
} from './middlewares/error.middleware.js';

const app = express();

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

// Corrección (revisión independiente): `entorno`, arriba, es solo el valor
// de una variable de entorno — si a alguien se le fuera la mano editando
// .env.e2e y DB_NAME terminara apuntando a otra base, este endpoint
// seguiría diciendo "e2e" sin que nadie lo notara. Este SÍ hace una
// consulta real a la base ya conectada (SELECT DATABASE()/CURRENT_USER(),
// mismo patrón que server.js y scripts/sembrarDatosE2E.js) para que
// frontend/e2e/globalSetupAislamiento.js pueda confirmar, antes de correr
// cualquier prueba, contra qué base y con qué usuario está conectada de
// verdad la instancia que el frontend va a usar — no solo cómo se
// autodenomina. Separado de /api/health (que debe seguir sin depender de
// la base, para no romper las pruebas del backend que corren sin MySQL,
// ver .github/workflows/backend-tests.yml).
//
// Corrección (revisión posterior): expone nombre de base y usuario de
// conexión — no son credenciales, pero tampoco hace falta que cualquier
// instancia (desarrollo, producción) los conteste. Habilitado SOLO cuando
// ENTORNO=e2e, que es el único caso que lo necesita (ver
// globalSetupAislamiento.js). Responde 404, igual que una ruta que no
// existe (rutaNoEncontrada, error.middleware.js), sin llegar a consultar
// la base — así "fuera de E2E no debe consultar ni exponer" se cumple de
// forma literal, no solo devolviendo un error distinto.
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
    // Corrección (revisión independiente): error.message NO viaja en la
    // respuesta (ruta pública, sin autenticación) — un mensaje de Sequelize
    // podría filtrar detalles operativos de la conexión real. Se registra
    // en el log del servidor, que sí es de confianza.
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

app.use(rutaNoEncontrada);
app.use(manejarErrores);

export default app;