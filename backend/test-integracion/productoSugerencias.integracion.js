// Prueba de integración real contra MySQL para el buscador predictivo
// (ronda 2, ver docs/frontend-diseno.md): coincidencia por nombre, exclusión
// de productos de prueba, límite de resultados e insensibilidad a
// mayúsculas/tildes de la propia comparación (no de collation). No se
// ejecuta con `npm test`.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import sequelize from '../src/config/database.js';
import app from '../src/app.js';
import { obtenerSugerenciasBusqueda, crearProducto } from '../src/services/producto.service.js';
import { cambiarEstadoTienda } from '../src/services/tienda.service.js';
import { prepararEsquema, limpiarDatos, crearProductoDePrueba, crearVendedorIndependienteDePrueba, crearUsuarioDePrueba } from './ayudaIntegracion.js';

before(async () => {
  await prepararEsquema();
});

beforeEach(async () => {
  await limpiarDatos();
});

after(async () => {
  await sequelize.close();
});

test('encuentra por coincidencia parcial e insensible a mayúsculas', async () => {
  await crearProductoDePrueba({ nombre: 'Alimento para perro adulto' });
  await crearProductoDePrueba({ nombre: 'Shampoo para gatos' });

  const resultado = await obtenerSugerenciasBusqueda({ q: 'ALIMENTO' });

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].nombre, 'Alimento para perro adulto');
});

test('excluye productos de prueba de las sugerencias', async () => {
  await crearProductoDePrueba({ nombre: 'Alimento de prueba' });
  await crearProductoDePrueba({ nombre: 'Alimento para gato' });

  const resultado = await obtenerSugerenciasBusqueda({ q: 'alimento' });

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].nombre, 'Alimento para gato');
});

test('respeta el límite de resultados', async () => {
  await Promise.all(
    Array.from({ length: 10 }, (_, indice) =>
      crearProductoDePrueba({ nombre: `Juguete modelo ${indice}` }),
    ),
  );

  const resultado = await obtenerSugerenciasBusqueda({ q: 'juguete' });

  assert.ok(resultado.length <= 6, `esperaba como máximo 6 resultados, llegaron ${resultado.length}`);
});

test('sin coincidencias devuelve un arreglo vacío, no un error', async () => {
  await crearProductoDePrueba({ nombre: 'Alimento para perro' });

  const resultado = await obtenerSugerenciasBusqueda({ q: 'inexistente-xyz' });

  assert.deepEqual(resultado, []);
});

test('incluye la imagen del producto cuando existe', async () => {
  const { crearProducto } = await import('../src/services/producto.service.js');

  await crearProducto({
    nombre: 'Correa reforzada',
    precio: '5000.00',
    stockActual: 3,
    stockMinimo: 1,
    urlImagen: 'https://proveedor.example.com/fotos/correa.jpg',
  });

  const resultado = await obtenerSugerenciasBusqueda({ q: 'correa' });

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].imagen.url, 'https://proveedor.example.com/fotos/correa.jpg');
});

test('un "%" en la búsqueda se trata como carácter literal, no como comodín de LIKE', async () => {
  await crearProductoDePrueba({ nombre: 'Descuento 50% en liquidación' });
  await crearProductoDePrueba({ nombre: 'Alimento para gato' });

  const resultado = await obtenerSugerenciasBusqueda({ q: '50%' });

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].nombre, 'Descuento 50% en liquidación');
});

test('un "_" en la búsqueda se trata como carácter literal, no como comodín de LIKE', async () => {
  await crearProductoDePrueba({ nombre: 'Correa_reforzada' });
  await crearProductoDePrueba({ nombre: 'Alimento para gato' });

  const resultado = await obtenerSugerenciasBusqueda({ q: 'correa_' });

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].nombre, 'Correa_reforzada');
});

test('buscar solo "%" no devuelve todo el catálogo', async () => {
  await crearProductoDePrueba({ nombre: 'Alimento para gato' });
  await crearProductoDePrueba({ nombre: 'Correa reforzada' });

  const resultado = await obtenerSugerenciasBusqueda({ q: '%' });

  assert.deepEqual(resultado, []);
});

test('GET /api/productos/sugerencias es público y devuelve la forma esperada', async () => {
  await crearProductoDePrueba({ nombre: 'Pelota resistente', precio: '1200.00' });

  const respuesta = await request(app).get('/api/productos/sugerencias?q=pelota').expect(200);

  assert.equal(respuesta.body.length, 1);
  assert.equal(respuesta.body[0].nombre, 'Pelota resistente');
  assert.ok('idProducto' in respuesta.body[0]);
  assert.ok('precio' in respuesta.body[0]);
});

// Ronda 2, Etapa 8 (marketplace) — hallazgo real de Codex (revisión de la
// implementación): el buscador predictivo es TAMBIÉN una vía pública de
// catálogo; sin este filtro, un producto de una tienda suspendida seguía
// apareciendo acá aunque ya estuviera oculto del listado y del detalle.
test('un producto de una tienda suspendida no aparece en las sugerencias del buscador', async () => {
  const { usuario, tienda } = await crearVendedorIndependienteDePrueba();
  const usuarioActor = { idUsuario: usuario.idUsuario, rol: 'vendedor_independiente', idCliente: usuario.idCliente, idTienda: tienda.idTienda };

  await crearProducto(
    { nombre: 'Correa reforzada de tienda suspendida', precio: '500.00', stockActual: 5, stockMinimo: 1 },
    usuarioActor,
  );

  const admin = await crearUsuarioDePrueba({ rol: 'administrador', idCliente: null });
  await cambiarEstadoTienda(tienda.idTienda, 'suspendida', { idUsuario: admin.idUsuario, rol: 'administrador' });

  const resultado = await obtenerSugerenciasBusqueda({ q: 'reforzada' });
  assert.deepEqual(resultado, []);
});
