// Corrección de una revisión posterior sobre limiteIntentos.middleware.js:
//
// 1. La clave por defecto (IP+email) tiene un punto ciego real: alguien que
//    prueba muchos emails DISTINTOS desde la misma IP nunca acumula más de
//    un intento por clave, así que jamás llega al máximo. Se agregó una
//    capa por IP sola (ver usuario.routes.js).
// 2. La primera versión de esa capa compartía un único Map a nivel de
//    módulo entre TODAS las instancias de limitarIntentos, namespaceando
//    las claves con un prefijo. Namespacear las claves no alcanzaba: la
//    limpieza periódica de una instancia recorría el Map entero y filtraba
//    CADA entrada con SU PROPIA ventana, sin importar de qué instancia era
//    esa entrada — una limpieza de una ventana corta podía borrar intentos
//    todavía vigentes de una instancia con ventana más larga. Ahora cada
//    instancia tiene su propio Map (ver el middleware): estas pruebas
//    demuestran que ya no puede pasar.
//
// Pruebas unitarias del middleware en un mini servidor Express propio (no
// el app.js completo): no hace falta login real ni stubs de Usuario/base
// para demostrar el comportamiento del limitador en sí.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

import limitarIntentos, { claveSoloIp } from '../src/middlewares/limiteIntentos.middleware.js';

const crearAppDePrueba = (middlewares) => {
  const app = express();
  app.use(express.json());
  app.post('/accion', ...middlewares, (req, res) => res.status(200).json({ ok: true }));
  return app;
};

test('límite por IP sola: cambiar de email en cada intento no evita el límite general', async () => {
  const limitePorIp = limitarIntentos({ maximo: 5, ventanaMs: 15 * 60 * 1000, obtenerClave: claveSoloIp });
  const app = crearAppDePrueba([limitePorIp]);

  let ultimaRespuesta;
  for (let intento = 0; intento < 6; intento += 1) {
    ultimaRespuesta = await request(app)
      .post('/accion')
      .send({ email: `cuenta-${intento}@petshop.demo`, password: 'lo-que-sea' });
  }

  assert.equal(ultimaRespuesta.status, 429);
  assert.match(ultimaRespuesta.body.error, /Demasiados intentos/);
});

test('sin la capa por IP sola (solo IP+email), los mismos intentos con emails distintos NUNCA se bloquean', async () => {
  const limitePorIpMasEmail = limitarIntentos({ maximo: 5, ventanaMs: 15 * 60 * 1000 });
  const app = crearAppDePrueba([limitePorIpMasEmail]);

  let ultimaRespuesta;
  for (let intento = 0; intento < 6; intento += 1) {
    ultimaRespuesta = await request(app)
      .post('/accion')
      .send({ email: `otra-cuenta-${intento}@petshop.demo`, password: 'lo-que-sea' });
  }

  // Se documenta a propósito el punto ciego de la capa que queda sola: cada
  // email es una clave nueva, así que ninguno de los 6 intentos se bloquea.
  // Por eso en usuario.routes.js esta capa nunca se usa sola.
  assert.equal(ultimaRespuesta.status, 200);
});

test('login y registro no comparten conteos: agotar el límite de uno dos deja al otro en cero', async () => {
  const limiteLogin = limitarIntentos({ maximo: 2, ventanaMs: 15 * 60 * 1000, obtenerClave: claveSoloIp });
  const limiteRegistro = limitarIntentos({ maximo: 2, ventanaMs: 15 * 60 * 1000, obtenerClave: claveSoloIp });

  const appLogin = crearAppDePrueba([limiteLogin]);
  const appRegistro = crearAppDePrueba([limiteRegistro]);

  await request(appLogin).post('/accion').send({ email: 'a@petshop.demo' });
  await request(appLogin).post('/accion').send({ email: 'b@petshop.demo' });
  const tercerIntentoLogin = await request(appLogin).post('/accion').send({ email: 'c@petshop.demo' });
  assert.equal(tercerIntentoLogin.status, 429, 'el límite de login debía agotarse');

  // Misma IP de pruebas (supertest siempre usa la misma), instancia
  // distinta: el conteo de registro no se ve afectado por haber agotado el
  // de login.
  const primerIntentoRegistro = await request(appRegistro).post('/accion').send({ email: 'a@petshop.demo' });
  assert.equal(primerIntentoRegistro.status, 200, 'el límite de registro no debía verse afectado');
});

test('la limpieza de una ventana corta no borra intentos vigentes de una ventana más larga', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });

  // Ventana corta (login, 15 min) y ventana larga (registro, 60 min),
  // igual que en usuario.routes.js. maximo alto en la de ventana corta:
  // solo importa como disparador de limpieza (cada 200 pedidos), no como
  // límite real para esta prueba.
  const limiteVentanaCorta = limitarIntentos({ maximo: 1000, ventanaMs: 15 * 60 * 1000, obtenerClave: claveSoloIp });
  const limiteVentanaLarga = limitarIntentos({ maximo: 2, ventanaMs: 60 * 60 * 1000, obtenerClave: claveSoloIp });

  const appCorta = crearAppDePrueba([limiteVentanaCorta]);
  const appLarga = crearAppDePrueba([limiteVentanaLarga]);

  // t = 0: un intento contra la ventana larga (queda 1 de 2 antes de
  // bloquear).
  const primero = await request(appLarga).post('/accion').send({});
  assert.equal(primero.status, 200);

  // t = 20 min: vigente para la ventana larga (60 min), ya vencido para la
  // ventana corta (15 min) si se evaluara con el umbral equivocado.
  t.mock.timers.tick(20 * 60 * 1000);

  // Disparar la limpieza interna de la instancia de ventana corta (corre
  // cada 200 pedidos, ver el middleware). Ninguno de estos pedidos toca la
  // instancia de ventana larga.
  for (let i = 0; i < 200; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await request(appCorta).post('/accion').send({});
  }

  // Si la limpieza de la instancia de ventana corta hubiera tocado (con su
  // propio umbral de 15 min) las marcas de la instancia de ventana larga,
  // el intento de t=0 ya no contaría, y este segundo pedido no llegaría al
  // máximo (2) todavía. Con Maps separados, sí llega: es el segundo de 2.
  const segundo = await request(appLarga).post('/accion').send({});
  assert.equal(segundo.status, 200);

  const tercero = await request(appLarga).post('/accion').send({});
  assert.equal(
    tercero.status,
    429,
    'el intento de t=0 debía seguir contando: la limpieza de la ventana corta no debía haberlo borrado',
  );
});

test('recuperación tras vencer la ventana: pasado ese tiempo, una clave antes bloqueada vuelve a permitirse', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });

  const limite = limitarIntentos({ maximo: 2, ventanaMs: 15 * 60 * 1000, obtenerClave: claveSoloIp });
  const app = crearAppDePrueba([limite]);

  await request(app).post('/accion').send({});
  await request(app).post('/accion').send({});
  const bloqueado = await request(app).post('/accion').send({});
  assert.equal(bloqueado.status, 429);

  // Pasa la ventana completa (15 min) más un margen.
  t.mock.timers.tick(16 * 60 * 1000);

  const recuperado = await request(app).post('/accion').send({});
  assert.equal(recuperado.status, 200, 'después de vencer la ventana, el conteo debía haber vuelto a cero');
});
