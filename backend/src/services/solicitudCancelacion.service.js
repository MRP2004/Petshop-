import sequelize from '../config/database.js';
import Venta from '../models/venta.model.js';
import SolicitudCancelacion from '../models/solicitudCancelacion.model.js';
import AppError from '../errors/AppError.js';
import { validarEnteroPositivo } from '../utils/ventaValidaciones.js';
import { ejecutarCancelacionTransaccional, obtenerVentaPorId } from './venta.service.js';
import { notificarPersonal, notificarClientePorIdCliente, TIPOS_AVISO } from './aviso.service.js';
import { esCompradorRegistrado, esPersonalInterno } from '../utils/roles.js';

// Solicitud de cancelación del cliente sobre su propia compra (CU-04,
// corrección — revisión de Mauro sobre la venta #20): NO modifica la venta,
// el pago ni el stock — solo deja registrada la intención, para que el
// personal la apruebe o la rechace (ver resolverSolicitudCancelacion, más
// abajo). Distinta de una devolución de un pedido ya entregado: esta acción
// exige que la venta siga 'registrada' (ver docs/cu04-checkout-pago.md,
// "Solicitud de cancelación vs. devolución").
const solicitarCancelacion = async (idVentaCrudo, usuario) => {
  // Ronda 2, Etapa 8 (marketplace): un vendedor independiente sigue siendo
  // comprador (conserva su propio idCliente, ver usuario.model.js) — puede
  // solicitar la cancelación de SUS PROPIAS compras igual que cualquier
  // cliente. Corrección de diseño tras la revisión de Codex: antes esto
  // era `rol !== 'cliente'`, una negación que un rol nuevo distinto no
  // rompía por sí sola, pero que tampoco reconocía al nuevo rol como
  // comprador legítimo.
  if (!esCompradorRegistrado(usuario?.rol)) {
    throw new AppError('Solo un cliente puede solicitar la cancelación de su propia compra', 403);
  }

  const idVenta = validarEnteroPositivo(idVentaCrudo, 'El ID de la venta no es válido');

  await sequelize.transaction(async (transaction) => {
    // Mismo punto de serialización que cancelarVenta/marcarVentaComoEnviada
    // (bloquear la fila de Venta, ver venta.service.js): una solicitud
    // concurrente con una cancelación directa o un envío del personal sobre
    // la MISMA venta queda serializada acá, no es una carrera — quien llega
    // segundo vuelve a leer el estado ya actualizado por el primero.
    const venta = await Venta.findByPk(idVenta, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!venta) {
      throw new AppError('Venta no encontrada', 404);
    }

    if (venta.idCliente !== usuario.idCliente) {
      throw new AppError('No tiene permisos para solicitar la cancelación de esta venta', 403);
    }

    if (venta.estado !== 'registrada') {
      throw new AppError(
        'Solo se puede solicitar la cancelación de una compra registrada',
        409,
      );
    }

    // Sin solicitudes duplicadas (CU-04, corrección): al estar ya
    // serializado por el lock de arriba, este SELECT ve cualquier solicitud
    // pendiente que otra transacción concurrente ya haya comiteado, sin
    // necesitar su propio lock.
    const solicitudPendiente = await SolicitudCancelacion.findOne({
      where: { idVenta, estado: 'pendiente' },
      transaction,
    });

    if (solicitudPendiente) {
      throw new AppError(
        'Ya existe una solicitud de cancelación pendiente para esta compra',
        409,
      );
    }

    await SolicitudCancelacion.create({ idVenta }, { transaction });

    // Aviso in-app (ronda 2, Etapa 6): "aviso a personal" del pedido — una
    // fila por cada cuenta de vendedor/administrador, dentro de la misma
    // transacción que crea la solicitud.
    await notificarPersonal(
      {
        tipo: TIPOS_AVISO.SOLICITUD_NUEVA,
        mensaje: `Nueva solicitud de cancelación para la venta #${idVenta}.`,
        enlace: `/panel/ventas/${idVenta}`,
      },
      transaction,
    );
  });

  return obtenerVentaPorId(idVenta, usuario);
};

// Aprueba o rechaza una solicitud pendiente (CU-04, corrección): exclusivo
// de vendedor/administrador (ver solicitudCancelacion.routes.js, que además
// exige el rol en la ruta — defensa en profundidad, mismo criterio que
// cancelarVenta). Al aprobar, reutiliza EXACTAMENTE la misma cancelación
// transaccional que la cancelación directa del personal — nunca una lógica
// paralela que pudiera divergir (restitución de stock, reversión de pago).
const resolverSolicitudCancelacion = async (idSolicitudCrudo, decision, usuario, motivoRechazo) => {
  if (!esPersonalInterno(usuario?.rol)) {
    throw new AppError('No tiene permisos para resolver solicitudes de cancelación', 403);
  }

  if (decision !== 'aprobar' && decision !== 'rechazar') {
    throw new AppError('La decisión debe ser "aprobar" o "rechazar"', 400);
  }

  const idSolicitud = validarEnteroPositivo(idSolicitudCrudo, 'El ID de la solicitud no es válido');
  let idVenta;

  await sequelize.transaction(async (transaction) => {
    const solicitud = await SolicitudCancelacion.findByPk(idSolicitud, { transaction });

    if (!solicitud) {
      throw new AppError('Solicitud de cancelación no encontrada', 404);
    }

    idVenta = solicitud.idVenta;

    // Orden fijo de locks (mismo criterio documentado en compra.service.js):
    // la Venta primero (el mismo punto de serialización que cancelarVenta/
    // marcarVentaComoEnviada/solicitarCancelacion), la propia solicitud
    // después — así una aprobación concurrente con una cancelación directa
    // o un envío del personal sobre la MISMA venta queda serializada, nunca
    // es una carrera.
    const venta = await Venta.findByPk(idVenta, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!venta) {
      throw new AppError('Venta no encontrada', 404);
    }

    const solicitudBloqueada = await SolicitudCancelacion.findByPk(idSolicitud, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    // Decisiones repetidas (CU-04, corrección): una solicitud ya resuelta
    // (por otra transacción que ganó la carrera, o por una llamada anterior)
    // nunca vuelve a decidirse.
    if (solicitudBloqueada.estado !== 'pendiente') {
      throw new AppError('Esta solicitud ya fue resuelta', 409);
    }

    if (decision === 'aprobar') {
      if (venta.estado !== 'registrada') {
        // La venta cambió de estado desde que se pidió la solicitud (por
        // ejemplo, el personal ya la había cancelado o marcado como
        // enviada directamente, sin pasar por esta solicitud).
        throw new AppError(
          'La venta ya no está en un estado que permita cancelarla (puede haber sido enviada o cancelada antes)',
          409,
        );
      }

      await ejecutarCancelacionTransaccional(venta, transaction);

      await solicitudBloqueada.update(
        {
          estado: 'aprobada',
          resueltoEn: new Date(),
          idUsuarioResolvio: usuario.idUsuario,
        },
        { transaction },
      );

      await notificarClientePorIdCliente(
        {
          idCliente: venta.idCliente,
          tipo: TIPOS_AVISO.SOLICITUD_APROBADA,
          mensaje: `Tu solicitud de cancelación para la compra #${venta.idVenta} fue aprobada.`,
          enlace: `/mis-compras/${venta.idVenta}`,
        },
        transaction,
      );
    } else {
      await solicitudBloqueada.update(
        {
          estado: 'rechazada',
          resueltoEn: new Date(),
          idUsuarioResolvio: usuario.idUsuario,
          motivoRechazo: motivoRechazo || null,
        },
        { transaction },
      );

      await notificarClientePorIdCliente(
        {
          idCliente: venta.idCliente,
          tipo: TIPOS_AVISO.SOLICITUD_RECHAZADA,
          mensaje: motivoRechazo
            ? `Tu solicitud de cancelación para la compra #${venta.idVenta} fue rechazada: ${motivoRechazo}`
            : `Tu solicitud de cancelación para la compra #${venta.idVenta} fue rechazada.`,
          enlace: `/mis-compras/${venta.idVenta}`,
        },
        transaction,
      );
    }
  });

  return obtenerVentaPorId(idVenta, usuario);
};

export { solicitarCancelacion, resolverSolicitudCancelacion };
