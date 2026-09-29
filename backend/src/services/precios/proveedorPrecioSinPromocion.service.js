import { validarImportePersistido } from '../../utils/ventaValidaciones.js';

// Contrato de "proveedor de precios" para CU-04 (ver
// docs/cu04-checkout-pago.md para la versión completa, con ejemplos, escrita
// para José): una función async que recibe un Producto (instancia de
// Sequelize ya leída de la base, con lock si corresponde) y devuelve el
// precio vigente de UNA unidad, en centavos enteros:
//
//   {
//     precioListaCentavos:    entero >= 0,
//     idPromocionProducto:    entero o null,
//     porcentajeDescuento:    número >= 0 (0 si no hay promoción),
//     montoDescuentoCentavos: entero >= 0 (0 si no hay promoción),
//     precioFinalCentavos:    precioListaCentavos - montoDescuentoCentavos,
//   }
//
// Esta es la implementación POR DEFECTO: nunca aplica ninguna promoción.
// Las reglas de superposición/acumulación de PromocionProducto todavía no
// las confirmó José (ver promocionProducto.model.js), así que no se
// inventan acá — cuando esas reglas existan, se completa este archivo (o se
// reemplaza en el único punto de configuración, ver
// precios/proveedorPrecioActual.js) sin tocar el resto del flujo de compra:
// el contrato de arriba es lo único de lo que depende compra.service.js.
//
// Segundo parámetro (CU-04, ronda de correcciones — revisión de diseño,
// Codex): { transaction, instanteEvaluacion }. `transaction` es la
// transacción activa de la operación (o undefined si es solo una
// cotización de lectura, sin transacción — ver cotizacion.service.js), para
// que una implementación real pueda leer/bloquear promociones de forma
// coherente con el resto de la operación. `instanteEvaluacion` es el mismo
// Date para TODAS las líneas de una misma cotización/confirmación (se
// calcula una única vez en cotizacion.service.js#cotizar), para que una
// promoción "vigente entre fechaInicio y fechaFin" se evalúe con un único
// criterio de "ahora" en toda la operación. Esta implementación no tiene
// promociones, así que ignora el segundo parámetro — pero debe aceptarlo
// para cumplir el contrato.
const obtenerPrecioVigente = async (producto, _contexto) => {
  const precioListaCentavos = validarImportePersistido(
    producto.precio,
    `El precio del producto ${producto.nombre} almacenado no es válido`,
  );

  return {
    precioListaCentavos,
    idPromocionProducto: null,
    porcentajeDescuento: 0,
    montoDescuentoCentavos: 0,
    precioFinalCentavos: precioListaCentavos,
  };
};

export default obtenerPrecioVigente;
