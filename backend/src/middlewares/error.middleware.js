import {
  ValidationError,
  ForeignKeyConstraintError,
  UniqueConstraintError,
} from 'sequelize';

const rutaNoEncontrada = (req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
  });
};

const manejarErrores = (error, req, res, next) => {
  if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    'body' in error
  ) {
    return res.status(400).json({
      error: 'El cuerpo JSON de la solicitud no es válido',
    });
  }

  if (error instanceof ValidationError) {
    return res.status(400).json({
      error:
        error.errors[0]?.message ||
        'Los datos enviados no son válidos',
    });
  }

  if (error instanceof UniqueConstraintError) {
    return res.status(409).json({
      error: 'Ya existe un registro con esos datos',
    });
  }

  if (error instanceof ForeignKeyConstraintError) {
    return res.status(409).json({
      error:
        'No se puede completar la operación porque el registro está siendo utilizado',
    });
  }

  const statusCode = error.statusCode || 500;

  if (statusCode === 500) {
    console.error(error);
  }

  return res.status(statusCode).json({
    error:
      statusCode === 500
        ? 'Error interno del servidor'
        : error.message,
  });
};

export {
  rutaNoEncontrada,
  manejarErrores,
};