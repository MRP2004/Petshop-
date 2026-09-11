import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAXIMO_ENTERO_POSITIVO,
  MAXIMO_IMPORTE_PESOS,
  MAXIMO_IMPORTE_CENTAVOS,
  esObjetoPlano,
  validarEnteroPositivo,
  prepararImporteOpcional,
  validarImportePersistido,
  multiplicarCentavosSeguro,
  sumarCentavosSeguro,
  calcularSubtotalCentavos,
  acumularSubtotalGeneral,
  calcularTotalCentavos,
  prepararDetalles,
} from '../src/utils/ventaValidaciones.js';

test('las constantes de límites coinciden con las columnas reales', () => {
  assert.equal(MAXIMO_ENTERO_POSITIVO, 2147483647);
  assert.equal(MAXIMO_IMPORTE_PESOS, 99999999.99);
  assert.equal(MAXIMO_IMPORTE_CENTAVOS, 9999999999);
  // Consistencia entre ambas constantes de dinero (se definen por separado
  // a propósito, pero deben representar el mismo límite).
  assert.equal(Math.round(MAXIMO_IMPORTE_PESOS * 100), MAXIMO_IMPORTE_CENTAVOS);
});

// --- esObjetoPlano ---

test('esObjetoPlano acepta objetos simples y rechaza null, arreglos y primitivos', () => {
  assert.equal(esObjetoPlano({}), true);
  assert.equal(esObjetoPlano({ idProducto: 1 }), true);
  assert.equal(esObjetoPlano(null), false);
  assert.equal(esObjetoPlano([]), false);
  assert.equal(esObjetoPlano('texto'), false);
  assert.equal(esObjetoPlano(5), false);
  assert.equal(esObjetoPlano(undefined), false);
});

// --- validarEnteroPositivo: IDs y cantidades ---

test('validarEnteroPositivo acepta enteros positivos dentro del límite de INTEGER', () => {
  assert.equal(validarEnteroPositivo(1, 'x'), 1);
  assert.equal(
    validarEnteroPositivo(MAXIMO_ENTERO_POSITIVO, 'x'),
    MAXIMO_ENTERO_POSITIVO,
  );
  assert.equal(validarEnteroPositivo('42', 'x'), 42);
  assert.equal(validarEnteroPositivo('  42  ', 'x'), 42);
});

test('validarEnteroPositivo rechaza valores fuera del límite de INTEGER firmado', () => {
  assert.throws(() =>
    validarEnteroPositivo(MAXIMO_ENTERO_POSITIVO + 1, 'x'),
  );
  assert.throws(() => validarEnteroPositivo(0, 'x'));
  assert.throws(() => validarEnteroPositivo(-1, 'x'));
  assert.throws(() => validarEnteroPositivo(1.5, 'x'));
});

test('validarEnteroPositivo rechaza booleanos, objetos, arreglos, null y undefined', () => {
  assert.throws(() => validarEnteroPositivo(true, 'x'));
  assert.throws(() => validarEnteroPositivo(false, 'x'));
  assert.throws(() => validarEnteroPositivo({}, 'x'));
  assert.throws(() => validarEnteroPositivo([5], 'x'));
  assert.throws(() => validarEnteroPositivo(null, 'x'));
  assert.throws(() => validarEnteroPositivo(undefined, 'x'));
});

test('validarEnteroPositivo rechaza cadenas de solo espacios y notación hexadecimal o científica', () => {
  assert.throws(() => validarEnteroPositivo('   ', 'x'));
  assert.throws(() => validarEnteroPositivo('', 'x'));
  assert.throws(() => validarEnteroPositivo('0x10', 'x'));
  assert.throws(() => validarEnteroPositivo('1e2', 'x'));
});

test('validarEnteroPositivo propaga el mensaje recibido como AppError 400', () => {
  assert.throws(
    () => validarEnteroPositivo(-1, 'La cantidad debe ser un número entero mayor que cero'),
    (error) =>
      error.message ===
        'La cantidad debe ser un número entero mayor que cero' &&
      error.statusCode === 400,
  );
});

// --- prepararImporteOpcional ---

test('prepararImporteOpcional trata undefined, null y cadena vacía como ausencia', () => {
  assert.equal(prepararImporteOpcional(undefined, 'El descuento'), null);
  assert.equal(prepararImporteOpcional(null, 'El descuento'), null);
  assert.equal(prepararImporteOpcional('', 'El descuento'), null);
});

test('prepararImporteOpcional rechaza cadenas de solo espacios en vez de tratarlas como ausencia', () => {
  assert.throws(() => prepararImporteOpcional('   ', 'El descuento'));
});

test('prepararImporteOpcional redondea a centavos una sola vez y valida el rango de DECIMAL(10,2)', () => {
  assert.equal(prepararImporteOpcional(10.5, 'El descuento'), 1050);
  assert.equal(prepararImporteOpcional('10.50', 'El descuento'), 1050);
  assert.equal(
    prepararImporteOpcional(99999999.99, 'El descuento'),
    MAXIMO_IMPORTE_CENTAVOS,
  );
});

test('prepararImporteOpcional rechaza negativos, no finitos y valores fuera de rango', () => {
  assert.throws(() => prepararImporteOpcional(-1, 'El descuento'));
  assert.throws(() => prepararImporteOpcional(Infinity, 'El descuento'));
  assert.throws(() => prepararImporteOpcional(NaN, 'El descuento'));
  // 100000000.00 > 99999999.99 (máximo de DECIMAL(10,2))
  assert.throws(() => prepararImporteOpcional(100000000, 'El descuento'));
});

test('prepararImporteOpcional rechaza booleanos, objetos y arreglos', () => {
  assert.throws(() => prepararImporteOpcional(true, 'El descuento'));
  assert.throws(() => prepararImporteOpcional({}, 'El descuento'));
  assert.throws(() => prepararImporteOpcional([10], 'El descuento'));
});

test('prepararImporteOpcional acepta el máximo exacto y rechaza un valor que redondearía justo a ese máximo', () => {
  // 99999999.99 es el máximo real de DECIMAL(10,2): se acepta tal cual.
  assert.equal(
    prepararImporteOpcional(99999999.99, 'El descuento'),
    MAXIMO_IMPORTE_CENTAVOS,
  );
  assert.equal(
    prepararImporteOpcional('99999999.99', 'El descuento'),
    MAXIMO_IMPORTE_CENTAVOS,
  );

  // 99999999.994 supera 99999999.99: el chequeo sobre el valor original
  // (antes de redondear) debe rechazarlo, aunque Math.round(...) lo hubiera
  // llevado exactamente al límite en centavos (9999999999) y lo hubiera
  // dejado pasar si solo se comprobara el rango después de redondear.
  assert.throws(
    () => prepararImporteOpcional(99999999.994, 'El descuento'),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El descuento supera el máximo permitido',
  );
  assert.throws(
    () => prepararImporteOpcional('99999999.994', 'El descuento'),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El descuento supera el máximo permitido',
  );
});

// --- validarImportePersistido (precio leído de la base) ---

test('validarImportePersistido acepta el precio leído de la base como cadena decimal', () => {
  assert.equal(validarImportePersistido('150.00', 'x'), 15000);
});

test('validarImportePersistido rechaza un precio corrupto en la base con AppError 500', () => {
  assert.throws(
    () => validarImportePersistido('no-numero', 'x'),
    (error) => error.statusCode === 500,
  );
  assert.throws(
    () => validarImportePersistido('-10.00', 'x'),
    (error) => error.statusCode === 500,
  );
  assert.throws(
    () => validarImportePersistido('999999999999.99', 'x'),
    (error) => error.statusCode === 500,
  );
});

test('validarImportePersistido acepta el máximo exacto y rechaza un precio que redondearía justo a ese máximo', () => {
  assert.equal(
    validarImportePersistido(99999999.99, 'x'),
    MAXIMO_IMPORTE_CENTAVOS,
  );
  assert.equal(
    validarImportePersistido('99999999.99', 'x'),
    MAXIMO_IMPORTE_CENTAVOS,
  );

  // Mismo caso límite que en prepararImporteOpcional, pero para un precio
  // leído de la base: se rechaza con 500, no con 400.
  assert.throws(
    () => validarImportePersistido(99999999.994, 'x'),
    (error) => error.statusCode === 500,
  );
  assert.throws(
    () => validarImportePersistido('99999999.994', 'x'),
    (error) => error.statusCode === 500,
  );
});

// --- multiplicarCentavosSeguro / sumarCentavosSeguro ---

test('multiplicarCentavosSeguro calcula subtotales normales', () => {
  assert.equal(multiplicarCentavosSeguro(1050, 3), 3150);
});

test('multiplicarCentavosSeguro detecta cuando el resultado no es representable de forma segura', () => {
  assert.equal(
    multiplicarCentavosSeguro(MAXIMO_IMPORTE_CENTAVOS, MAXIMO_ENTERO_POSITIVO),
    null,
  );
});

test('sumarCentavosSeguro acumula normalmente y detecta desbordes de entero seguro', () => {
  assert.equal(sumarCentavosSeguro(100, 200), 300);
  assert.equal(sumarCentavosSeguro(Number.MAX_SAFE_INTEGER, 1), null);
});

// --- calcularSubtotalCentavos / acumularSubtotalGeneral / calcularTotalCentavos:
// las mismas funciones que usa registrarVenta. Si el servicio dejara de
// llamarlas, o alguien invirtiera una comparación, estos tests lo detectan
// porque ejercitan la lógica de producción, no una copia dentro del test. ---

test('calcularSubtotalCentavos rechaza un subtotal individual fuera de rango aunque el descuento y el total final serían válidos', () => {
  const precioCentavos = 9999999999; // = MAXIMO_IMPORTE_CENTAVOS
  const cantidad = 2;
  const descuentoCentavos = 9999999999;

  // El escenario es real: si el subtotal fuera válido, este descuento no
  // superaría el subtotal y el total resultante entraría en el límite.
  const subtotalSinValidar = precioCentavos * cantidad; // 19999999998
  assert.ok(descuentoCentavos <= subtotalSinValidar);
  assert.ok(subtotalSinValidar - descuentoCentavos <= MAXIMO_IMPORTE_CENTAVOS);

  // Pero calcularSubtotalCentavos debe rechazarlo igual, porque el subtotal
  // de esta única línea (19999999998) excede el máximo de su propia columna.
  assert.throws(
    () =>
      calcularSubtotalCentavos(
        precioCentavos,
        cantidad,
        'no representable',
        'el subtotal excede el máximo',
      ),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'el subtotal excede el máximo',
  );
});

test('acumularSubtotalGeneral y calcularTotalCentavos aceptan dos subtotales válidos con descuento', () => {
  let acumulado = 0;
  acumulado = acumularSubtotalGeneral(acumulado, 6000000000, 'acumulado inválido');
  acumulado = acumularSubtotalGeneral(acumulado, 6000000000, 'acumulado inválido');

  // El acumulado intermedio (12000000000) ya supera MAXIMO_IMPORTE_CENTAVOS,
  // y sin embargo no se rechaza acá: no se persiste, así que no se le aplica
  // el máximo de columna.
  assert.equal(acumulado, 12000000000);

  const total = calcularTotalCentavos(
    acumulado,
    3000000000,
    'descuento inválido',
    'total inválido',
  );

  assert.equal(total, 9000000000);
});

test('calcularTotalCentavos acepta el total exacto en el límite y rechaza uno más', () => {
  assert.equal(
    calcularTotalCentavos(MAXIMO_IMPORTE_CENTAVOS, 0, 'x', 'total inválido'),
    MAXIMO_IMPORTE_CENTAVOS,
  );

  assert.throws(
    () =>
      calcularTotalCentavos(
        MAXIMO_IMPORTE_CENTAVOS + 1,
        0,
        'x',
        'total inválido',
      ),
    (error) => error.statusCode === 400 && error.message === 'total inválido',
  );
});

test('calcularTotalCentavos rechaza un descuento superior al subtotal general', () => {
  assert.throws(
    () => calcularTotalCentavos(1000, 1001, 'descuento inválido', 'y'),
    (error) =>
      error.statusCode === 400 && error.message === 'descuento inválido',
  );
});

// --- Escenario explícito pedido en la revisión: con un importe de más de dos
// decimales, el valor normalizado que participa en el cálculo debe coincidir
// exactamente con el que se prepara para persistir (10.5 y 10.50 no alcanzan
// porque ya tienen a lo sumo dos decimales y no fuerzan ningún redondeo). ---

test('un descuento con más de dos decimales se normaliza una sola vez: el valor del cálculo coincide con el persistido', () => {
  const descuentoCentavos = prepararImporteOpcional('19.999', 'El descuento');

  // 19.999 -> 1999.9 centavos -> redondea a 2000.
  assert.equal(descuentoCentavos, 2000);

  // El mismo entero en centavos es el que usa el cálculo del total...
  const total = calcularTotalCentavos(
    50000,
    descuentoCentavos,
    'x',
    'y',
  );
  assert.equal(total, 50000 - descuentoCentavos);

  // ...y el que se convertiría a texto para persistir en la columna.
  const descuentoPersistido = (descuentoCentavos / 100).toFixed(2);
  assert.equal(descuentoPersistido, '20.00');

  // Reconstruir los centavos desde el valor persistido debe dar exactamente
  // el mismo entero que participó en el cálculo: no hay una segunda fuente
  // (como volver a redondear el valor original por separado) que pueda
  // divergir, a diferencia de lo que ocurría antes con descuento.toFixed(2)
  // aplicado sobre el valor sin redondear a centavos.
  const centavosReconstruidos = Math.round(
    Number(descuentoPersistido) * 100,
  );
  assert.equal(centavosReconstruidos, descuentoCentavos);
});

// --- prepararDetalles ---

test('prepararDetalles rechaza formas de cuerpo inválidas', () => {
  assert.throws(() => prepararDetalles([]));
  assert.throws(() => prepararDetalles(null));
  assert.throws(() => prepararDetalles(undefined));
  assert.throws(() => prepararDetalles('no-es-arreglo'));
  assert.throws(() => prepararDetalles([null]));
  assert.throws(() =>
    prepararDetalles([{ idProducto: 1, cantidad: 1 }, 'no-es-objeto']),
  );
  assert.throws(() => prepararDetalles([[1, 2]]));
});

test('prepararDetalles rechaza productos duplicados', () => {
  assert.throws(() =>
    prepararDetalles([
      { idProducto: 1, cantidad: 1 },
      { idProducto: 1, cantidad: 2 },
    ]),
  );
});

test('prepararDetalles rechaza cantidad cero, negativa, no entera o booleana', () => {
  assert.throws(() => prepararDetalles([{ idProducto: 1, cantidad: 0 }]));
  assert.throws(() => prepararDetalles([{ idProducto: 1, cantidad: -1 }]));
  assert.throws(() => prepararDetalles([{ idProducto: 1, cantidad: 1.5 }]));
  assert.throws(() => prepararDetalles([{ idProducto: 1, cantidad: true }]));
});

test('prepararDetalles ordena los detalles por idProducto ascendente', () => {
  const resultado = prepararDetalles([
    { idProducto: 5, cantidad: 1 },
    { idProducto: 2, cantidad: 1 },
    { idProducto: 8, cantidad: 1 },
  ]);

  assert.deepEqual(
    resultado.map((detalle) => detalle.idProducto),
    [2, 5, 8],
  );
});
