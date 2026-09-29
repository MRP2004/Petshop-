import { solicitar } from './httpClient.js';

// "Mi tienda" (ronda 2, Etapa 8): siempre la del vendedor de la sesión,
// nunca por :id — ver backend/src/routes/tienda.routes.js.
const obtenerPropia = () => solicitar('/tiendas/propia');
const misProductos = () => solicitar('/tiendas/propia/productos');
const misVentas = () => solicitar('/tiendas/propia/ventas');
const miVentaPorId = (idVenta) => solicitar(`/tiendas/propia/ventas/${idVenta}`);

// Administración de tiendas: exclusivo administrador.
const listarTodas = () => solicitar('/tiendas');
const cambiarEstado = (idTienda, estado) =>
  solicitar(`/tiendas/${idTienda}/estado`, { metodo: 'PATCH', cuerpo: { estado } });

export default { obtenerPropia, misProductos, misVentas, miVentaPorId, listarTodas, cambiarEstado };
