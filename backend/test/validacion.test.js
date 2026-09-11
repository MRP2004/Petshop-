import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAXIMO_ENTERO_POSITIVO,
  MAXIMO_IMPORTE_PESOS,
  MAXIMO_IMPORTE_CENTAVOS,
  validarEnteroEnRango,
  prepararEnteroOpcional,
  prepararImporteObligatorio,
  limpiarCadenaOpcional,
} from '../src/utils/validacion.js';

// analizarNumero, esObjetoPlano, prepararImporteOpcional, validarImportePersistido,
// multiplicarCentavosSeguro y sumarCentavosSeguro ya se ejercitan a fondo en
// ventaValidaciones.test.js, que los reexporta desde este mismo módulo. Acá
// solo se agregan las funciones nuevas que no tenían cobertura todavía:
// validarEnteroEnRango con rango negativo (movimientos de stock),
// prepararEnteroOpcional y prepararImporteObligatorio.

test('validarEnteroEnRango admite un mínimo negativo, para deltas de stock', () => {
  assert.equal(validarEnteroEnRango(-5, -10, 10, 'x'), -5);
  assert.equal(validarEnteroEnRango(0, -10, 10, 'x'), 0);
  assert.equal(validarEnteroEnRango(10, -10, 10, 'x'), 10);
});

test('validarEnteroEnRango rechaza valores fuera del rango pedido, incluso si son enteros válidos en general', () => {
  assert.throws(() => validarEnteroEnRango(-11, -10, 10, 'x'));
  assert.throws(() => validarEnteroEnRango(11, -10, 10, 'x'));
});

test('validarEnteroEnRango rechaza booleanos, objetos, arreglos y no enteros', () => {
  assert.throws(() => validarEnteroEnRango(true, -10, 10, 'x'));
  assert.throws(() => validarEnteroEnRango({}, -10, 10, 'x'));
  assert.throws(() => validarEnteroEnRango([1], -10, 10, 'x'));
  assert.throws(() => validarEnteroEnRango(1.5, -10, 10, 'x'));
});

test('prepararEnteroOpcional trata undefined, null y cadena vacía como ausencia', () => {
  assert.equal(prepararEnteroOpcional(undefined, 1, MAXIMO_ENTERO_POSITIVO, 'x'), null);
  assert.equal(prepararEnteroOpcional(null, 1, MAXIMO_ENTERO_POSITIVO, 'x'), null);
  assert.equal(prepararEnteroOpcional('', 1, MAXIMO_ENTERO_POSITIVO, 'x'), null);
});

test('prepararEnteroOpcional valida y rechaza igual que validarEnteroEnRango cuando el valor está presente', () => {
  assert.equal(prepararEnteroOpcional(5, 1, MAXIMO_ENTERO_POSITIVO, 'x'), 5);
  assert.throws(() => prepararEnteroOpcional(0, 1, MAXIMO_ENTERO_POSITIVO, 'x'));
  assert.throws(() => prepararEnteroOpcional(true, 1, MAXIMO_ENTERO_POSITIVO, 'x'));
});

test('prepararImporteObligatorio rechaza la ausencia, a diferencia de prepararImporteOpcional', () => {
  assert.throws(() => prepararImporteObligatorio(undefined, 'El precio'));
  assert.throws(() => prepararImporteObligatorio(null, 'El precio'));
  assert.throws(() => prepararImporteObligatorio('', 'El precio'));
});

test('prepararImporteObligatorio acepta un importe válido y aplica los mismos límites que prepararImporteOpcional', () => {
  assert.equal(prepararImporteObligatorio(19.99, 'El precio'), 1999);
  assert.equal(
    prepararImporteObligatorio(MAXIMO_IMPORTE_PESOS, 'El precio'),
    MAXIMO_IMPORTE_CENTAVOS,
  );
  assert.throws(() => prepararImporteObligatorio(true, 'El precio'));
  assert.throws(() => prepararImporteObligatorio(-1, 'El precio'));
  assert.throws(() => prepararImporteObligatorio(99999999.994, 'El precio'));
});

// --- limpiarCadenaOpcional: distingue ausencia permitida de tipo inválido ---

test('limpiarCadenaOpcional trata undefined, null y cadena vacía como ausencia permitida', () => {
  assert.equal(limpiarCadenaOpcional(undefined, 'El correo electrónico'), null);
  assert.equal(limpiarCadenaOpcional(null, 'El correo electrónico'), null);
  assert.equal(limpiarCadenaOpcional('', 'El correo electrónico'), null);
});

test('limpiarCadenaOpcional recorta espacios y trata una cadena de solo espacios como ausencia', () => {
  assert.equal(limpiarCadenaOpcional('  hola  ', 'x'), 'hola');
  assert.equal(limpiarCadenaOpcional('   ', 'x'), null);
});

test('limpiarCadenaOpcional rechaza un tipo inválido en vez de convertirlo silenciosamente en ausencia', () => {
  // Antes de esta política, email: true (o un número, objeto o arreglo)
  // se convertía directamente en null, como si no se hubiera enviado nada.
  assert.throws(
    () => limpiarCadenaOpcional(true, 'El correo electrónico'),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El correo electrónico no es válido',
  );
  assert.throws(() => limpiarCadenaOpcional(123, 'El correo electrónico'));
  assert.throws(() => limpiarCadenaOpcional({}, 'El correo electrónico'));
  assert.throws(() => limpiarCadenaOpcional(['a'], 'El correo electrónico'));
});
