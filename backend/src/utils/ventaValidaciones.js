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
  limpiarCadenaOpcional,
} from './validacion.js';
import { esPersonalInterno, esCompradorRegistrado } from './roles.js';

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

// Únicos dos valores reconocidos (coinciden con las opciones fijas que
// ofrecen tanto el checkout del cliente como la carga manual del personal):
// no es una lista abierta, para poder exigir domicilio de forma confiable
// cuando corresponde entrega a domicilio. Compartido por venta.service.js
// (carga manual) y compra.service.js (checkout con pago simulado) para no
// duplicar esta regla en dos lugares.
const METODOS_ENTREGA_VALIDOS = ['retiro en sucursal', 'envío a domicilio'];
const LONGITUD_MINIMA_DIRECCION = 8;
const LONGITUD_MAXIMA_DIRECCION = 200;

// Envío a domicilio no puede confirmarse sin domicilio: si falta o es
// demasiado corto para ser una dirección real, se rechaza la venta entera
// (no se registra "a medias" con la entrega sin poder completarse). Para
// "retiro en sucursal" (o sin método indicado) se ignora cualquier
// dirección que igual se mande: no aplica, y no tiene sentido persistirla.
const prepararEntrega = (datos) => {
  const metodoEntregaCrudo =
    typeof datos.metodoEntrega === 'string' ? datos.metodoEntrega.trim() : '';

  if (!metodoEntregaCrudo) {
    return { metodoEntrega: null, direccionEntrega: null };
  }

  if (!METODOS_ENTREGA_VALIDOS.includes(metodoEntregaCrudo)) {
    throw new AppError(
      `El método de entrega debe ser uno de: ${METODOS_ENTREGA_VALIDOS.join(', ')}`,
      400,
    );
  }

  if (metodoEntregaCrudo !== 'envío a domicilio') {
    return { metodoEntrega: metodoEntregaCrudo, direccionEntrega: null };
  }

  const direccionEntrega = limpiarCadenaOpcional(datos.direccionEntrega, 'La dirección de entrega');

  if (!direccionEntrega || direccionEntrega.length < LONGITUD_MINIMA_DIRECCION) {
    throw new AppError(
      `La dirección de entrega es obligatoria para envío a domicilio (mínimo ${LONGITUD_MINIMA_DIRECCION} caracteres)`,
      400,
    );
  }

  if (direccionEntrega.length > LONGITUD_MAXIMA_DIRECCION) {
    throw new AppError(
      `La dirección de entrega no puede superar los ${LONGITUD_MAXIMA_DIRECCION} caracteres`,
      400,
    );
  }

  return { metodoEntrega: metodoEntregaCrudo, direccionEntrega };
};

// Una venta le pertenece a un cliente autenticado si coincide el idCliente;
// el personal (vendedor/administrador) puede operar sobre cualquiera. La usan
// venta.service.js (listar/ver/cancelar) y compra.service.js/comprobante
// (ver, descargar PDF, reenviar correo), así la regla de "solo mis compras"
// vive en un único lugar.
// Ronda 2, Etapa 8: un vendedor independiente TAMBIÉN puede ver su propia
// compra como comprador (conserva idCliente) — mismo chequeo que
// 'cliente', nunca el de personal interno. No cubre el otro caso nuevo de
// esta etapa ("un vendedor independiente viendo una venta ajena porque
// contiene un producto de su tienda"): ese es un acceso deliberadamente
// MÁS RESTRINGIDO (solo sus propias líneas, nunca la venta completa), con
// su propia función separada — ver tienda.service.js#obtenerVentaDeTiendaPorId.
const esPropiaOPersonal = (usuario, idClienteVenta) => {
  if (esPersonalInterno(usuario?.rol)) {
    return true;
  }

  return esCompradorRegistrado(usuario?.rol) && usuario.idCliente === idClienteVenta;
};

export {
  validarEnteroPositivo,
  calcularSubtotalCentavos,
  acumularSubtotalGeneral,
  calcularTotalCentavos,
  prepararDetalles,
  prepararEntrega,
  esPropiaOPersonal,
};
