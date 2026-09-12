import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import {
  registrarUsuario,
  crearUsuarioInterno,
  iniciarSesion,
} from '../src/services/usuario.service.js';
import {
  tokenCliente,
  tokenVendedor,
  tokenAdministrador,
  autorizacion,
} from './ayudaAutenticacion.js';

// Mismo mecanismo de protección que en los otros archivos de "entradas
// inválidas": todos estos casos deben fallar en validación de forma antes de
// tocar la base (prepararCredenciales/prepararDatosCliente validan antes de
// cualquier Usuario.findOne/create o Cliente.create).
const transactionOriginal = sequelize.transaction;
const queryOriginal = sequelize.query;
const getConnectionOriginal = sequelize.connectionManager.getConnection;

let intentosDeTransaccion = 0;
let intentosDeQuery = 0;
let intentosDeConexion = 0;

before(() => {
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
});

after(() => {
  sequelize.transaction = transactionOriginal;
  sequelize.query = queryOriginal;
  sequelize.connectionManager.getConnection = getConnectionOriginal;

  assert.equal(intentosDeTransaccion, 0, 'no debía abrirse una transacción real');
  assert.equal(intentosDeQuery, 0, 'no debía ejecutarse una consulta real');
  assert.equal(intentosDeConexion, 0, 'no debía adquirirse una conexión real');
});

// --- registrarUsuario ---

test('registrarUsuario rechaza cuerpo null', async () => {
  await assert.rejects(
    () => registrarUsuario(null),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo de la solicitud no es válido',
  );
});

test('registrarUsuario rechaza un email inválido', async () => {
  await assert.rejects(
    () => registrarUsuario({ email: 'no-es-un-email', password: '12345678' }),
    (error) => error.statusCode === 400 && error.message === 'El correo electrónico no es válido',
  );
});

test('registrarUsuario rechaza una contraseña demasiado corta', async () => {
  await assert.rejects(
    () => registrarUsuario({ email: 'ana@example.com', password: '123' }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'La contraseña debe tener al menos 8 caracteres',
  );
});

// El registro público reutiliza exactamente la misma validación de Cliente
// que el CRUD administrativo (prepararDatosCliente): un nombre inválido se
// rechaza con el mismo mensaje que crearCliente.
test('registrarUsuario reutiliza la validación de Cliente para nombre/apellido', async () => {
  await assert.rejects(
    () =>
      registrarUsuario({
        email: 'ana@example.com',
        password: '12345678',
        nombre: 'A',
        apellido: 'Pérez',
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El nombre debe contener entre 2 y 50 caracteres',
  );
});

test('registrarUsuario ignora un rol enviado en el cuerpo: nunca se lee ni se usa', async () => {
  // No se puede comprobar el resultado sin tocar la base (el registro válido
  // sí llega a escribir), pero si el código leyera datos.rol en algún punto
  // previo a la validación de Cliente, este caso fallaría de otra forma
  // (p.ej. con un mensaje distinto o sin lanzar). Acá solo se confirma que la
  // ruta de validación sigue siendo la de Cliente, no una rama especial para
  // rol='administrador'.
  await assert.rejects(
    () =>
      registrarUsuario({
        email: 'ana@example.com',
        password: '12345678',
        rol: 'administrador',
        nombre: 'A',
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El nombre debe contener entre 2 y 50 caracteres',
  );
});

// --- crearUsuarioInterno ---

test('crearUsuarioInterno rechaza cuerpo null', async () => {
  await assert.rejects(
    () => crearUsuarioInterno(null),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo de la solicitud no es válido',
  );
});

test("crearUsuarioInterno rechaza un rol que no sea 'vendedor' ni 'administrador'", async () => {
  await assert.rejects(
    () =>
      crearUsuarioInterno({
        email: 'empleado@example.com',
        password: '12345678',
        rol: 'cliente',
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === "El rol debe ser 'vendedor' o 'administrador'",
  );
});

test('crearUsuarioInterno rechaza rol ausente', async () => {
  await assert.rejects(
    () => crearUsuarioInterno({ email: 'empleado@example.com', password: '12345678' }),
    (error) => error.statusCode === 400,
  );
});

// --- iniciarSesion ---

test('iniciarSesion rechaza cuerpo null', async () => {
  await assert.rejects(
    () => iniciarSesion(null),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo de la solicitud no es válido',
  );
});

test('iniciarSesion rechaza un email con formato inválido', async () => {
  await assert.rejects(
    () => iniciarSesion({ email: 'x', password: '12345678' }),
    (error) => error.statusCode === 400 && error.message === 'El correo electrónico no es válido',
  );
});

test('iniciarSesion rechaza una contraseña demasiado corta sin consultar la base', async () => {
  await assert.rejects(
    () => iniciarSesion({ email: 'ana@example.com', password: '123' }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'La contraseña debe tener al menos 8 caracteres',
  );
});

// --- Camino HTTP: registro, login y alta interna ---

test('POST /api/usuarios/registro con email inválido responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/usuarios/registro')
    .send({ email: 'no-es-un-email', password: '12345678', nombre: 'Ana', apellido: 'Pérez' })
    .expect(400);

  assert.equal(respuesta.body.error, 'El correo electrónico no es válido');
});

test('POST /api/usuarios/login con cuerpo vacío responde 400', async () => {
  const respuesta = await request(app).post('/api/usuarios/login').send({}).expect(400);
  assert.equal(respuesta.body.error, 'El correo electrónico no es válido');
});

test('GET /api/usuarios/perfil sin token responde 401', async () => {
  const respuesta = await request(app).get('/api/usuarios/perfil').expect(401);
  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});

test('GET /api/usuarios/perfil con token inválido responde 401', async () => {
  const respuesta = await request(app)
    .get('/api/usuarios/perfil')
    .set('Authorization', 'Bearer token-invalido')
    .expect(401);

  assert.equal(respuesta.body.error, 'La sesión no es válida o expiró');
});

test('GET /api/usuarios/perfil con token válido devuelve lo codificado en el token (sin consultar la base)', async () => {
  const respuesta = await request(app)
    .get('/api/usuarios/perfil')
    .set('Authorization', autorizacion(tokenCliente(7)))
    .expect(200);

  assert.equal(respuesta.body.rol, 'cliente');
  assert.equal(respuesta.body.idCliente, 7);
});

test('POST /api/usuarios (alta interna) sin token responde 401', async () => {
  const respuesta = await request(app).post('/api/usuarios').send({}).expect(401);
  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});

test('POST /api/usuarios con token de vendedor (no administrador) responde 403', async () => {
  const respuesta = await request(app)
    .post('/api/usuarios')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({ email: 'empleado@example.com', password: '12345678', rol: 'vendedor' })
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para realizar esta acción');
});

test('POST /api/usuarios con token de administrador pero rol inválido responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/usuarios')
    .set('Authorization', autorizacion(tokenAdministrador()))
    .send({ email: 'empleado@example.com', password: '12345678', rol: 'cliente' })
    .expect(400);

  assert.equal(respuesta.body.error, "El rol debe ser 'vendedor' o 'administrador'");
});

// --- Aislamiento de clientes: un cliente solo puede ver/editar su propio
// registro (permitirPropioClienteOStaff), sin llegar a consultar la base ---

test('GET /api/clientes/:id con token de un cliente distinto responde 403', async () => {
  const respuesta = await request(app)
    .get('/api/clientes/99')
    .set('Authorization', autorizacion(tokenCliente(5)))
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para realizar esta acción');
});

test('GET /api/clientes (listado completo) con token de cliente responde 403', async () => {
  const respuesta = await request(app)
    .get('/api/clientes')
    .set('Authorization', autorizacion(tokenCliente(5)))
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para realizar esta acción');
});
