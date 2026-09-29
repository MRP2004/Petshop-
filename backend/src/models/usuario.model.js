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

    // Ronda 2, Etapa 8 (marketplace): 'vendedor_independiente' agregado al
    // final, ampliación aditiva del ENUM (ver
    // backend/scripts/migracionRonda2Etapa8.js) — ninguna cuenta con
    // rol='vendedor' cambia de significado ni de nivel de acceso; ese rol
    // sigue significando personal interno con acceso global. Un vendedor
    // independiente es una cuenta 'cliente' que fue aprobada para vender
    // (ver tienda.service.js#resolverSolicitudVendedor) — a diferencia de
    // vendedor/administrador, SÍ conserva su propio idCliente (ver más
    // abajo): sigue siendo comprador además de vendedor.
    rol: {
      type: DataTypes.ENUM('cliente', 'vendedor', 'administrador', 'vendedor_independiente'),
      allowNull: false,
      defaultValue: 'cliente',
    },

    // Obligatorio y único cuando rol = 'cliente' o 'vendedor_independiente'
    // (las dos formas de "esta cuenta también compra"); null para
    // vendedor/administrador (personal interno, sin historial de compras
    // propio).
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
