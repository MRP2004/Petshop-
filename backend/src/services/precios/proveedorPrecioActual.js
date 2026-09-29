import obtenerPrecioVigenteSinPromocion from './proveedorPrecioSinPromocion.service.js';

// Único punto de configuración del proveedor de precios activo (CU-04, §6
// / ronda de correcciones — "configuren el proveedor en un punto común
// para cotización y confirmación"): tanto el endpoint de cotización como
// compra.service.js#confirmarCompra llegan acá a través de
// cotizacion.service.js#cotizar, así que conectar las reglas reales de José
// es editar esta única línea, sin tocar cotizacion.service.js ni
// compra.service.js. Mientras José no las entregue, sigue siendo el
// proveedor sin promoción.
const proveedorPrecioActual = obtenerPrecioVigenteSinPromocion;

export default proveedorPrecioActual;
