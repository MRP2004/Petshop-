import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import {
  obtenerProvincias,
  esProvinciaValida,
  obtenerNombreProvincia,
  obtenerLocalidades,
  buscarLocalidadEnProvincia,
} from '../src/services/georef.service.js';

// Dirección argentina estructurada (ronda 2): pruebas puras de
// georef.service.js. El JSON de provincias es estático (sin red); las
// localidades SÍ dependen de una llamada real a la API pública de Georef,
// así que acá se mockea `global.fetch` (nunca se llama a Internet de
// verdad desde esta suite) — mismo espíritu que "no tocar la base real" en
// el resto de backend/test/, aplicado a la única dependencia externa que
// tiene este servicio.
const fetchOriginal = global.fetch;
let llamadasAFetch;

beforeEach(() => {
  llamadasAFetch = 0;
});

after(() => {
  global.fetch = fetchOriginal;
});

const mockearFetchExitoso = (localidades) => {
  global.fetch = async () => {
    llamadasAFetch += 1;
    return {
      ok: true,
      json: async () => ({ localidades }),
    };
  };
};

const mockearFetchFallido = () => {
  global.fetch = async () => {
    llamadasAFetch += 1;
    return { ok: false, status: 503 };
  };
};

test('obtenerProvincias devuelve exactamente 24 provincias reales, con Santa Fe incluida', () => {
  const provincias = obtenerProvincias();
  assert.equal(provincias.length, 24);
  assert.ok(provincias.some((p) => p.id === '82' && p.nombre === 'Santa Fe'));
});

test('esProvinciaValida acepta un id real y rechaza uno inventado', () => {
  assert.equal(esProvinciaValida('82'), true);
  assert.equal(esProvinciaValida('99'), false);
  assert.equal(esProvinciaValida(''), false);
});

test('obtenerNombreProvincia devuelve el nombre real o null', () => {
  assert.equal(obtenerNombreProvincia('82'), 'Santa Fe');
  assert.equal(obtenerNombreProvincia('99'), null);
});

test('obtenerLocalidades rechaza una provincia inexistente con 400, sin llamar a fetch', async () => {
  mockearFetchExitoso([]);
  await assert.rejects(
    () => obtenerLocalidades('99'),
    (error) => error.statusCode === 400 && error.message === 'La provincia indicada no existe',
  );
  assert.equal(llamadasAFetch, 0);
});

test('obtenerLocalidades pide a Georef una sola vez y sirve el resto desde la cache', async () => {
  mockearFetchExitoso([{ id: '82084270', nombre: 'Rosario' }]);

  const primera = await obtenerLocalidades('70'); // San Juan: provincia sin usar en otros tests, cache limpia
  assert.equal(llamadasAFetch, 1);
  assert.deepEqual(primera, [{ id: '82084270', nombre: 'Rosario' }]);

  const segunda = await obtenerLocalidades('70');
  assert.equal(llamadasAFetch, 1, 'la segunda consulta no debía volver a pedirle nada a Georef');
  assert.deepEqual(segunda, primera);
});

test('dos pedidos concurrentes a la misma provincia sin cache dedupan: un solo fetch real', async () => {
  let resolverFetch;
  let llamadasReales = 0;
  global.fetch = () => {
    llamadasReales += 1;
    return new Promise((resolve) => {
      resolverFetch = () =>
        resolve({ ok: true, json: async () => ({ localidades: [{ id: '10010010', nombre: 'San Fernando del Valle' }] }) });
    });
  };

  const primeraPromesa = obtenerLocalidades('10'); // Catamarca: cache limpia
  const segundaPromesa = obtenerLocalidades('10');

  // Ambos pedidos ya deberían haber entrado al cache-miss antes de que el
  // fetch (todavía sin resolver) termine — recién acá se libera.
  resolverFetch();

  const [primera, segunda] = await Promise.all([primeraPromesa, segundaPromesa]);

  assert.equal(llamadasReales, 1, 'no debía dispararse un segundo fetch real mientras el primero seguía en vuelo');
  assert.deepEqual(primera, segunda);
});

test('una respuesta de Georef con "localidades" que no es un arreglo se trata como fallo (no rompe con datos corruptos)', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ localidades: 'no-es-un-arreglo' }) });

  await assert.rejects(
    () => obtenerLocalidades('14'), // Córdoba: cache limpia
    (error) => error.statusCode === 503,
  );
});

test('entradas individuales sin id/nombre real se descartan, sin invalidar el resto de la lista', async () => {
  mockearFetchExitoso([
    { id: '18010010', nombre: 'Corrientes' },
    { id: '', nombre: 'Sin id' },
    { id: '18020020', nombre: '' },
    { id: '18030030' }, // sin nombre en absoluto
  ]);

  const localidades = await obtenerLocalidades('18'); // Corrientes: cache limpia

  assert.deepEqual(localidades, [{ id: '18010010', nombre: 'Corrientes' }]);
});

test('si Georef falla y no hay nada cacheado todavía, responde 503 sin romper el resto', async () => {
  mockearFetchFallido();

  await assert.rejects(
    () => obtenerLocalidades('74'), // San Luis: provincia sin cache previa
    (error) =>
      error.statusCode === 503 &&
      error.message === 'No se pudo cargar la lista de localidades. Intentá de nuevo en unos minutos.',
  );
});

test('buscarLocalidadEnProvincia encuentra por id real y devuelve null si no pertenece a esa provincia', async () => {
  mockearFetchExitoso([{ id: '82084270', nombre: 'Rosario' }]);

  const encontrada = await buscarLocalidadEnProvincia('82084270', '78'); // Santa Cruz: cache limpia
  assert.deepEqual(encontrada, { id: '82084270', nombre: 'Rosario' });

  const noEncontrada = await buscarLocalidadEnProvincia('00000000', '78');
  assert.equal(noEncontrada, null);
});

test('GET /api/georef/provincias es público y devuelve las 24 provincias', async () => {
  const respuesta = await request(app).get('/api/georef/provincias').expect(200);
  assert.equal(respuesta.body.length, 24);
});

test('GET /api/georef/localidades sin idProvincia responde 400', async () => {
  const respuesta = await request(app).get('/api/georef/localidades').expect(400);
  assert.equal(respuesta.body.error, 'El parámetro idProvincia es obligatorio');
});

test('GET /api/georef/localidades con idProvincia inválido responde 400', async () => {
  const respuesta = await request(app).get('/api/georef/localidades?idProvincia=99').expect(400);
  assert.equal(respuesta.body.error, 'La provincia indicada no existe');
});

test('GET /api/georef/localidades es público y devuelve la lista (mockeada)', async () => {
  mockearFetchExitoso([{ id: '06010101', nombre: 'La Plata' }]);

  const respuesta = await request(app).get('/api/georef/localidades?idProvincia=06').expect(200);
  assert.deepEqual(respuesta.body, [{ id: '06010101', nombre: 'La Plata' }]);
});
