import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import Venta from '../models/venta.model.js';
import DetalleVenta from '../models/detalleVenta.model.js';
import Cliente from '../models/cliente.model.js';
import MedioPago from '../models/medioPago.model.js';
import Producto from '../models/producto.model.js';
import DireccionEntrega from '../models/direccionEntrega.model.js';
import Pago from '../models/pago.model.js';
import Comprobante from '../models/comprobante.model.js';
import DetalleVentaPromocion from '../models/detalleVentaPromocion.model.js';
import SolicitudCancelacion from '../models/solicitudCancelacion.model.js';
import AppError from '../errors/AppError.js';
import { notificarClientePorIdCliente, notificarTiendasParticipantes, TIPOS_AVISO } from './aviso.service.js';
import { cotizar } from './cotizacion.service.js';
import { prepararEnteroOpcional } from '../utils/validacion.js';
import {
  MAXIMO_ENTERO_POSITIVO,
  esObjetoPlano,
  validarEnteroPositivo,
  prepararImporteOpcional,
  calcularTotalCentavos,
  prepararDetalles,
  prepararEntrega,
  esPropiaOPersonal,
} from '../utils/ventaValidaciones.js';
import { esPersonalInterno, esCompradorRegistrado } from '../utils/roles.js';

// Interpretación propuesta (pendiente de confirmación de Mauro, ver
// docs/estado-proyecto.md): "ventas por proveedor" son las que incluyen al
// menos un producto de ese proveedor, ya que Venta no tiene una relación
// directa con Proveedor (una misma venta puede mezclar productos de varios).
const obtenerIdsVentaPorProveedor = async (idProveedor) => {
  const filas = await DetalleVenta.findAll({
    attributes: [
      [sequelize.fn('DISTINCT', sequelize.col('DetalleVenta.idVenta')), 'idVenta'],
    ],
    include: [
      {
        model: Producto,
        as: 'producto',
        attributes: [],
        where: { idProveedor },
      },
    ],
    raw: true,
  });

  return filas.map((fila) => fila.idVenta);
};

// pago/comprobante (CU-04) son opcionales: solo existen para ventas creadas
// por el checkout con pago simulado (compra.service.js), no para las
// cargadas manualmente por el personal (registrarVenta, más abajo) ni para
// ventas anteriores a esta etapa — VentaDetalle.jsx (frontend) decide qué
// mostrar según si vienen presentes o no, nunca simula un pago que no
// existió.
const relacionesVenta = [
  {
    model: Cliente,
    as: 'cliente',
  },
  {
    model: MedioPago,
    as: 'medioPago',
  },
  {
    model: DetalleVenta,
    as: 'detalles',
    include: [
      {
        model: Producto,
        as: 'producto',
      },
      {
        model: DetalleVentaPromocion,
        as: 'promocionAplicada',
        required: false,
      },
    ],
  },
  {
    model: DireccionEntrega,
    as: 'direccionEntrega',
    required: false, // solo existe cuando metodoEntrega es "envío a domicilio"
  },
  {
    model: Pago,
    as: 'pago',
    required: false,
  },
  {
    model: Comprobante,
    as: 'comprobante',
    required: false,
  },
  {
    // Historial de solicitudes de cancelación del cliente (CU-04,
    // corrección — "quede registrada para que vendedor o administrador
    // pueda verla"): casi siempre vacío o con una sola fila; se incluye
    // completo (no solo la pendiente) para que la pantalla también pueda
    // mostrar una ya rechazada, en vez de una segunda consulta aparte.
    model: SolicitudCancelacion,
    as: 'solicitudesCancelacion',
    required: false,
  },
];

// filtros: { idCliente, idProveedor } (query string, solo para personal; un
// cliente autenticado siempre ve únicamente las suyas, sin importar lo que
// mande en la query).
const obtenerVentas = async (usuario, filtros = {}) => {
  const where = {};

  // Ronda 2, Etapa 8: un vendedor independiente ve sus PROPIAS compras acá
  // (sigue siendo comprador) — nunca las ventas de su tienda como vendedor,
  // que es un acceso deliberadamente distinto y más restringido (ver
  // tienda.service.js#listarVentasDeTienda). Corrección de diseño tras la
  // revisión de Codex: antes esto era un `if (rol === 'cliente') {...} else
  // {...}` donde el "else" asumía sin decirlo que cualquier otro rol era
  // personal interno — un vendedor independiente hubiera caído ahí y visto
  // TODAS las ventas de TODOS los clientes.
  if (esCompradorRegistrado(usuario?.rol)) {
    where.idCliente = usuario.idCliente;
  } else if (esPersonalInterno(usuario?.rol)) {
    const idClienteFiltro = prepararEnteroOpcional(
      filtros.idCliente,
      1,
      MAXIMO_ENTERO_POSITIVO,
      'El ID de cliente del filtro no es válido',
    );

    if (idClienteFiltro !== null) {
      where.idCliente = idClienteFiltro;
    }

    const idProveedorFiltro = prepararEnteroOpcional(
      filtros.idProveedor,
      1,
      MAXIMO_ENTERO_POSITIVO,
      'El ID de proveedor del filtro no es válido',
    );

    if (idProveedorFiltro !== null) {
      const idsVenta = await obtenerIdsVentaPorProveedor(idProveedorFiltro);

      if (idsVenta.length === 0) {
        return [];
      }

      where.idVenta = { [Op.in]: idsVenta };
    }
  } else {
    // Ni comprador registrado ni personal interno (rol desconocido, o
    // ausente): denegado explícitamente, nunca "sin filtro" — evita que un
    // rol nuevo que se agregue en el futuro y se olvide de contemplar acá
    // termine viendo todas las ventas de todos los clientes por omisión.
    throw new AppError('No tiene permisos para ver ventas', 403);
  }

  return Venta.findAll({
    where,
    include: relacionesVenta,
    order: [['fecha', 'DESC']],
  });
};

const obtenerVentaPorId = async (id, usuario) => {
  const idVenta = validarEnteroPositivo(
    id,
    'El ID de la venta no es válido',
  );

  const venta = await Venta.findByPk(idVenta, {
    include: relacionesVenta,
  });

  if (!venta) {
    throw new AppError('Venta no encontrada', 404);
  }

  // usuario es opcional: obtenerVentaPorId también se usa internamente (p.
  // ej. al final de registrarVenta/cancelarVenta) para releer el registro ya
  // autorizado, sin repetir el chequeo de pertenencia.
  if (usuario && !esPropiaOPersonal(usuario, venta.idCliente)) {
    throw new AppError('No tiene permisos para ver esta venta', 403);
  }

  return venta;
};

const registrarVenta = async (datos, usuario) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError('El cuerpo de la venta no es válido', 400);
  }

  // Un comprador autenticado ('cliente' o 'vendedor_independiente', que
  // sigue siendo comprador) compra siempre para sí mismo: el idCliente se
  // deriva de la sesión, nunca del cuerpo de la solicitud (evita que
  // modificando idCliente en el JSON se pueda comprar "como" otro cliente).
  // El personal, en cambio, elige el cliente al cargar una venta manual.
  // En la práctica, esta rama de "comprador" es inalcanzable desde la ruta
  // HTTP real (POST /api/ventas exige rol vendedor/administrador, ver
  // venta.routes.js) — se mantiene igual como defensa en profundidad.
  const idCliente = esCompradorRegistrado(usuario?.rol)
    ? usuario.idCliente
    : validarEnteroPositivo(
        datos.idCliente,
        'El ID del cliente no es válido',
      );

  const idMedioPago = validarEnteroPositivo(
    datos.idMedioPago,
    'El ID del medio de pago no es válido',
  );

  const detallesPreparados = prepararDetalles(datos.detalles);

  const { metodoEntrega, direccionEntrega } = prepararEntrega(datos);

  // Campos comerciales internos: solo el personal puede fijar un descuento
  // manual o un mínimo mayorista. Antes se leían de `datos` sin importar
  // quién hiciera la solicitud, así que un cliente podía mandar
  // `descuento` igual al subtotal y llevarse el total a 0 (probado por
  // HTTP con una compra de $100 y descuento $100 → 201, total 0). Ahora,
  // si quien compra es un cliente, estos campos se ignoran por completo
  // (igual que ya se hacía con idCliente): ni siquiera se leen del cuerpo,
  // así que no hay ninguna forma de manipularlos desde la solicitud.
  const esCliente = esCompradorRegistrado(usuario?.rol);

  const minimoMayoristaCentavos = esCliente
    ? null
    : prepararImporteOpcional(datos.minimoMayorista, 'El mínimo mayorista');

  const descuentoCentavos = esCliente
    ? 0
    : (prepararImporteOpcional(datos.descuento, 'El descuento') ?? 0);

  const idVenta = await sequelize.transaction(
    async (transaction) => {
      const cliente = await Cliente.findByPk(idCliente, {
        transaction,
      });

      if (!cliente) {
        throw new AppError('El cliente indicado no existe', 400);
      }

      // Lock coherente con compra.service.js#resolverMedioPagoSimulado
      // (revisión de diseño, Codex — CU-04, ronda de correcciones): la
      // carga manual del personal comprobaba `habilitado` pero sin
      // bloquear la fila, así que una deshabilitación concurrente durante
      // la misma ventana no quedaba cubierta. Mismo orden de locks que el
      // checkout (medio de pago antes que los productos, bloqueados más
      // abajo en este mismo bucle).
      const medioPago = await MedioPago.findByPk(idMedioPago, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!medioPago) {
        throw new AppError(
          'El medio de pago indicado no existe',
          400,
        );
      }

      if (!medioPago.habilitado) {
        throw new AppError(
          'El medio de pago indicado está deshabilitado',
          400,
        );
      }

      // El checkout y las ventas manuales pasan por el mismo cálculo de
      // precios: así ambos aplican promociones vigentes con idénticas reglas.
      const cotizacion = await cotizar(detallesPreparados, { transaction });
      const detallesCalculados = cotizacion.lineas;
      const subtotalGeneralCentavos = cotizacion.totalCentavos;

      const totalCentavos = calcularTotalCentavos(
        subtotalGeneralCentavos,
        descuentoCentavos,
        'El descuento no puede superar el subtotal de la venta',
        'El total de la venta supera el máximo permitido',
      );

      const venta = await Venta.create(
        {
          total: (totalCentavos / 100).toFixed(2),
          estado: 'registrada',
          metodoEntrega,
          minimoMayorista:
            minimoMayoristaCentavos === null
              ? null
              : (minimoMayoristaCentavos / 100).toFixed(2),
          // El descuento persistido se deriva del mismo valor en centavos que
          // se usó para calcular el total, para que nunca puedan divergir.
          descuento:
            descuentoCentavos === 0
              ? null
              : (descuentoCentavos / 100).toFixed(2),
          idCliente,
          idMedioPago,
        },
        {
          transaction,
        },
      );

      // El domicilio vive en su propia tabla (ver models/direccionEntrega.model.js),
      // no en una columna de `venta`: se crea junto con la venta, en la misma
      // transacción, solo cuando corresponde ("envío a domicilio" ya validó
      // arriba que direccionEntrega no sea null).
      if (direccionEntrega) {
        await DireccionEntrega.create(
          {
            idVenta: venta.idVenta,
            direccion: direccionEntrega,
          },
          { transaction },
        );
      }

      for (const linea of detallesCalculados) {
        const detalleVenta = await DetalleVenta.create(
          {
            cantidad: linea.cantidad,
            precioUnitario: (linea.precioFinalCentavos / 100).toFixed(2),
            subtotal: (linea.subtotalCentavos / 100).toFixed(2),
            idVenta: venta.idVenta,
            idProducto: linea.idProducto,
          },
          {
            transaction,
          },
        );

        if (linea.idPromocionProducto !== null) {
          await DetalleVentaPromocion.create(
            {
              idDetalleVenta: detalleVenta.idDetalleVenta,
              nombreProductoHistorico: linea.nombre,
              precioListaUnitario: (linea.precioListaCentavos / 100).toFixed(2),
              idPromocionProducto: linea.idPromocionProducto,
              porcentajeDescuento: linea.porcentajeDescuento,
              montoDescuentoUnitario: (linea.montoDescuentoCentavos / 100).toFixed(2),
            },
            { transaction },
          );
        }

        await linea.producto.update(
          {
            stockActual: linea.producto.stockActual - linea.cantidad,
          },
          {
            transaction,
          },
        );
      }

      await notificarTiendasParticipantes(
        { idVenta: venta.idVenta, tiendasPorId: cotizacion.tiendasPorId },
        transaction,
      );

      return venta.idVenta;
    },
  );

  return obtenerVentaPorId(idVenta, usuario);
};

// Lógica transaccional compartida entre la cancelación directa del personal
// (cancelarVenta, abajo) y la aprobación de una solicitud de cancelación del
// cliente (solicitudCancelacion.service.js#resolverSolicitudCancelacion) —
// CU-04, corrección: "al aprobar, reutilizá la cancelación transaccional
// existente" (no dos implementaciones que puedan divergir). Asume que
// `venta` YA está bloqueada (SELECT...FOR UPDATE) y validada como
// 'registrada' por quien llama: no repite ninguna de las dos cosas.
const ejecutarCancelacionTransaccional = async (venta, transaction) => {
  const detalles = await DetalleVenta.findAll({
    where: { idVenta: venta.idVenta },
    transaction,
    order: [['idProducto', 'ASC']],
  });

  for (const detalle of detalles) {
    const producto = await Producto.findByPk(
      detalle.idProducto,
      {
        transaction,
        lock: transaction.LOCK.UPDATE,
      },
    );

    if (!producto) {
      throw new AppError(
        `No se encontró el producto ${detalle.idProducto}`,
        409,
      );
    }

    const stockRestituido = producto.stockActual + detalle.cantidad;

    // La restitución no puede exceder el rango de una columna INTEGER
    // firmada. Si esto ocurre, se rechaza toda la cancelación (409) y la
    // transacción revierte también los productos ya restituidos en
    // iteraciones anteriores de este mismo bucle: no puede quedar una
    // cancelación a medio aplicar.
    if (
      !Number.isSafeInteger(stockRestituido) ||
      stockRestituido > MAXIMO_ENTERO_POSITIVO
    ) {
      throw new AppError(
        `Restituir el stock del producto ${producto.nombre} superaría el máximo permitido`,
        409,
      );
    }

    await producto.update(
      {
        stockActual: stockRestituido,
      },
      {
        transaction,
      },
    );
  }

  // Reversión del pago simulado (CU-04), en la misma transacción que
  // restituye el stock: si la venta viene del checkout con pago simulado
  // tiene una fila en Pago con estado 'aprobado_simulado'; se marca
  // 'revertido_simulado' acá. Ventas sin Pago (carga manual del personal,
  // o anteriores a esta etapa) no tienen nada que revertir — se ignoran,
  // sin inventar un pago que nunca existió (mismo criterio que
  // relacionesVenta, más arriba).
  const pago = await Pago.findByPk(venta.idVenta, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (pago && pago.estado === 'aprobado_simulado') {
    await pago.update(
      { estado: 'revertido_simulado' },
      { transaction },
    );
  }

  await venta.update(
    {
      estado: 'cancelada',
    },
    {
      transaction,
    },
  );
};

// Al cancelar directamente o marcar como enviada SIN pasar por una
// solicitud de cancelación del cliente, cualquier solicitud que hubiera
// quedado 'pendiente' para esta venta deja de tener sentido — dejarla
// pendiente para siempre es un estado de negocio confuso (hallazgo real,
// revisión independiente sobre esta misma corrección: nunca duplica stock
// ni pago, pero sí queda una solicitud "huérfana" que nadie vuelve a
// mirar). Se cierra acá, en la MISMA transacción que cambia la venta:
// 'aprobada' si la venta terminó `cancelada` (el resultado que el cliente
// pedía SÍ ocurrió, solo que por la vía directa del personal, no por esta
// solicitud en particular); 'rechazada', con un motivo explicativo, si la
// venta se marcó `enviada` (ya no se puede cancelar). No afecta la
// aprobación de una solicitud EXISTENTE (`resolverSolicitudCancelacion`,
// en solicitudCancelacion.service.js): esa actualiza su propia fila por
// `idSolicitud`, por separado, después de llamar a
// `ejecutarCancelacionTransaccional` — esta función no se llama desde ahí.
const cerrarSolicitudesPendientesPorCambioDirecto = async (
  idVenta,
  transaction,
  { estado, motivoRechazo, idUsuarioResolvio },
) => {
  await SolicitudCancelacion.update(
    {
      estado,
      resueltoEn: new Date(),
      idUsuarioResolvio: idUsuarioResolvio ?? null,
      motivoRechazo: motivoRechazo ?? null,
    },
    { where: { idVenta, estado: 'pendiente' }, transaction },
  );
};

// Cancelación DIRECTA: exclusiva del personal (CU-04, corrección — revisión
// de Mauro sobre la venta #20: "el cliente ya no puede ejecutar una
// cancelación directa"). La ruta ya exige vendedor/administrador (ver
// venta.routes.js); este chequeo es defensa en profundidad para cualquier
// llamada directa al servicio que se salteara la ruta. A diferencia de
// marcarVentaComoEnviada (que no recibe usuario y confía en quien llama),
// acá exigimos explícitamente vendedor o administrador: cualquier otro rol,
// un rol desconocido, o la ausencia de usuario, se rechaza con 403. Un
// cliente que quiere cancelar su propia compra usa
// solicitudCancelacion.service.js#solicitarCancelacion en su lugar.
const cancelarVenta = async (id, usuario) => {
  const idVenta = validarEnteroPositivo(
    id,
    'El ID de la venta no es válido',
  );

  if (!esPersonalInterno(usuario?.rol)) {
    throw new AppError(
      'No tiene permisos para cancelar esta venta',
      403,
    );
  }

  await sequelize.transaction(async (transaction) => {
    const venta = await Venta.findByPk(idVenta, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!venta) {
      throw new AppError('Venta no encontrada', 404);
    }

    if (venta.estado !== 'registrada') {
      throw new AppError(
        'Solo se pueden cancelar ventas registradas',
        409,
      );
    }

    await ejecutarCancelacionTransaccional(venta, transaction);
    await cerrarSolicitudesPendientesPorCambioDirecto(idVenta, transaction, {
      estado: 'aprobada',
      idUsuarioResolvio: usuario?.idUsuario,
    });

    // Aviso in-app (ronda 2, Etapa 6): solo si el Cliente de esta venta
    // tiene una cuenta con la que iniciar sesión — una venta cargada
    // manualmente por el personal puede ser de un Cliente sin Usuario
    // asociado, y en ese caso no hay a quién avisar (no es un error).
    await notificarClientePorIdCliente(
      {
        idCliente: venta.idCliente,
        tipo: TIPOS_AVISO.VENTA_CANCELADA,
        mensaje: `Tu compra #${venta.idVenta} fue cancelada por el personal.`,
        enlace: `/mis-compras/${venta.idVenta}`,
      },
      transaction,
    );
  });

  return obtenerVentaPorId(idVenta, usuario);
};

// Corte B: igual que cancelarVenta, la lectura del estado y la actualización
// ocurren dentro de la misma transacción con bloqueo de la fila de Venta.
// Antes, la lectura sin bloqueo permitía que un cancelarVenta concurrente
// terminara primero, y esta función igual sobrescribiera el estado a
// 'enviada' sin volver a comprobar que la venta seguía "registrada". El
// bloqueo usa el mismo punto de entrada (la fila de Venta) que
// cancelarVenta, así que ambas operaciones se serializan sobre esa fila sin
// necesidad de un orden adicional entre ellas.
//
// Ronda 2, Etapa 7 (diseño de esquema revisado con Codex ANTES de escribir
// esto — ver docs/estado-proyecto.md): antes, esta función siempre pasaba
// a 'enviada' sin importar el método de entrega real, así que un retiro en
// sucursal terminaba mostrando el mismo estado que un envío a domicilio —
// el defecto real que esta etapa corrige. Ahora bifurca por
// `metodoEntrega`: 'envío a domicilio' → 'enviada' (sin cambios); 'retiro
// en sucursal' → 'lista_para_retirar' (nuevo). Un `metodoEntrega` nulo o
// desconocido (ventas cargadas antes de que este campo existiera) se trata
// como fallback LEGADO hacia 'enviada' — a propósito, para no romper el
// comportamiento de ventas ya registradas antes de esta ronda; nunca se
// infiere "retiro" de una ausencia de dato.
const marcarVentaComoEnviada = async (id) => {
  const idVenta = validarEnteroPositivo(
    id,
    'El ID de la venta no es válido',
  );

  await sequelize.transaction(async (transaction) => {
    const venta = await Venta.findByPk(idVenta, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!venta) {
      throw new AppError('Venta no encontrada', 404);
    }

    if (venta.estado !== 'registrada') {
      throw new AppError(
        'Solo se pueden enviar ventas registradas',
        409,
      );
    }

    const esRetiroEnSucursal = venta.metodoEntrega === 'retiro en sucursal';
    const nuevoEstado = esRetiroEnSucursal ? 'lista_para_retirar' : 'enviada';

    await venta.update(
      {
        estado: nuevoEstado,
      },
      {
        transaction,
      },
    );

    await cerrarSolicitudesPendientesPorCambioDirecto(idVenta, transaction, {
      estado: 'rechazada',
      motivoRechazo: esRetiroEnSucursal
        ? 'La venta se marcó como lista para retirar antes de resolver esta solicitud.'
        : 'La venta se marcó como enviada antes de resolver esta solicitud.',
    });

    // Aviso in-app (ronda 2, Etapa 6, extendido en la Etapa 7): mismo
    // criterio que cancelarVenta, más arriba — se ignora en silencio si el
    // Cliente no tiene Usuario.
    await notificarClientePorIdCliente(
      {
        idCliente: venta.idCliente,
        tipo: esRetiroEnSucursal ? TIPOS_AVISO.VENTA_LISTA_PARA_RETIRAR : TIPOS_AVISO.VENTA_ENVIADA,
        mensaje: esRetiroEnSucursal
          ? `Tu compra #${venta.idVenta} ya está lista para retirar en el local.`
          : `Tu compra #${venta.idVenta} fue marcada como enviada.`,
        enlace: `/mis-compras/${venta.idVenta}`,
      },
      transaction,
    );
  });

  return obtenerVentaPorId(idVenta);
};

// Confirma la entrega/retiro efectivo (Etapa 7, nueva): única vía hacia
// 'entregada', válida desde 'enviada' O 'lista_para_retirar' — nunca
// directo desde 'registrada' (revisión de diseño, Codex: "evita saltear el
// hito operativo intermedio"). Mismo patrón de bloqueo que las demás
// transiciones de esta fila.
const marcarVentaComoEntregada = async (id) => {
  const idVenta = validarEnteroPositivo(
    id,
    'El ID de la venta no es válido',
  );

  await sequelize.transaction(async (transaction) => {
    const venta = await Venta.findByPk(idVenta, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!venta) {
      throw new AppError('Venta no encontrada', 404);
    }

    if (venta.estado !== 'enviada' && venta.estado !== 'lista_para_retirar') {
      throw new AppError(
        'Solo se pueden marcar como entregadas las ventas enviadas o listas para retirar',
        409,
      );
    }

    await venta.update(
      {
        estado: 'entregada',
      },
      {
        transaction,
      },
    );

    await notificarClientePorIdCliente(
      {
        idCliente: venta.idCliente,
        tipo: TIPOS_AVISO.VENTA_ENTREGADA,
        mensaje: `Tu compra #${venta.idVenta} fue entregada.`,
        enlace: `/mis-compras/${venta.idVenta}`,
      },
      transaction,
    );
  });

  return obtenerVentaPorId(idVenta);
};

export {
  obtenerVentas,
  obtenerVentaPorId,
  registrarVenta,
  cancelarVenta,
  marcarVentaComoEnviada,
  marcarVentaComoEntregada,
  // Exportada para que solicitudCancelacion.service.js reutilice la MISMA
  // lógica transaccional al aprobar una solicitud (ver comentario junto a
  // su definición, arriba).
  ejecutarCancelacionTransaccional,
};
