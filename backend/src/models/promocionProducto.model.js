import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Producto from './producto.model.js';
import Categoria from './categoria.model.js';

// Coincide exactamente con la tabla `promocionproducto` que ya existía en
// la base de desarrollo (huérfana: sin modelo/servicio/ruta previos, ver
// docs/backend-base-de-datos.md). Se reutiliza esa tabla en vez de crear una
// nueva, para no dejar dos esquemas de promoción distintos conviviendo.
//
// Esta etapa SOLO agrega el CRUD (alcance mínimo comprometido en
// proposal.md). Las reglas de negocio (si "descuento" es porcentual, cómo
// interactúa con el descuento manual de Venta, qué pasa si se superponen dos
// promociones vigentes) todavía no las confirmó Mauro: por eso ninguna
// promoción se aplica todavía de forma automática al registrar una venta.
// Ver docs/estado-proyecto.md para la propuesta concreta pendiente de
// confirmación.
const PromocionProducto = sequelize.define(
  'PromocionProducto',
  {
    idPromocionProducto: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    fechaInicio: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    fechaFin: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    descuento: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },

    idProducto: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    // Opcional: en la tabla original convive con idProducto obligatorio (no
    // es una alternativa "producto O categoría"). Su significado exacto
    // también queda pendiente de confirmación.
    idCategoria: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'promocionproducto',
    timestamps: false,
  },
);

PromocionProducto.belongsTo(Producto, {
  foreignKey: 'idProducto',
  as: 'producto',
});

Producto.hasMany(PromocionProducto, {
  foreignKey: 'idProducto',
  as: 'promociones',
});

PromocionProducto.belongsTo(Categoria, {
  foreignKey: 'idCategoria',
  as: 'categoria',
});

Categoria.hasMany(PromocionProducto, {
  foreignKey: 'idCategoria',
  as: 'promociones',
});

export default PromocionProducto;
