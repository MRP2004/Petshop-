import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Usuario from './usuario.model.js';

// Notificaciones in-app (ronda 2, Etapa 6): tabla nueva, gratis vía
// `sync()` — sin ALTER TABLE sobre ninguna existente, mismo criterio de
// bajo riesgo que `favorito`. `tipo` es STRING (no ENUM de columna): la
// lista de tipos reales vive en aviso.service.js (TIPOS_AVISO) y se valida
// ahí — agregar un tipo nuevo en el futuro no exige otra migración.
const Aviso = sequelize.define(
  'Aviso',
  {
    idAviso: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    idUsuario: { type: DataTypes.INTEGER, allowNull: false },
    tipo: { type: DataTypes.STRING(40), allowNull: false },
    mensaje: { type: DataTypes.STRING(255), allowNull: false },
    // Ruta del frontend (p. ej. "/mis-compras/123"), no una URL completa:
    // el propio panel de avisos decide cómo navegar. Null cuando el aviso
    // no tiene un destino propio para ir a ver.
    enlace: { type: DataTypes.STRING(200), allowNull: true },
    leido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    tableName: 'aviso',
    timestamps: true,
    createdAt: 'creadoEn',
    updatedAt: false,
    indexes: [{ fields: ['idUsuario', 'leido'] }],
  },
);

Aviso.belongsTo(Usuario, { foreignKey: 'idUsuario', as: 'usuario' });
Usuario.hasMany(Aviso, { foreignKey: 'idUsuario', as: 'avisos' });

export default Aviso;
