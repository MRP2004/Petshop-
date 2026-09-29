import Producto from '../models/producto.model.js';
import AppError from '../errors/AppError.js';
import {
  prepararDetalles,
  calcularSubtotalCentavos,
  acumularSubtotalGeneral,
} from '../utils/ventaValidaciones.js';
import {
  estaFueraDeRangoImporte,
  MAXIMO_ENTERO_POSITIVO,
  MAXIMO_IMPORTE_CENTAVOS,
} from '../utils/validacion.js';
import proveedorPrecioActual from './precios/proveedorPrecioActual.js';
import { verificarTiendasActivas } from './disponibilidadTienda.js';

// El proveedor de precios (ver contrato en
// docs/cu04-checkout-pago.md, "Contrato de precios para José") es un punto
// de extensión: hoy lo implementa un módulo propio sin promociones, pero
// cuando José conecte las reglas reales, un proveedor con un error de
// cálculo no debe poder generar un subtotal negativo o corrupto que
// termine cobrado. Se valida la FORMA de lo que devuelve antes de usarlo
// para nada (revisión independiente, Codex) — responde 500 (problema de
// los datos que devolvió el proveedor, no de la solicitud del cliente),
// mismo criterio que validarImportePersistido.
const validarPrecioVigente = (precioVigente, nombreProducto) => {
  const { precioListaCentavos, montoDescuentoCentavos, precioFinalCentavos, porcentajeDescuento, idPromocionProducto } =
    precioVigente || {};

  const mensajeError = `El proveedor de precios devolvió un valor inválido para el producto ${nombreProducto}`;

  if (estaFueraDeRangoImporte(precioListaCentavos) || estaFueraDeRangoImporte(montoDescuentoCentavos)) {
    throw new AppError(mensajeError, 500);
  }

  if (montoDescuentoCentavos > precioListaCentavos) {
    throw new AppError(mensajeError, 500);
  }

  if (precioFinalCentavos !== precioListaCentavos - montoDescuentoCentavos) {
    throw new AppError(mensajeError, 500);
  }

  if (typeof porcentajeDescuento !== 'number' || !Number.isFinite(porcentajeDescuento) || porcentajeDescuento < 0) {
    throw new AppError(mensajeError, 500);
  }

  if (
    idPromocionProducto !== null &&
    (!Number.isInteger(idPromocionProducto) || idPromocionProducto < 1 || idPromocionProducto > MAXIMO_ENTERO_POSITIVO)
  ) {
    throw new AppError(mensajeError, 500);
  }

  // Consistencia entre los tres campos de descuento (revisión independiente,
  // Codex: la primera versión los validaba cada uno por separado, pero
  // permitía combinaciones sin sentido entre ellos): sin promoción, no hay
  // ningún descuento; con un porcentaje positivo, tiene que reflejarse en
  // algún monto (salvo que el precio de lista ya sea 0, caso borde donde
  // cualquier porcentaje de 0 sigue siendo 0).
  if (idPromocionProducto === null && (porcentajeDescuento !== 0 || montoDescuentoCentavos !== 0)) {
    throw new AppError(mensajeError, 500);
  }

  if (porcentajeDescuento > 0 && montoDescuentoCentavos === 0 && precioListaCentavos > 0) {
    throw new AppError(mensajeError, 500);
  }
};

// Resumen/cotización de una compra: consulta productos, stock y precio
// vigente de cada línea, y devuelve líneas + total ya calculados (CU-04,
// §4). La usan tanto el endpoint de cotización (sin transacción, solo
// lectura, para mostrarle el resumen al cliente) como compra.service.js
// (CON transacción y bloqueo, para releer los mismos datos de forma
// autoritativa justo antes de confirmar — nunca se confía en lo que el
// navegador mandó como aceptado, ver compra.service.js#compararConCotizacion).
//
// `proveedorPrecios` es el punto de conexión con José: por defecto usa el
// proveedor activo (ver precios/proveedorPrecioActual.js — único punto de
// configuración, compartido por cotización y confirmación); las pruebas de
// integración inyectan un proveedor controlado para poder probar el
// circuito completo (promoción vigente, promoción vencida, cambio de
// precio) sin depender de que las reglas reales ya existan.
const cotizar = async (detallesCrudos, opciones = {}) => {
  const { transaction, proveedorPrecios = proveedorPrecioActual } = opciones;

  const detallesPreparados = prepararDetalles(detallesCrudos);
  const opcionesLectura = transaction
    ? { transaction, lock: transaction.LOCK.UPDATE }
    : {};

  // Mismo instante para TODAS las líneas de esta cotización (revisión de
  // diseño, Codex — CU-04, ronda de correcciones): calculado una única vez,
  // no dentro del loop, para que un proveedor con reglas reales (José)
  // evalúe "vigente ahora" con un único criterio de "ahora" en toda la
  // operación, en vez de que la vigencia de una promoción pueda depender de
  // en qué orden se procesaron las líneas.
  const instanteEvaluacion = new Date();

  const lineas = [];
  let totalCentavos = 0;

  for (const detalle of detallesPreparados) {
    const producto = await Producto.findByPk(detalle.idProducto, opcionesLectura);

    if (!producto) {
      throw new AppError(`El producto ${detalle.idProducto} no existe`, 400);
    }

    if (producto.stockActual < detalle.cantidad) {
      throw new AppError(`Stock insuficiente para el producto ${producto.nombre}`, 409);
    }

    const precioVigente = await proveedorPrecios(producto, { transaction, instanteEvaluacion });
    validarPrecioVigente(precioVigente, producto.nombre);

    const subtotalCentavos = calcularSubtotalCentavos(
      precioVigente.precioFinalCentavos,
      detalle.cantidad,
      `El subtotal del producto ${producto.nombre} no puede calcularse de forma segura`,
      `El subtotal del producto ${producto.nombre} supera el máximo permitido`,
    );

    totalCentavos = acumularSubtotalGeneral(
      totalCentavos,
      subtotalCentavos,
      'El importe acumulado de la compra es demasiado grande para procesarse',
    );

    lineas.push({
      idProducto: producto.idProducto,
      nombre: producto.nombre,
      cantidad: detalle.cantidad,
      stockDisponible: producto.stockActual,
      precioListaCentavos: precioVigente.precioListaCentavos,
      idPromocionProducto: precioVigente.idPromocionProducto,
      porcentajeDescuento: precioVigente.porcentajeDescuento,
      montoDescuentoCentavos: precioVigente.montoDescuentoCentavos,
      precioFinalCentavos: precioVigente.precioFinalCentavos,
      subtotalCentavos,
      producto, // instancia ya leída (y bloqueada, si hay transacción): la reutiliza compra.service.js para no volver a consultarla.
    });
  }

  // Después de TODOS los productos (orden de bloqueos producto → tienda, ver
  // disponibilidadTienda.js): con transacción, esto es lo que impide
  // confirmar una compra de una tienda suspendida.
  const tiendasPorId = await verificarTiendasActivas(
    lineas.map((linea) => linea.producto),
    { transaction },
  );

  // El total se persiste en columnas DECIMAL(10,2) (venta.total, pago.monto):
  // cada subtotal de línea ya se valida contra ese máximo arriba
  // (calcularSubtotalCentavos), pero el ACUMULADO solo se garantizaba
  // representable como entero seguro, no acotado a ese rango — dos líneas
  // individualmente válidas pueden sumar un total que ya no entra en la
  // columna (reportado: dos líneas de $60.000.000 cada una, total
  // $120.000.000). Se rechaza acá, ANTES de persistir nada, tanto al cotizar
  // como al confirmar (ambos pasan por esta función).
  if (totalCentavos > MAXIMO_IMPORTE_CENTAVOS) {
    throw new AppError('El total de la compra supera el máximo permitido', 400);
  }

  return {
    lineas,
    totalCentavos,
    // Momento en que se calculó esta cotización: compra.service.js la usa
    // para vencer una cotización aceptada hace demasiado tiempo (ver
    // TTL_COTIZACION_MS), aunque los precios no hayan cambiado. Mismo
    // instante ya calculado arriba, no uno nuevo.
    emitidaEn: instanteEvaluacion.toISOString(),
    // Uso interno (avisos a vendedores): aRespuestaPublica no lo expone.
    tiendasPorId,
  };
};

// Versión pública de una línea/cotización, sin la instancia interna de
// Producto (que no debe serializarse tal cual en la respuesta HTTP).
const aRespuestaPublica = (cotizacion) => ({
  lineas: cotizacion.lineas.map(({ producto, ...linea }) => linea),
  totalCentavos: cotizacion.totalCentavos,
  emitidaEn: cotizacion.emitidaEn,
});

export {
  cotizar,
  aRespuestaPublica,
  // Exportada para poder probar esta validación en aislamiento (sin base de
  // datos), mismo criterio que compra.service.js.
  validarPrecioVigente,
};
