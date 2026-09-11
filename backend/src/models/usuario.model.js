import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Cliente from './cliente.model.js';

// Tres niveles de acceso (ver docs/backend-autenticacion.md para la matriz
// de permisos completa):
// - cliente: compra y consulta únicamente sus propias ventas.
// - vendedor: gestiona catálogo, stock y ventas de cualquier cliente.
// - administrador: igual que vendedor, además administra cuentas de usuario.
const Usuario = sequelize.define(
  'Usuario',
  {
    idUsuario: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: {
          msg: 'El correo electrónico no es válido',
        },
      },
    },

    // "sal_hex:hash_hex" (ver utils/contrasenas.js). Nunca se guarda ni se
    // expone la contraseña en texto plano.
    contrasenaHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    rol: {
      type: DataTypes.ENUM('cliente', 'vendedor', 'administrador'),
      allowNull: false,
      defaultValue: 'cliente',
    },

    // Obligatorio y único cuando rol = 'cliente' (un usuario cliente
    // representa exactamente a un Cliente); null para vendedor/administrador,
    // que no tienen historial de compras propio.
    idCliente: {
      type: DataTypes.INTEGER,
      allowNull: true,
      unique: true,
    },
  },
  {
    tableName: 'usuario',
    timestamps: false,
  },
);

Usuario.belongsTo(Cliente, {
  foreignKey: 'idCliente',
  as: 'cliente',
});

Cliente.hasOne(Usuario, {
  foreignKey: 'idCliente',
  as: 'usuario',
});

export default Usuario;
