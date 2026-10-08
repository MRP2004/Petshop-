import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Venta from './venta.model.js';

// Comprobante de una venta (CU-04): número único y estado del envío por
// correo. Tabla nueva 1 a 1 con Venta, mismo motivo que pago.model.js (ver
// ahí). Se crea junto con la Venta dentro de la misma transacción
// (compra.service.js) — toda venta confirmada por el checkout tiene
// comprobante; una venta cargada manualmente por el personal, no (esa sigue
// mostrándose igual que siempre, sin número de comprobante).
const Comprobante = sequelize.define(
  'Comprobante',
  {
    idVenta: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },

    // Formato "PS-<año>-<idVenta con 6 dígitos>" (ver
    // compra.service.js#generarNumeroComprobante). Al derivarse de idVenta
    // (ya único por ser clave primaria autoincremental) no hace falta ningún
    // contador ni manejo de colisión aparte.
    numero: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },

    // Estados reales y distinguibles del envío (CU-04, ronda de correcciones
    // — antes 'enviado' se usaba tanto para un envío real aceptado por SMTP
    // como para un mensaje armado en memoria por el transporte de prueba, lo
    // que la interfaz mostraba como "enviado" sin haberlo estado nunca de
    // verdad, ver correo.service.js):
    //   'pendiente'      — fila recién creada, todavía no se intentó enviar.
    //   'simulado'       — se generó el mensaje con el transporte de prueba
    //                      (CORREO_TRANSPORTE=prueba, explícito): nunca hubo
    //                      un intento de envío real.
    //   'no_configurado' — no hay SMTP_HOST y tampoco se pidió modo de
    //                      prueba: el servicio de correo no está habilitado
    //                      en este entorno (p. ej. desarrollo local sin
    //                      configurar).
    //   'aceptado'       — un servidor SMTP real aceptó el mensaje; NO
    //                      garantiza que haya llegado a la casilla del
    //                      destinatario, solo que el servidor lo recibió.
    //   'fallido'        — error de envío, tiempo de espera agotado, o
    //                      rechazo explícito del destinatario por el
    //                      servidor SMTP. Un tiempo agotado no es certeza de
    //                      que nunca se envió, solo el estado más honesto
    //                      disponible sin agregar un estado "incierto" aparte.
    //   'no_aplica'      — el cliente no tiene correo electrónico cargado.
    // Una falla de correo (cualquiera de los estados de arriba salvo
    // 'aceptado') NUNCA revierte la venta ya confirmada.
    estadoCorreo: {
      type: DataTypes.ENUM(
        'pendiente',
        'simulado',
        'no_configurado',
        'aceptado',
        'fallido',
        'no_aplica',
      ),
      allowNull: false,
      defaultValue: 'pendiente',
    },

    intentosEnvioCorreo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    generadoEn: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    // Instantánea del comprador al momento de confirmar la compra (CU-04,
    // ronda de correcciones): antes, el PDF y el correo leían
    // venta.cliente.nombre/apellido/email, el dato ACTUAL y editable del
    // cliente — modificar el perfil después de comprar cambiaba lo que
    // mostraba un comprobante ya emitido. Se completan una sola vez, dentro
    // de la misma transacción que crea la venta (compra.service.js), y no
    // se vuelven a tocar. NULL en comprobantes emitidos antes de este
    // cambio: no se reconstruye un valor histórico que nunca se guardó (ver
    // comprobantePdf.service.js/correo.service.js, que usan el dato actual
    // del cliente como respaldo SOLO en ese caso, con una nota explícita).
    nombreCompradorHistorico: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    apellidoCompradorHistorico: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    correoCompradorHistorico: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    tableName: 'comprobante',
    timestamps: false,
  },
);

Comprobante.belongsTo(Venta, {
  foreignKey: 'idVenta',
  as: 'venta',
});

Venta.hasOne(Comprobante, {
  foreignKey: 'idVenta',
  as: 'comprobante',
});

export default Comprobante;
