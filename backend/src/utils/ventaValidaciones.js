import AppError from '../errors/AppError.js';
import {
  MAXIMO_ENTERO_POSITIVO,
  MAXIMO_IMPORTE_PESOS,
  MAXIMO_IMPORTE_CENTAVOS,
  analizarNumero,
  esObjetoPlano,
  validarEnteroEnRango,
  pesosACentavos,
  estaFueraDeRangoImporte,
  prepararImporteOpcional,
  validarImportePersistido,
  multiplicarCentavosSeguro,
  sumarCentavosSeguro,
} from './validacion.js';

// Este módulo contiene la lógica de validación y cálculo propia del dominio
// de ventas (detalles, subtotales, total). Las primitivas genéricas (números,
// forma de objeto, importes, enteros en rango) viven en validacion.js y se
// reexportan acá para no romper el contrato ya probado de este módulo.
export {
  MAXIMO_ENTERO_POSITIVO,
  MAXIMO_IMPORTE_PESOS,
  MAXIMO_IMPORTE_CENTAVOS,
  analizarNumero,
  esObjetoPlano,
  pesosACentavos,
  estaFueraDeRangoImporte,
  prepararImporteOpcional,
  validarImportePersistido,
  multiplicarCentavosSeguro,
  sumarCentavosSeguro,
};

// Válido tanto para IDs como para cantidades: entero positivo seguro y
// compatible con el rango de una columna INTEGER firmada de MySQL.
const validarEnteroPositivo = (valor, mensajeError) =>
  validarEnteroEnRango(valor, 1, MAXIMO_ENTERO_POSITIVO, mensajeError);

// Subtotal de una línea de venta (precio × cantidad, en centavos). Se valida
// contra el máximo de DECIMAL(10,2) de forma independiente del descuento o
// del total final: el subtotal se persiste en su propia columna de
// DetalleVenta, así que debe ser válido por sí mismo.
const calcularSubtotalCentavos = (
  precioCentavos,
  cantidad,
  mensajeErrorNoRepresentable,
  mensajeErrorFueraDeRango,
) => {
  const subtotalCentavos = multiplicarCentavosSeguro(
    precioCentavos,
    cantidad,
  );

  if (subtotalCentavos === null) {
    throw new AppError(mensajeErrorNoRepresentable, 400);
  }

  if (subtotalCentavos > MAXIMO_IMPORTE_CENTAVOS) {
    throw new AppError(mensajeErrorFueraDeRango, 400);
  }

  return subtotalCentavos;
};

// Acumula un subtotal al total general de la venta. Ese acumulado intermedio
// no se persiste en ninguna columna, así que solo se exige que siga siendo
// un entero seguro: puede superar el máximo de DECIMAL(10,2) sin ser
// inválido, siempre que cada detalle y el total final (tras el descuento) sí
// lo respeten.
const acumularSubtotalGeneral = (
  subtotalGeneralCentavos,
  subtotalCentavos,
  mensajeError,
) => {
  const nuevoSubtotalGeneral = sumarCentavosSeguro(
    subtotalGeneralCentavos,
    subtotalCentavos,
  );

  if (nuevoSubtotalGeneral === null) {
    throw new AppError(mensajeError, 400);
  }

  return nuevoSubtotalGeneral;
};

// Total final de la venta (subtotal general - descuento). El descuento no
// puede superar el subtotal (garantiza total no negativo) y el total sí se
// persiste, así que se valida contra el máximo de DECIMAL(10,2).
const calcularTotalCentavos = (
  subtotalGeneralCentavos,
  descuentoCentavos,
  mensajeErrorDescuento,
  mensajeErrorMaximo,
) => {
  if (descuentoCentavos > subtotalGeneralCentavos) {
    throw new AppError(mensajeErrorDescuento, 400);
  }

  const totalCentavos = subtotalGeneralCentavos - descuentoCentavos;

  if (totalCentavos > MAXIMO_IMPORTE_CENTAVOS) {
    throw new AppError(mensajeErrorMaximo, 400);
  }

  return totalCentavos;
};

// Valida la forma general de los detalles de una venta y normaliza id/cantidad.
// No accede a la base: la existencia del producto y su precio se validan en el
// servicio, que sí tiene la conexión a la base de datos.
const prepararDetalles = (detalles) => {
  if (!Array.isArray(detalles) || detalles.length === 0) {
    throw new AppError(
      'La venta debe contener al menos un producto',
      400,
    );
  }

  const idsUtilizados = new Set();

  const detallesPreparados = detalles.map((detalle) => {
    if (!esObjetoPlano(detalle)) {
      throw new AppError(
        'Cada detalle de la venta debe ser un objeto válido',
        400,
      );
    }

    const idProducto = validarEnteroPositivo(
      detalle.idProducto,
      'El ID del producto no es válido',
    );

    const cantidad = validarEnteroPositivo(
      detalle.cantidad,
      'La cantidad debe ser un número entero mayor que cero',
    );

    if (idsUtilizados.has(idProducto)) {
      throw new AppError(
        'Un producto no puede repetirse en la misma venta',
        400,
      );
    }

    idsUtilizados.add(idProducto);

    return { idProducto, cantidad };
  });

  return detallesPreparados.sort(
    (a, b) => a.idProducto - b.idProducto,
  );
};

export {
  validarEnteroPositivo,
  calcularSubtotalCentavos,
  acumularSubtotalGeneral,
  calcularTotalCentavos,
  prepararDetalles,
};
