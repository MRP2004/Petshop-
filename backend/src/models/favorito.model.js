import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Cliente from './cliente.model.js';
import Producto from './producto.model.js';

// Favoritos persistentes por cuenta (ronda 2, ver docs/frontend-diseno.md):
// tabla NUEVA, gratis vía sync() (mismo motivo de siempre: no tocar
// tablas existentes). `idFavorito` autoincremental propio (no compone la
// PK con idCliente+idProducto directamente) para poder borrar por su
// propio id de forma simple desde el service, pero el índice único
// `idCliente+idProducto` es lo que de verdad impide duplicados —
// "control de duplicados" es una restricción real de la base, no solo
// una validación del lado de la aplicación que se pudiera saltear con dos
// pedidos concurrentes.
const Favorito = sequelize.define(
  'Favorito',
  {
    idFavorito: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    idCliente: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    idProducto: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'favorito',
    // Solo creadoEn (nunca se edita un favorito, se borra y listo): mismo
    // criterio que direccionCliente.model.js para no dejar que Sequelize
    // cree un updatedAt que no hace falta.
    timestamps: true,
    createdAt: 'creadoEn',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['idCliente', 'idProducto'],
      },
    ],
  },
);

Favorito.belongsTo(Cliente, { foreignKey: 'idCliente', as: 'cliente' });
Cliente.hasMany(Favorito, { foreignKey: 'idCliente', as: 'favoritos' });

Favorito.belongsTo(Producto, { foreignKey: 'idProducto', as: 'producto' });
Producto.hasMany(Favorito, { foreignKey: 'idProducto', as: 'favoritosDe' });

export default Favorito;
