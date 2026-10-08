// Proveedor controlado exclusivo de las pruebas de integración de CU-04.
// Permite simular precios con y sin promoción de forma determinista para
// probar el checkout independientemente de las reglas de producción.
import { validarImportePersistido } from '../src/utils/ventaValidaciones.js';

// promocionesPorProducto: Map<idProducto, { idPromocionProducto, porcentajeDescuento }>
//
// `registroLlamadas`, si se pasa, acumula { idProducto, transaction,
// instanteEvaluacion } de cada invocación (CU-04, §6, ronda de
// correcciones — revisión de diseño, Codex: "verifiquen que el proveedor
// recibe el contexto correcto"): permite comprobar, desde el test, que
// cotizacion.service.js efectivamente propaga la transacción activa y que
// usa el MISMO instanteEvaluacion para todas las líneas de una misma
// cotización/confirmación.
const crearProveedorPrecioDePrueba = (promocionesPorProducto, registroLlamadas) => async (producto, contexto = {}) => {
  registroLlamadas?.push({
    idProducto: producto.idProducto,
    transaction: contexto.transaction,
    instanteEvaluacion: contexto.instanteEvaluacion,
  });

  const precioListaCentavos = validarImportePersistido(
    producto.precio,
    `El precio del producto ${producto.nombre} almacenado no es válido`,
  );

  const promocion = promocionesPorProducto.get(producto.idProducto);

  if (!promocion) {
    return {
      precioListaCentavos,
      idPromocionProducto: null,
      porcentajeDescuento: 0,
      montoDescuentoCentavos: 0,
      precioFinalCentavos: precioListaCentavos,
    };
  }

  const montoDescuentoCentavos = Math.round(
    (precioListaCentavos * promocion.porcentajeDescuento) / 100,
  );

  return {
    precioListaCentavos,
    idPromocionProducto: promocion.idPromocionProducto,
    porcentajeDescuento: promocion.porcentajeDescuento,
    montoDescuentoCentavos,
    precioFinalCentavos: precioListaCentavos - montoDescuentoCentavos,
  };
};

export default crearProveedorPrecioDePrueba;
