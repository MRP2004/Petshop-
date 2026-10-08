import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Categoria from './categoria.model.js';
import TipoMascota from './tipoMascota.model.js';
import Proveedor from './proveedor.model.js';
import Tienda from './tienda.model.js';

const Producto = sequelize.define(
  'Producto',
  {
    idProducto: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    nombre: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },

    descripcion: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },

    precio: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    stockActual: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    stockMinimo: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    idProveedor: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    idTipoMascota: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    idCategoria: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // Ronda 2, Etapa 8 (marketplace): NULL = catálogo de PetShop (todo lo
    // que existe hoy, sin ningún cambio); un valor real = producto propio
    // de un vendedor independiente. Columna nueva NULLABLE (ver
    // backend/scripts/migracionRonda2Etapa8.js) — ninguna fila existente
    // se toca, todas quedan en NULL.
    idTienda: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'producto',
    timestamps: false,
  },
);

Producto.belongsTo(Proveedor, {
  foreignKey: 'idProveedor',
  as: 'proveedor',
});

Proveedor.hasMany(Producto, {
  foreignKey: 'idProveedor',
  as: 'productos',
});

Producto.belongsTo(TipoMascota, {
  foreignKey: 'idTipoMascota',
  as: 'tipoMascota',
});

TipoMascota.hasMany(Producto, {
  foreignKey: 'idTipoMascota',
  as: 'productos',
});

Producto.belongsTo(Categoria, {
  foreignKey: 'idCategoria',
  as: 'categoria',
});

Categoria.hasMany(Producto, {
  foreignKey: 'idCategoria',
  as: 'productos',
});

Producto.belongsTo(Tienda, {
  foreignKey: 'idTienda',
  as: 'tienda',
});

Tienda.hasMany(Producto, {
  foreignKey: 'idTienda',
  as: 'productos',
});

export default Producto;