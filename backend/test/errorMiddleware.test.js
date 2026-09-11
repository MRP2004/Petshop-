import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidationError,
  ValidationErrorItem,
  UniqueConstraintError,
} from 'sequelize';

import { manejarErrores } from '../src/middlewares/error.middleware.js';

// Res falso mínimo: no depende de Express ni abre ningún socket.
const crearRespuestaFalsa = () => {
  const respuesta = {
    statusCode: null,
    cuerpo: null,
    status(codigo) {
      respuesta.statusCode = codigo;
      return respuesta;
    },
    json(cuerpo) {
      respuesta.cuerpo = cuerpo;
      return respuesta;
    },
  };

  return respuesta;
};

test('un UniqueConstraintError real responde 409, no 400, aunque también sea instancia de ValidationError', () => {
  // Instancia real de Sequelize, sin agregar unique:true a ningún modelo.
  const error = new UniqueConstraintError({
    message: 'Violación de restricción única',
    errors: [
      new ValidationErrorItem(
        'El correo ya está registrado',
        'unique violation',
        'email',
        'a@a.com',
      ),
    ],
  });

  // Confirma la premisa del defecto: la instancia real es, a la vez, un ValidationError.
  assert.ok(error instanceof ValidationError);
  assert.ok(error instanceof UniqueConstraintError);

  const respuesta = crearRespuestaFalsa();

  manejarErrores(error, {}, respuesta, () => {});

  assert.equal(respuesta.statusCode, 409);
  assert.equal(respuesta.cuerpo.error, 'Ya existe un registro con esos datos');
});

test('un ValidationError real que no es UniqueConstraintError sigue respondiendo 400', () => {
  const error = new ValidationError('Error de validación', [
    new ValidationErrorItem(
      'El nombre es obligatorio',
      'validation error',
      'nombre',
      null,
    ),
  ]);

  assert.ok(error instanceof ValidationError);
  assert.ok(!(error instanceof UniqueConstraintError));

  const respuesta = crearRespuestaFalsa();

  manejarErrores(error, {}, respuesta, () => {});

  assert.equal(respuesta.statusCode, 400);
  assert.equal(respuesta.cuerpo.error, 'El nombre es obligatorio');
});
