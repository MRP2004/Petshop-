import Aviso from '../models/aviso.model.js';
import Usuario from '../models/usuario.model.js';
import { MAXIMO_ENTERO_POSITIVO, validarEnteroEnRango } from '../utils/validacion.js';

// Tipos reales generados por esta ronda (ver los puntos de enganche en
// compra.service.js/venta.service.js/solicitudCancelacion.service.js): un
// conjunto cerrado, documentado acá en un solo lugar, no un string libre
// que cada llamador pudiera escribir distinto por error de tipeo.
const TIPOS_AVISO = Object.freeze({
  COMPRA_CONFIRMADA: 'compra_confirmada',
  VENTA_ENVIADA: 'venta_enviada',
  VENTA_LISTA_PARA_RETIRAR: 'venta_lista_para_retirar',
  VENTA_ENTREGADA: 'venta_entregada',
  VENTA_CANCELADA: 'venta_cancelada',
  SOLICITUD_NUEVA: 'solicitud_nueva',
  SOLICITUD_APROBADA: 'solicitud_aprobada',
  SOLICITUD_RECHAZADA: 'solicitud_rechazada',
  VENTA_TIENDA: 'venta_tienda',
});

const validarIdAviso = (idAviso) =>
  validarEnteroEnRango(idAviso, 1, MAXIMO_ENTERO_POSITIVO, 'El ID del aviso no es válido');

// Uso interno exclusivo de otros servicios (nunca expuesto directo por una
// ruta): siempre se llama DENTRO de la misma transacción que la acción de
// negocio que lo origina, para que un aviso nunca quede "huérfano" de una
// operación que en los hechos se revirtió (rollback deshace ambas cosas
// juntas). `enlace` es una ruta del frontend, no una URL completa.
const crearAviso = async ({ idUsuario, tipo, mensaje, enlace = null }, transaction) => {
  await Aviso.create({ idUsuario, tipo, mensaje, enlace }, { transaction });
};

// Variante para un destinatario que puede no tener cuenta con la que
// iniciar sesión: una venta cargada manualmente por el personal puede ser
// de un Cliente sin ningún Usuario asociado (ver usuario.model.js:
// idCliente es único pero opcional) — en ese caso no hay a quién avisar,
// y eso NO es un error, se ignora en silencio.
const notificarClientePorIdCliente = async ({ idCliente, tipo, mensaje, enlace }, transaction) => {
  const usuarioCliente = await Usuario.findOne({ where: { idCliente }, transaction });
  if (!usuarioCliente) return;
  await crearAviso({ idUsuario: usuarioCliente.idUsuario, tipo, mensaje, enlace }, transaction);
};

// "Aviso a personal" (pedido explícito de esta etapa): una fila por cada
// cuenta de vendedor/administrador activa, no una única fila "compartida"
// (así cada uno puede marcar SU copia como leída sin afectar a los demás).
const notificarPersonal = async ({ tipo, mensaje, enlace }, transaction) => {
  const personal = await Usuario.findAll({
    where: { rol: ['vendedor', 'administrador'] },
    transaction,
  });

  for (const cuenta of personal) {
    await crearAviso({ idUsuario: cuenta.idUsuario, tipo, mensaje, enlace }, transaction);
  }
};

// Un aviso por tienda participante de una venta, solo a su dueño. Recibe el
// Map ya deduplicado y validado por disponibilidadTienda.js (nunca deriva
// destinatarios de los productos por su cuenta). El mensaje no incluye
// montos ni productos: el detalle propio se ve en "Mis ventas", que ya
// devuelve solo las líneas y el subtotal de esa tienda.
const notificarTiendasParticipantes = async ({ idVenta, tiendasPorId }, transaction) => {
  for (const tienda of tiendasPorId.values()) {
    await crearAviso(
      {
        idUsuario: tienda.idUsuario,
        tipo: TIPOS_AVISO.VENTA_TIENDA,
        mensaje: `Nueva venta #${idVenta} con productos de tu tienda.`,
        enlace: '/panel/mis-ventas',
      },
      transaction,
    );
  }
};

const listarAvisosPropios = async (idUsuario) =>
  Aviso.findAll({ where: { idUsuario }, order: [['creadoEn', 'DESC']], limit: 50 });

// Idempotente (marcar de nuevo uno ya leído no es un error) y siempre
// acotado al propio usuario — nunca por el body ni por otro parámetro que
// pudiera apuntar al aviso de otra cuenta.
const marcarComoLeido = async (idUsuario, idAvisoCrudo) => {
  const idAviso = validarIdAviso(idAvisoCrudo);
  await Aviso.update({ leido: true }, { where: { idAviso, idUsuario } });
};

const marcarTodosComoLeidos = async (idUsuario) => {
  await Aviso.update({ leido: true }, { where: { idUsuario, leido: false } });
};

export {
  TIPOS_AVISO,
  crearAviso,
  notificarClientePorIdCliente,
  notificarPersonal,
  notificarTiendasParticipantes,
  listarAvisosPropios,
  marcarComoLeido,
  marcarTodosComoLeidos,
};
