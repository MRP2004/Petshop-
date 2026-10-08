import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Usuario from './usuario.model.js';

// Tienda de un vendedor independiente (ronda 2, Etapa 8 — marketplace):
// tabla NUEVA, gratis vía sync() — sin ALTER TABLE. Diseño de esquema
// revisado con Codex antes de escribir esto (ver docs/estado-proyecto.md).
// `idUsuario` es único: un dueño, una tienda (no hay "equipos" de
// vendedores compartiendo una tienda en este alcance). `tipoDocumento`/
// `estado` son STRING validados en la capa de aplicación (no ENUM de
// columna), mismo criterio que `favorito`/`aviso`: agregar un valor nuevo
// no exige otra migración.
const Tienda = sequelize.define(
  'Tienda',
  {
    idTienda: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    idUsuario: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    nombre: { type: DataTypes.STRING(80), allowNull: false },
    // 'CUIL' (persona física) o 'CUIT' (empresa) — validado en el servicio.
    tipoDocumento: { type: DataTypes.STRING(4), allowNull: false },
    // Normalizado (sin puntos/guiones/espacios) antes de persistir — ver
    // utils/validacionFiscal.js.
    numeroDocumento: { type: DataTypes.STRING(20), allowNull: false },
    // Solo aplica cuando tipoDocumento='CUIT' (empresa); null para CUIL.
    razonSocial: { type: DataTypes.STRING(150), allowNull: true },
    // 'activa' | 'suspendida' — un administrador puede suspenderla; el
    // backend lo hace cumplir de verdad en las escrituras de producto (no
    // es un campo decorativo, ver producto.service.js).
    estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'activa' },
  },
  {
    tableName: 'tienda',
    timestamps: true,
    createdAt: 'creadoEn',
    updatedAt: false,
  },
);

Tienda.belongsTo(Usuario, { foreignKey: 'idUsuario', as: 'usuario' });
Usuario.hasOne(Tienda, { foreignKey: 'idUsuario', as: 'tienda' });

export default Tienda;
