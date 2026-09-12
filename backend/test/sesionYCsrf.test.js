// Pruebas de la estrategia de sesión por cookies (ver
// docs/backend-autenticacion.md): el login usa Usuario.findOne (una
// lectura real de la base) para verificar la contraseña, así que se
// simula esa lectura con un stub (mismo criterio que
// ventaDescuentoAutorizacion.test.js: "persistencia simulada", sin tocar
// MySQL real). El resto de las rutas que se ejercitan acá están detrás del
// mismo resguardo que el resto de esta suite (sequelize.transaction/query/
// connectionManager interceptados para fallar si se intenta un acceso real).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import Usuario from '../src/models/usuario.model.js';
import { hashearContrasena } from '../src/utils/contrasenas.js';

const EMAIL = 'sesion-csrf@petshop.demo';
const PASSWORD = 'Clave12345678';

const transactionOriginal = sequelize.transaction;
const queryOriginal = sequelize.query;
const getConnectionOriginal = sequelize.connectionManager.getConnection;
const usuarioFindOneOriginal = Usuario.findOne;

let intentosDeTransaccion = 0;
let intentosDeQuery = 0;
let intentosDeConexion = 0;
let contrasenaHash;

before(async () => {
  // Único uso real de scrypt en esta suite (no toca la base): genera el
  // hash una sola vez para que el stub de abajo tenga algo válido contra
  // qué comparar en iniciarSesion.
  contrasenaHash = await hashearContrasena(PASSWORD);

  sequelize.transaction = () => {
    intentosDeTransaccion += 1;
    throw new Error('Protección de prueba: transacción real inesperada');
  };
  sequelize.query = () => {
    intentosDeQuery += 1;
    throw new Error('Protección de prueba: consulta real inesperada');
  };
  sequelize.connectionManager.getConnection = () => {
    intentosDeConexion += 1;
    throw new Error('Protección de prueba: conexión real inesperada');
  };

  Usuario.findOne = async ({ where }) => {
    if (where?.email !== EMAIL) return null;
    return {
      idUsuario: 999,
      email: EMAIL,
      contrasenaHash,
      rol: 'cliente',
      idCliente: 42,
    };
  };
});

after(() => {
  sequelize.transaction = transactionOriginal;
  sequelize.query = queryOriginal;
  sequelize.connectionManager.getConnection = getConnectionOriginal;
  Usuario.findOne = usuarioFindOneOriginal;

  // A diferencia de los otros archivos "entradas inválidas", acá SÍ se
  // espera que sequelize.transaction se haya llamado (dos veces, a
  // propósito: ver los tests de CSRF correcto y de Bearer explícito, que
  // verifican que la solicitud pasó la autenticación y llegó al servicio).
  // Lo que nunca debe pasar, en ningún caso, es una consulta o conexión
  // real: sequelize.transaction() lanza sincrónicamente antes de que el
  // callback llegue a ejecutar ninguna consulta.
  assert.equal(intentosDeQuery, 0, 'no debía ejecutarse una consulta real');
  assert.equal(intentosDeConexion, 0, 'no debía adquirirse una conexión real');
});

test('POST /api/usuarios/login deja la sesión en una cookie HttpOnly, no en el cuerpo de la respuesta', async () => {
  const respuesta = await request(app)
    .post('/api/usuarios/login')
    .send({ email: EMAIL, password: PASSWORD })
    .expect(200);

  assert.equal(respuesta.body.token, undefined, 'el JWT no debe viajar en el cuerpo');
  // Mismo shape que GET /api/usuarios/perfil (el payload del token): sin
  // email, ver usuario.service.js#iniciarSesionConUsuario.
  assert.deepEqual(respuesta.body.usuario, { idUsuario: 999, rol: 'cliente', idCliente: 42 });
  assert.equal(typeof respuesta.body.csrfToken, 'string');

  const cookies = respuesta.headers['set-cookie'];
  const cookieSesion = cookies.find((c) => c.startsWith('petshop_sesion='));
  const cookieCsrf = cookies.find((c) => c.startsWith('petshop_csrf='));

  assert.ok(cookieSesion, 'debe setear la cookie de sesión');
  assert.match(cookieSesion, /HttpOnly/i);
  assert.ok(cookieCsrf, 'debe setear la cookie de csrf');
  assert.doesNotMatch(cookieCsrf, /HttpOnly/i, 'la cookie de csrf debe ser legible por JS');
});

test('con sesión por cookie, una solicitud mutable sin X-CSRF-Token responde 403 y no llega a la base', async () => {
  const agente = request.agent(app);

  const { body } = await agente
    .post('/api/usuarios/login')
    .send({ email: EMAIL, password: PASSWORD })
    .expect(200);

  const antesTransaccion = intentosDeTransaccion;

  const respuesta = await agente.patch('/api/ventas/1/cancelar').expect(403);

  assert.equal(respuesta.body.error, 'Token CSRF inválido o ausente');
  assert.equal(intentosDeTransaccion, antesTransaccion, 'no debía llegar a abrir una transacción');
  assert.ok(body.csrfToken);
});

test('con sesión por cookie y X-CSRF-Token correcto, la solicitud pasa la autenticación (llega a la capa de datos, bloqueada por el resguardo de prueba)', async () => {
  const agente = request.agent(app);

  const { body } = await agente
    .post('/api/usuarios/login')
    .send({ email: EMAIL, password: PASSWORD })
    .expect(200);

  const antesTransaccion = intentosDeTransaccion;

  // 500 acá significa "pasó CSRF y la autenticación, y llegó al servicio",
  // que intentó abrir una transacción real y el resguardo de esta suite lo
  // interceptó (ver el after() de arriba, que confirma que igual nunca se
  // llegó a MySQL de verdad).
  await agente
    .patch('/api/ventas/1/cancelar')
    .set('X-CSRF-Token', body.csrfToken)
    .expect(500);

  assert.equal(intentosDeTransaccion, antesTransaccion + 1);
});

test('con sesión por cookie y X-CSRF-Token incorrecto, responde 403', async () => {
  const agente = request.agent(app);

  await agente.post('/api/usuarios/login').send({ email: EMAIL, password: PASSWORD }).expect(200);

  await agente
    .patch('/api/ventas/1/cancelar')
    .set('X-CSRF-Token', 'un-token-que-no-coincide-0000000000000000000000000000000000000')
    .expect(403);
});

test('un Authorization: Bearer explícito no exige X-CSRF-Token (no es vulnerable a CSRF)', async () => {
  const { tokenCliente, autorizacion } = await import('./ayudaAutenticacion.js');

  const antesTransaccion = intentosDeTransaccion;

  // Sin sesión de cookie ninguna, solo el header Bearer: debe pasar la
  // autenticación (y volver a fallar en el resguardo de la base, como en el
  // caso anterior), no en la comprobación de CSRF.
  await request(app)
    .patch('/api/ventas/1/cancelar')
    .set('Authorization', autorizacion(tokenCliente(42)))
    .expect(500);

  assert.equal(intentosDeTransaccion, antesTransaccion + 1);
});

test('GET /api/usuarios/perfil con sesión por cookie no exige CSRF (no muta nada)', async () => {
  const agente = request.agent(app);

  await agente.post('/api/usuarios/login').send({ email: EMAIL, password: PASSWORD }).expect(200);

  const respuesta = await agente.get('/api/usuarios/perfil').expect(200);
  assert.equal(respuesta.body.email, undefined); // el perfil devuelve el payload del token, no el email
  assert.equal(respuesta.body.rol, 'cliente');
});

test('POST /api/usuarios/logout limpia ambas cookies de sesión', async () => {
  const agente = request.agent(app);

  await agente.post('/api/usuarios/login').send({ email: EMAIL, password: PASSWORD }).expect(200);

  const respuesta = await agente.post('/api/usuarios/logout').expect(204);
  const cookies = respuesta.headers['set-cookie'];

  assert.ok(cookies.some((c) => c.startsWith('petshop_sesion=') && /Expires=Thu, 01 Jan 1970/.test(c)));
  assert.ok(cookies.some((c) => c.startsWith('petshop_csrf=') && /Expires=Thu, 01 Jan 1970/.test(c)));

  // Después de "cerrar sesión", la misma cookie ya limpiada no debe dar acceso.
  await agente.get('/api/usuarios/perfil').expect(401);
});

test('POST /api/usuarios/login con credenciales incorrectas responde 401 sin dar pistas de más', async () => {
  const respuesta = await request(app)
    .post('/api/usuarios/login')
    .send({ email: EMAIL, password: 'contraseña-incorrecta' })
    .expect(401);

  assert.equal(respuesta.body.error, 'Correo o contraseña incorrectos');
});

test('límite de intentos: después del máximo configurado, /login responde 429', async () => {
  const emailDistinto = 'limite-intentos@petshop.demo';

  let ultimaRespuesta;
  for (let intento = 0; intento < 9; intento += 1) {
    ultimaRespuesta = await request(app)
      .post('/api/usuarios/login')
      .send({ email: emailDistinto, password: 'lo-que-sea-no-existe' });
  }

  assert.equal(ultimaRespuesta.status, 429);
  assert.match(ultimaRespuesta.body.error, /Demasiados intentos/);
});
