import obtenerPrecioVigenteConPromocion from './proveedorPrecioConPromocion.service.js';

// Cotización de checkout y venta manual comparten este proveedor para que
// apliquen exactamente el mismo precio promocional.
const proveedorPrecioActual = obtenerPrecioVigenteConPromocion;

export default proveedorPrecioActual;
