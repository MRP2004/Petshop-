import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Cliente from './cliente.model.js';

// Dirección argentina estructurada del cliente (ronda 2, ver
// docs/frontend-diseno.md y docs/estado-proyecto.md, revisión de diseño de
// Codex antes de escribir este modelo). Tabla NUEVA, no columnas agregadas
// a `cliente` (mismo motivo que direccionEntrega/imagenProducto: sync()
// crea tablas nuevas sin tocar las existentes; agregar columnas a una
// tabla ya creada necesitaría una migración manual — ver
// docs/backend-base-de-datos.md). `cliente.direccion` (el campo libre
// viejo) NO se toca ni se migra.
//
// `idCliente` es la propia PK (no un id autoincremental aparte, 1:1, mismo
// patrón que `pago.idVenta`): un cliente tiene como máximo UNA dirección
// guardada en esta ronda. "Permitir corregir o elegir otra" en el checkout
// se resuelve dejando editar a mano el texto de esa compra puntual (ver
// Checkout.jsx), no con una lista de direcciones guardadas — decisión
// revisada y confirmada con Codex antes de modelar esto.
//
// `idProvincia`/`idLocalidad` son los códigos reales de Georef, resource
// `/api/localidades` (NO `/api/localidades-censales` — decisión explícita,
// ver georef.service.js): confirmado contra la API real que los ids de
// `/localidades` van de 8 a 11 dígitos según la provincia, STRING(20)
// sobra con margen. `provincia`/`localidad` (nombre legible) son una copia
// desnormalizada para no depender de otra consulta a Georef solo para
// mostrar la dirección ya guardada.
const DireccionCliente = sequelize.define(
  'DireccionCliente',
  {
    idCliente: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },

    idProvincia: {
      type: DataTypes.STRING(2),
      allowNull: false,
    },

    provincia: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },

    idLocalidad: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },

    localidad: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },

    calle: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },

    numero: {
      // String, no integer: hay direcciones reales "S/N" o con letras
      // (ej. "1234 bis").
      type: DataTypes.STRING(20),
      allowNull: false,
    },

    piso: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    indicaciones: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
  },
  {
    tableName: 'direccioncliente',
    // Solo actualizadoEn, sin createdAt (revisión de Codex: evitar que
    // Sequelize cree columnas de timestamp que no hacen falta).
    timestamps: true,
    createdAt: false,
    updatedAt: 'actualizadoEn',
  },
);

DireccionCliente.belongsTo(Cliente, {
  foreignKey: 'idCliente',
  as: 'cliente',
});

// as: 'direccionEstructurada', no 'direccion': Cliente ya tiene una
// columna propia llamada `direccion` (el campo libre viejo, sin tocar) —
// Sequelize rechaza el alias 'direccion' acá por colisionar con esa
// columna ("Naming collision between attribute and association").
Cliente.hasOne(DireccionCliente, {
  foreignKey: 'idCliente',
  as: 'direccionEstructurada',
});

export default DireccionCliente;
