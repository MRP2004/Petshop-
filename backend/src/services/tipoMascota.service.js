import TipoMascota from '../models/tipoMascota.model.js';
import JerarquiaMascota from '../models/jerarquiaMascota.model.js';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import AppError from '../errors/AppError.js';
import {
  MAXIMO_ENTERO_POSITIVO,
  esObjetoPlano,
  validarEnteroEnRango,
  limpiarCadenaOpcional,
} from '../utils/validacion.js';

const validarId = (id) =>
  validarEnteroEnRango(
    id,
    1,
    MAXIMO_ENTERO_POSITIVO,
    'El ID debe ser un número entero positivo',
  );

const validarDatos = (datos) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError('El cuerpo del tipo de mascota no es válido', 400);
  }

  const nombre =
    typeof datos.nombre === 'string' ? datos.nombre.trim() : '';

  const descripcion = limpiarCadenaOpcional(
    datos.descripcion,
    'La descripción',
  );

  if (nombre.length < 2 || nombre.length > 50) {
    throw new AppError(
      'El nombre debe contener entre 2 y 50 caracteres',
      400,
    );
  }

  if (descripcion && descripcion.length > 150) {
    throw new AppError(
      'La descripción no puede superar los 150 caracteres',
      400,
    );
  }

  return {
    nombre,
    descripcion: descripcion || null,
  };
};

export const obtenerTiposMascota = async () => {
  return TipoMascota.findAll({
    order: [['nombre', 'ASC']],
  });
};

export const obtenerTipoMascotaPorId = async (id) => {
  const idNumerico = validarId(id);
  const tipoMascota = await TipoMascota.findByPk(idNumerico);

  if (!tipoMascota) {
    throw new AppError('Tipo de mascota no encontrado', 404);
  }

  return tipoMascota;
};

export const crearTipoMascota = async (datos) => {
  const datosValidados = validarDatos(datos);

  return TipoMascota.create(datosValidados);
};

export const actualizarTipoMascota = async (id, datos) => {
  const datosValidados = validarDatos(datos);
  const tipoMascota = await obtenerTipoMascotaPorId(id);

  return tipoMascota.update(datosValidados);
};

export const eliminarTipoMascota = async (id) => {
  const tipoMascota = await obtenerTipoMascotaPorId(id);
  await sequelize.transaction(async (transaction) => {
    const hijos = await JerarquiaMascota.count({
      where: { idTipoPadre: tipoMascota.idTipoMascota }, transaction,
    });
    if (hijos > 0) {
      throw new AppError('El tipo tiene subtipos: eliminá primero sus subtipos', 409);
    }
    await JerarquiaMascota.destroy({
      where: { [Op.or]: [
        { idTipoPadre: tipoMascota.idTipoMascota },
        { idTipoHijo: tipoMascota.idTipoMascota },
      ] }, transaction,
    });
    await tipoMascota.destroy({ transaction });
  });
};

export const obtenerJerarquiaMascotas = async () => {
  const [tipos, relaciones] = await Promise.all([
    TipoMascota.findAll({ order: [['nombre', 'ASC']], raw: true }),
    JerarquiaMascota.findAll({ raw: true }),
  ]);
  const porId = new Map(tipos.map((tipo) => [tipo.idTipoMascota, tipo]));
  const hijos = new Set(relaciones.map((relacion) => relacion.idTipoHijo));
  return tipos.filter((tipo) => !hijos.has(tipo.idTipoMascota)).map((tipo) => ({
    ...tipo,
    subtipos: relaciones
      .filter((relacion) => relacion.idTipoPadre === tipo.idTipoMascota)
      .map((relacion) => porId.get(relacion.idTipoHijo))
      .filter(Boolean)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  }));
};
