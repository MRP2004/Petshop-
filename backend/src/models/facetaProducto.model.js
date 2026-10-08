import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Producto from './producto.model.js';

// Datos opcionales de filtros específicos. Tabla nueva: ningún ALTER sobre
// producto ni cambio en compras ya registradas.
const FacetaProducto = sequelize.define(
  'FacetaProducto',
  {
    idProducto: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: { model: Producto, key: 'idProducto' },
    },
    marca: { type: DataTypes.STRING(50), allowNull: true },
    etapaVida: { type: DataTypes.STRING(20), allowNull: true },
    tamano: { type: DataTypes.STRING(20), allowNull: true },
    condicion: { type: DataTypes.STRING(20), allowNull: true },
    formato: { type: DataTypes.STRING(20), allowNull: true },
    tipoAgua: { type: DataTypes.STRING(20), allowNull: true },
    tipoArena: { type: DataTypes.STRING(20), allowNull: true },
  },
  { tableName: 'facetaproducto', timestamps: false },
);

FacetaProducto.belongsTo(Producto, { foreignKey: 'idProducto', as: 'producto' });
Producto.hasOne(FacetaProducto, { foreignKey: 'idProducto', as: 'facetas' });

export default FacetaProducto;
