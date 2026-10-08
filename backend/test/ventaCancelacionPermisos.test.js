// Prueba de regresión pedida por la revisión sobre la venta #20: el chequeo
// de permisos de cancelarVenta() (venta.service.js) debe rechazar con 403 a
// CUALQUIER usuario que no sea vendedor o administrador, incluido un
// usuario ausente (`undefined`) — antes solo se bloqueaba un rol 'cliente'
// explícito, dejando pasar sin usuario o con un rol desconocido.
//
// El chequeo ocurre antes de abrir la transacción (ver cancelarVenta), así
// que estas pruebas no necesitan MySQL real ni simular Venta/sequelize: si
// el rechazo no ocurriera, el intento de leer la base fallaría por falta de
// conexión, y la prueba lo notaría igual (como error, no como 403).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cancelarVenta } from '../src/services/venta.service.js';

test('cancelarVenta rechaza con 403 a un usuario con rol "cliente"', async () => {
  await assert.rejects(
    () => cancelarVenta(1, { idUsuario: 1, rol: 'cliente', idCliente: 7 }),
    (error) =>
      error.statusCode === 403 &&
      error.message === 'No tiene permisos para cancelar esta venta',
  );
});

test('cancelarVenta rechaza con 403 a un rol desconocido', async () => {
  await assert.rejects(
    () => cancelarVenta(1, { idUsuario: 1, rol: 'repositor' }),
    (error) =>
      error.statusCode === 403 &&
      error.message === 'No tiene permisos para cancelar esta venta',
  );
});

test('cancelarVenta rechaza con 403 cuando no hay usuario (undefined)', async () => {
  await assert.rejects(
    () => cancelarVenta(1, undefined),
    (error) =>
      error.statusCode === 403 &&
      error.message === 'No tiene permisos para cancelar esta venta',
  );
});
