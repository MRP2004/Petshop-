import test from 'node:test';
import assert from 'node:assert/strict';

import procesarPagoSimulado from '../src/services/pagoSimulado.service.js';

// Vencimiento siempre futuro respecto de "hoy": evita que estas pruebas
// empiecen a fallar solas con el paso del tiempo (no se fija un año fijo).
const vencimientoFuturo = () => {
  const dentroDeDosAnios = new Date();
  dentroDeDosAnios.setFullYear(dentroDeDosAnios.getFullYear() + 2);
  const mm = String(dentroDeDosAnios.getMonth() + 1).padStart(2, '0');
  const aa = String(dentroDeDosAnios.getFullYear()).slice(-2);
  return `${mm}/${aa}`;
};

test('transferencia simulada siempre se aprueba, sin pedir datos de tarjeta', () => {
  const resultado = procesarPagoSimulado({ tipo: 'transferencia' });

  assert.equal(resultado.estado, 'aprobado_simulado');
  assert.equal(resultado.tipo, 'transferencia');
  assert.equal(resultado.ultimosCuatroDigitos, null);
});

test('débito con una tarjeta de demostración aprobada se aprueba y expone solo los últimos 4 dígitos', () => {
  const resultado = procesarPagoSimulado({
    tipo: 'debito',
    datosDebito: {
      numero: '4000000000000002',
      titular: 'Cliente De Prueba',
      vencimiento: vencimientoFuturo(),
      codigoSeguridad: '123',
    },
  });

  assert.equal(resultado.estado, 'aprobado_simulado');
  assert.equal(resultado.ultimosCuatroDigitos, '0002');
  // Nunca debe viajar el número completo ni el código de seguridad en el resultado.
  assert.equal('numero' in resultado, false);
  assert.equal('codigoSeguridad' in resultado, false);
});

test('débito con una tarjeta de demostración rechazada se rechaza con un motivo, sin lanzar', () => {
  const resultado = procesarPagoSimulado({
    tipo: 'debito',
    datosDebito: {
      numero: '4000000000000010',
      titular: 'Cliente De Prueba',
      vencimiento: vencimientoFuturo(),
      codigoSeguridad: '123',
    },
  });

  assert.equal(resultado.estado, 'rechazado_simulado');
  assert.ok(resultado.motivoRechazo);
});

test('débito con un número fuera de la lista de demostración se rechaza aunque el formato sea válido', () => {
  const resultado = procesarPagoSimulado({
    tipo: 'debito',
    datosDebito: {
      numero: '4111111111111111', // 16 dígitos, formato válido, no está en la lista
      titular: 'Cliente De Prueba',
      vencimiento: vencimientoFuturo(),
      codigoSeguridad: '123',
    },
  });

  assert.equal(resultado.estado, 'rechazado_simulado');
  assert.match(resultado.motivoRechazo, /no reconocida/);
});

test('débito con un número que no tiene 16 dígitos responde 400 (error de formato, no un rechazo)', () => {
  assert.throws(
    () =>
      procesarPagoSimulado({
        tipo: 'debito',
        datosDebito: {
          numero: '400000000002',
          titular: 'Cliente De Prueba',
          vencimiento: vencimientoFuturo(),
          codigoSeguridad: '123',
        },
      }),
    (error) => error.statusCode === 400,
  );
});

test('débito con una tarjeta vencida responde 400', () => {
  assert.throws(
    () =>
      procesarPagoSimulado({
        tipo: 'debito',
        datosDebito: {
          numero: '4000000000000002',
          titular: 'Cliente De Prueba',
          vencimiento: '01/20', // enero de 2020, ya vencida
          codigoSeguridad: '123',
        },
      }),
    (error) => error.statusCode === 400 && /vencida/.test(error.message),
  );
});

test('débito con código de seguridad inválido responde 400', () => {
  assert.throws(
    () =>
      procesarPagoSimulado({
        tipo: 'debito',
        datosDebito: {
          numero: '4000000000000002',
          titular: 'Cliente De Prueba',
          vencimiento: vencimientoFuturo(),
          codigoSeguridad: 'ab1',
        },
      }),
    (error) => error.statusCode === 400,
  );
});

test('débito con titular vacío responde 400', () => {
  assert.throws(
    () =>
      procesarPagoSimulado({
        tipo: 'debito',
        datosDebito: {
          numero: '4000000000000002',
          titular: '',
          vencimiento: vencimientoFuturo(),
          codigoSeguridad: '123',
        },
      }),
    (error) => error.statusCode === 400,
  );
});

test('un tipo de pago desconocido responde 400', () => {
  assert.throws(
    () => procesarPagoSimulado({ tipo: 'criptomoneda' }),
    (error) => error.statusCode === 400,
  );
});
