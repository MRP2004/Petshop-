import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Usuario from './usuario.model.js';

// Solicitud "Quiero ser vendedor" (ronda 2, Etapa 8): tabla NUEVA, gratis
// vía sync(). El solicitante es una cuenta 'cliente' YA EXISTENTE (no se
// inventa un registro separado — ver docs/estado-proyecto.md, "Corrección
// de diseño" tras la revisión de Codex). Dos alias distintos hacia
// Usuario, a pedido explícito de Codex: `usuario` (quien solicita) y
// `resolutor` (el administrador que aprobó/rechazó, null mientras esté
// pendiente).
const SolicitudVendedor = sequelize.define(
  'SolicitudVendedor',
  {
    idSolicitud: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    idUsuario: { type: DataTypes.INTEGER, allowNull: false },
    nombreTienda: { type: DataTypes.STRING(80), allowNull: false },
    tipoDocumento: { type: DataTypes.STRING(4), allowNull: false },
    numeroDocumento: { type: DataTypes.STRING(20), allowNull: false },
    razonSocial: { type: DataTypes.STRING(150), allowNull: true },
    // 'pendiente' | 'aprobada' | 'rechazada'.
    estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pendiente' },
    motivoRechazo: { type: DataTypes.STRING(300), allowNull: true },
    resueltoEn: { type: DataTypes.DATE, allowNull: true },
    idUsuarioResolvio: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    tableName: 'solicitudvendedor',
    timestamps: true,
    createdAt: 'creadoEn',
    updatedAt: false,
  },
);

SolicitudVendedor.belongsTo(Usuario, { foreignKey: 'idUsuario', as: 'usuario' });
Usuario.hasMany(SolicitudVendedor, { foreignKey: 'idUsuario', as: 'solicitudesVendedor' });

SolicitudVendedor.belongsTo(Usuario, { foreignKey: 'idUsuarioResolvio', as: 'resolutor' });

export default SolicitudVendedor;
