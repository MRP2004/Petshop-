import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esCuilCuitValido, validarCuilCuit, normalizarNumeroDocumento } from '../src/utils/validacionFiscal.js';

// "20-17254359-7" es un CUIT real, verificado a mano contra el algoritmo
// público de dígito verificador módulo 11 de AFIP (ponderadores
// 5,4,3,2,7,6,5,4,3,2): 2*5+0*4+1*3+7*2+2*7+5*6+4*5+3*4+5*3+9*2 = 136;
// 136 % 11 = 4; 11-4 = 7 — coincide con el último dígito. No es un número
// inventado para que la prueba pase.
const CUIT_REAL_VALIDO = '20-17254359-7';

test('normalizarNumeroDocumento quita puntos, guiones y espacios', () => {
  assert.equal(normalizarNumeroDocumento('20-17254359-7'), '20172543597');
  assert.equal(normalizarNumeroDocumento('20.17254359.7'), '20172543597');
  assert.equal(normalizarNumeroDocumento(' 20 17254359 7 '), '20172543597');
  assert.equal(normalizarNumeroDocumento(null), '');
});

test('esCuilCuitValido acepta un CUIT real, con o sin separadores', () => {
  assert.equal(esCuilCuitValido(CUIT_REAL_VALIDO), true);
  assert.equal(esCuilCuitValido('20172543597'), true);
});

test('esCuilCuitValido rechaza un dígito verificador incorrecto', () => {
  assert.equal(esCuilCuitValido('20-17254359-6'), false);
  assert.equal(esCuilCuitValido('20-17254359-0'), false);
});

test('esCuilCuitValido rechaza longitudes incorrectas y no numéricas', () => {
  assert.equal(esCuilCuitValido('123'), false);
  assert.equal(esCuilCuitValido('201725435977'), false); // 12 dígitos
  assert.equal(esCuilCuitValido('2017254359a'), false);
  assert.equal(esCuilCuitValido(''), false);
  assert.equal(esCuilCuitValido(null), false);
  assert.equal(esCuilCuitValido(undefined), false);
});

test('validarCuilCuit devuelve el número normalizado cuando es válido', () => {
  assert.equal(validarCuilCuit(CUIT_REAL_VALIDO), '20172543597');
});

test('validarCuilCuit rechaza con AppError 400 y el mensaje incluye el nombre del campo', () => {
  assert.throws(
    () => validarCuilCuit('123', 'El CUIT de la tienda'),
    (error) => error.statusCode === 400 && error.message.includes('El CUIT de la tienda'),
  );
});
