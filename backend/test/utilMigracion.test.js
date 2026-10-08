import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valoresEnum, asegurarQueAmplia } from '../scripts/utilMigracion.js';

test('valoresEnum separa los valores de un tipo ENUM de MySQL', () => {
  assert.deepEqual(valoresEnum("enum('cliente','vendedor')"), ['cliente', 'vendedor']);
  assert.equal(valoresEnum('int'), null);
  assert.equal(valoresEnum(null), null);
});

test('asegurarQueAmplia acepta un superconjunto y rechaza perder valores o columnas que no son ENUM', () => {
  const final = "enum('a','b','c')";

  assert.doesNotThrow(() => asegurarQueAmplia('t', 'c', "enum('a','b')", final));
  assert.throws(() => asegurarQueAmplia('t', 'c', "enum('a','x')", final), /\(x\)/);
  assert.throws(() => asegurarQueAmplia('t', 'c', 'varchar(20)', final), /no es un ENUM/);
  assert.throws(() => asegurarQueAmplia('t', 'c', null, final), /columna inexistente/);
});
