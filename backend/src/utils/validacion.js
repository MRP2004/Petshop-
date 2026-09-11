import AppError from '../errors/AppError.js';

// Primitivas de validación genéricas, sin reglas de negocio de ninguna
// entidad en particular. Las usan tanto ventaValidaciones.js (IDs, cantidades
// e importes de venta) como los servicios de productos y del resto de los
// CRUD (IDs, importes de precio, forma del cuerpo recibido).

// Máximo representable por una columna INTEGER firmada de MySQL.
const MAXIMO_ENTERO_POSITIVO = 2147483647;

// Máximo representable por una columna DECIMAL(10,2), en pesos y en centavos.
// Se guardan ambos como literales (en vez de derivar uno del otro por división)
// para no depender de que 9999999999 / 100 sea exactamente 99999999.99 en coma
// flotante.
const MAXIMO_IMPORTE_PESOS = 99999999.99;
const MAXIMO_IMPORTE_CENTAVOS = 9999999999;

// Números y cadenas numéricas decimales simples (con signo opcional). No admite
// notación hexadecimal ni científica, para no aceptar formas ambiguas de un valor.
const PATRON_NUMERO_DECIMAL = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;

// Acepta number finitos y cadenas numéricas decimales (recortando espacios).
// Rechaza booleanos, objetos, arreglos, null, undefined y cadenas vacías o de solo espacios.
const analizarNumero = (valor) => {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : null;
  }

  if (typeof valor !== 'string') {
    return null;
  }

  const texto = valor.trim();

  if (!PATRON_NUMERO_DECIMAL.test(texto)) {
    return null;
  }

  const numero = Number(texto);

  return Number.isFinite(numero) ? numero : null;
};

const esObjetoPlano = (valor) =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

// Entero dentro de un rango arbitrario [minimo, maximo]. Es la base tanto de
// "ID/cantidad positiva" (minimo=1) como de otros rangos (p. ej. un
// movimiento de stock, que admite valores negativos para ajustes).
const validarEnteroEnRango = (valor, minimo, maximo, mensajeError) => {
  const numero = analizarNumero(valor);

  if (
    numero === null ||
    !Number.isInteger(numero) ||
    numero < minimo ||
    numero > maximo
  ) {
    throw new AppError(mensajeError, 400);
  }

  return numero;
};

// Variante opcional de validarEnteroEnRango: undefined, null y cadena vacía
// se conservan como ausencia; cualquier otro valor inválido se rechaza.
const prepararEnteroOpcional = (valor, minimo, maximo, mensajeError) => {
  if (valor === undefined || valor === null || valor === '') {
    return null;
  }

  return validarEnteroEnRango(valor, minimo, maximo, mensajeError);
};

// Política única para campos de texto opcionales (teléfono, email,
// dirección, descripción, etc.): undefined, null y cadena vacía son
// ausencia permitida (se guarda null). Cualquier otro valor que NO sea una
// cadena (booleano, número, objeto, arreglo) es un tipo inválido enviado, y
// se rechaza en vez de tratarse silenciosamente como ausencia. Antes de
// esta política, distintas copias de esta misma lógica en los servicios de
// CRUD convertían "true", "123" u objetos directamente en null.
const limpiarCadenaOpcional = (valor, nombreCampo) => {
  if (valor === undefined || valor === null || valor === '') {
    return null;
  }

  if (typeof valor !== 'string') {
    throw new AppError(`${nombreCampo} no es válido`, 400);
  }

  const valorLimpio = valor.trim();

  return valorLimpio || null;
};

// Redondeo único a centavos: toda la aritmética posterior se hace en enteros.
const pesosACentavos = (pesos) => Math.round(pesos * 100);

const estaFueraDeRangoImporte = (centavos) =>
  !Number.isSafeInteger(centavos) ||
  centavos < 0 ||
  centavos > MAXIMO_IMPORTE_CENTAVOS;

// Importe opcional provisto por el cliente. undefined, null y cadena vacía
// se conservan como ausencia; cualquier otro valor no numérico, negativo o
// fuera de rango se rechaza explícitamente.
const prepararImporteOpcional = (valor, nombreCampo) => {
  if (valor === undefined || valor === null || valor === '') {
    return null;
  }

  const numero = analizarNumero(valor);

  if (numero === null || numero < 0) {
    throw new AppError(`${nombreCampo} no es válido`, 400);
  }

  // Se comprueba el máximo también sobre el valor original, antes de
  // redondear: 99999999.994 supera el máximo aunque redondee exactamente
  // al límite en centavos, así que el chequeo posterior por sí solo no alcanza.
  if (numero > MAXIMO_IMPORTE_PESOS) {
    throw new AppError(`${nombreCampo} supera el máximo permitido`, 400);
  }

  const centavos = pesosACentavos(numero);

  if (estaFueraDeRangoImporte(centavos)) {
    throw new AppError(`${nombreCampo} supera el máximo permitido`, 400);
  }

  return centavos;
};

// Importe obligatorio provisto por el cliente (p. ej. el precio de un
// producto): a diferencia de prepararImporteOpcional, la ausencia también
// se rechaza.
const prepararImporteObligatorio = (valor, nombreCampo) => {
  if (valor === undefined || valor === null || valor === '') {
    throw new AppError(`${nombreCampo} no es válido`, 400);
  }

  return prepararImporteOpcional(valor, nombreCampo);
};

// Importe que en teoría ya fue validado por otro endpoint (p. ej. el precio de
// un producto leído dentro de una venta), pero el que lo usa no puede depender
// exclusivamente de esa validación ajena: se vuelve a comprobar lo que
// efectivamente se leyó de la base. Por eso responde 500 (problema de datos
// persistidos), no 400 (problema de la solicitud del cliente).
const validarImportePersistido = (valorCrudo, mensajeError) => {
  const numero = analizarNumero(valorCrudo);

  if (numero === null || numero < 0) {
    throw new AppError(mensajeError, 500);
  }

  // Mismo chequeo previo al redondeo que en prepararImporteOpcional: un
  // valor corrupto como 99999999.994 no debe aceptarse solo porque redondea
  // exactamente al límite de la columna.
  if (numero > MAXIMO_IMPORTE_PESOS) {
    throw new AppError(mensajeError, 500);
  }

  const centavos = pesosACentavos(numero);

  if (estaFueraDeRangoImporte(centavos)) {
    throw new AppError(mensajeError, 500);
  }

  return centavos;
};

// Multiplica dos enteros (p. ej. precio × cantidad, en centavos/unidades)
// verificando que el resultado sea representable sin pérdida de precisión:
// que cada factor esté acotado por separado no alcanza, porque el producto
// igual puede desbordar.
const multiplicarCentavosSeguro = (centavos, cantidad) => {
  const resultado = centavos * cantidad;

  if (!Number.isSafeInteger(resultado)) {
    return null;
  }

  if (cantidad !== 0 && resultado / cantidad !== centavos) {
    return null;
  }

  return resultado;
};

// Suma acumulada verificando que se mantenga dentro de Number.isSafeInteger.
const sumarCentavosSeguro = (a, b) => {
  const resultado = a + b;

  return Number.isSafeInteger(resultado) ? resultado : null;
};

export {
  MAXIMO_ENTERO_POSITIVO,
  MAXIMO_IMPORTE_PESOS,
  MAXIMO_IMPORTE_CENTAVOS,
  analizarNumero,
  esObjetoPlano,
  validarEnteroEnRango,
  prepararEnteroOpcional,
  limpiarCadenaOpcional,
  pesosACentavos,
  estaFueraDeRangoImporte,
  prepararImporteOpcional,
  prepararImporteObligatorio,
  validarImportePersistido,
  multiplicarCentavosSeguro,
  sumarCentavosSeguro,
};
