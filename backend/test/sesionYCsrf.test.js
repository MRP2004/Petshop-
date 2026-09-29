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
import Cliente from '../src/models/cliente.model.js';
import { hashearContrasena } from '../src/utils/contrasenas.js';

const EMAIL = 'sesion-csrf@petshop.demo';
const PASSWORD = 'Clave12345678';
const CLIENTE = { idCliente: 42, nombre: 'Ana', apellido: 'García' };

const transactionOriginal = sequelize.transaction;
const queryOriginal = sequelize.query;
const getConnectionOriginal = sequelize.connectionManager.getConnection;
const usuarioFindOneOriginal = Usuario.findOne;
const usuarioFindByPkOriginal = Usuario.findByPk;
const clienteFindByPkOriginal = Cliente.findByPk;

let intentosDeTransaccion = 0;
let intentosDeQuery = 0;
let intentosDeConexion = 0;
let contrasenaHash;

const usuarioDePrueba = () => ({
  idUsuario: 999,
  email: EMAIL,
  contrasenaHash,
  rol: 'cliente',
  idCliente: 42,
});

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
    return usuarioDePrueba();
  };

  // Ronda 2: iniciarSesionConUsuario/obtenerPerfil (ver usuario.service.js)
  // ahora arman el perfil con nombre/apellido del Cliente asociado — se
  // stubean acá los dos puntos de entrada reales que usan (Usuario.findByPk
  // para GET /perfil, Cliente.findByPk para el nombre), mismo criterio que
  // Usuario.findOne arriba: nunca deben llegar a sequelize.query real.
  Usuario.findByPk = async (idUsuario) => {
    if (Number(idUsuario) !== 999) return null;
    return usuarioDePrueba();
  };

  Cliente.findByPk = async (idCliente) => {
    if (Number(idCliente) !== CLIENTE.idCliente) return null;
    return CLIENTE;
  };
});

after(() => {
  sequelize.transaction = transactionOriginal;
  sequelize.query = queryOriginal;
  sequelize.connectionManager.getConnection = getConnectionOriginal;
  Usuario.findOne = usuarioFindOneOriginal;
  Usuario.findByPk = usuarioFindByPkOriginal;
  Cliente.findByPk = clienteFindByPkOriginal;

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
  // Mismo shape que GET /api/usuarios/perfil (ronda 2: ya no es el payload
  // del token, incluye nombre/apellido/email — ver
  // usuario.service.js#construirPerfilPublico).
  assert.deepEqual(respuesta.body.usuario, {
    idUsuario: 999,
    rol: 'cliente',
    idCliente: 42,
    idTienda: null,
    email: EMAIL,
    nombre: CLIENTE.nombre,
    apellido: CLIENTE.apellido,
  });
  assert.equal(typeof respuesta.body.csrfToken, 'string');

  const cookies = respuesta.headers['set-cookie'];
  const cookieSesion = cookies.find((c) => c.startsWith('petshop_sesion='));
  const cookieCsrf = cookies.find((c) => c.startsWith('petshop_csrf='));

  assert.ok(cookieSesion, 'debe setear la cookie de sesión');
  assert.match(cookieSesion, /HttpOnly/i);
  assert.ok(cookieCsrf, 'debe setear la cookie de csrf');
  assert.doesNotMatch(cookieCsrf, /HttpOnly/i, 'la cookie de csrf debe ser legible por JS');
});

// Corrección (revisión de Mauro sobre la venta #20): PATCH
// /api/ventas/:id/cancelar ya no es alcanzable por un cliente (ahora exige
// vendedor/administrador, ver venta.routes.js) — un token de rol 'cliente'
// se rechaza en ESE middleware de rol, antes de llegar al resguardo de esta
// suite (transacción/consulta/conexión interceptadas), rompiendo el
// supuesto "500 = pasó auth y CSRF, llegó al servicio" de estos tests. Se
// usa en su lugar POST /api/solicitudes-cancelacion (la ruta nueva de esta
// corrección, sí exclusiva de 'cliente' — ver
// solicitudCancelacion.routes.js), que igual necesita abrir una transacción
// real para resolverse.
test('con sesión por cookie, una solicitud mutable sin X-CSRF-Token responde 403 y no llega a la base', async () => {
  const agente = request.agent(app);

  const { body } = await agente
    .post('/api/usuarios/login')
    .send({ email: EMAIL, password: PASSWORD })
    .expect(200);

  const antesTransaccion = intentosDeTransaccion;

  const respuesta = await agente.post('/api/solicitudes-cancelacion').send({ idVenta: 1 }).expect(403);

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
    .post('/api/solicitudes-cancelacion')
    .set('X-CSRF-Token', body.csrfToken)
    .send({ idVenta: 1 })
    .expect(500);

  assert.equal(intentosDeTransaccion, antesTransaccion + 1);
});

test('con sesión por cookie y X-CSRF-Token incorrecto, responde 403', async () => {
  const agente = request.agent(app);

  await agente.post('/api/usuarios/login').send({ email: EMAIL, password: PASSWORD }).expect(200);

  await agente
    .post('/api/solicitudes-cancelacion')
    .set('X-CSRF-Token', 'un-token-que-no-coincide-0000000000000000000000000000000000000')
    .send({ idVenta: 1 })
    .expect(403);
});

test('un Authorization: Bearer explícito no exige X-CSRF-Token (no es vulnerable a CSRF)', async () => {
  const { tokenCliente, autorizacion } = await import('./ayudaAutenticacion.js');

  const antesTransaccion = intentosDeTransaccion;

  // Sin sesión de cookie ninguna, solo el header Bearer: debe pasar la
  // autenticación (y volver a fallar en el resguardo de la base, como en el
  // caso anterior), no en la comprobación de CSRF.
  await request(app)
    .post('/api/solicitudes-cancelacion')
    .set('Authorization', autorizacion(tokenCliente(42)))
    .send({ idVenta: 1 })
    .expect(500);

  assert.equal(intentosDeTransaccion, antesTransaccion + 1);
});

test('GET /api/usuarios/perfil con sesión por cookie no exige CSRF (no muta nada)', async () => {
  const agente = request.agent(app);

  await agente.post('/api/usuarios/login').send({ email: EMAIL, password: PASSWORD }).expect(200);

  const respuesta = await agente.get('/api/usuarios/perfil').expect(200);
  // Ronda 2: perfil ya no devuelve el payload del token tal cual — hace una
  // consulta fresca e incluye email/nombre/apellido (ver
  // usuario.service.js#obtenerPerfil).
  assert.equal(respuesta.body.email, EMAIL);
  assert.equal(respuesta.body.nombre, CLIENTE.nombre);
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
