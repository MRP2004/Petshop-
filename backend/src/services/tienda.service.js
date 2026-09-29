import sequelize from '../config/database.js';
import Usuario from '../models/usuario.model.js';
import Tienda from '../models/tienda.model.js';
import SolicitudVendedor from '../models/solicitudVendedor.model.js';
import Venta from '../models/venta.model.js';
import DetalleVenta from '../models/detalleVenta.model.js';
import Producto from '../models/producto.model.js';
import Cliente from '../models/cliente.model.js';
import AppError from '../errors/AppError.js';
import { relaciones as relacionesProducto } from './producto.service.js';
import { esObjetoPlano, limpiarCadenaOpcional, validarEnteroEnRango, MAXIMO_ENTERO_POSITIVO } from '../utils/validacion.js';
import { validarCuilCuit } from '../utils/validacionFiscal.js';
import { esPersonalInterno, esVendedorIndependiente } from '../utils/roles.js';

// Marketplace: vendedores independientes (ronda 2, Etapa 8). Diseño de
// esquema y autorización revisado con Codex ANTES de escribir esto (dos
// rondas: diseño y luego implementación — ver docs/estado-proyecto.md).

const TIPOS_DOCUMENTO_VALIDOS = ['CUIL', 'CUIT'];

const validarIdSolicitud = (id) =>
  validarEnteroEnRango(id, 1, MAXIMO_ENTERO_POSITIVO, 'El ID de la solicitud no es válido');

const prepararDatosSolicitud = (datos) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError('El cuerpo de la solicitud no es válido', 400);
  }

  const nombreTienda =
    typeof datos.nombreTienda === 'string' ? datos.nombreTienda.trim() : '';

  if (nombreTienda.length < 2 || nombreTienda.length > 80) {
    throw new AppError('El nombre de la tienda debe tener entre 2 y 80 caracteres', 400);
  }

  const tipoDocumento = typeof datos.tipoDocumento === 'string' ? datos.tipoDocumento.trim().toUpperCase() : '';

  if (!TIPOS_DOCUMENTO_VALIDOS.includes(tipoDocumento)) {
    throw new AppError(`El tipo de documento debe ser uno de: ${TIPOS_DOCUMENTO_VALIDOS.join(', ')}`, 400);
  }

  const numeroDocumento = validarCuilCuit(
    datos.numeroDocumento,
    tipoDocumento === 'CUIT' ? 'El CUIT' : 'El CUIL',
  );

  // Razón social: obligatoria para una empresa (CUIT), no aplica a una
  // persona física (CUIL) — se ignora en silencio si se manda igual, para
  // no exigirle al formulario que sepa borrar el campo al cambiar de tipo.
  const razonSocialCruda = limpiarCadenaOpcional(datos.razonSocial, 'La razón social');

  if (tipoDocumento === 'CUIT' && !razonSocialCruda) {
    throw new AppError('La razón social es obligatoria para una empresa (CUIT)', 400);
  }

  const razonSocial = tipoDocumento === 'CUIT' ? razonSocialCruda : null;

  return { nombreTienda, tipoDocumento, numeroDocumento, razonSocial };
};

// "Quiero ser vendedor": solo una cuenta compradora YA EXISTENTE puede
// solicitarlo (nunca personal interno) — conserva su Cliente, favoritos,
// direcciones e historial de compras si se aprueba (ver
// resolverSolicitudVendedor). Un vendedor_independiente que ya tiene
// tienda no puede volver a solicitar.
const solicitarSerVendedor = async (datos, usuario) => {
  if (usuario?.rol !== 'cliente') {
    throw new AppError('Solo una cuenta cliente puede solicitar convertirse en vendedor', 403);
  }

  const datosPreparados = prepararDatosSolicitud(datos);

  await sequelize.transaction(async (transaction) => {
    // Bloqueo de la propia fila de Usuario (hallazgo real de Codex): sin
    // esto, dos POST concurrentes del mismo cliente podían pasar los dos
    // el `findOne` de abajo ANTES de que cualquiera insertara su fila, y
    // terminar creando dos solicitudes pendientes para la misma cuenta.
    // Con el lock, la segunda transacción espera a que la primera termine
    // (commit o rollback) antes de hacer su propio `findOne`, así que ve
    // la solicitud recién creada por la primera.
    await Usuario.findByPk(usuario.idUsuario, { transaction, lock: transaction.LOCK.UPDATE });

    const solicitudPendiente = await SolicitudVendedor.findOne({
      where: { idUsuario: usuario.idUsuario, estado: 'pendiente' },
      transaction,
    });

    if (solicitudPendiente) {
      throw new AppError('Ya tenés una solicitud pendiente de resolución', 409);
    }

    await SolicitudVendedor.create(
      { idUsuario: usuario.idUsuario, ...datosPreparados },
      { transaction },
    );
  });
};

const relacionesSolicitud = [
  { model: Usuario, as: 'usuario', include: [{ model: Cliente, as: 'cliente' }] },
  { model: Usuario, as: 'resolutor', required: false },
];

const listarSolicitudesVendedor = async (usuario) => {
  if (!esPersonalInterno(usuario?.rol)) {
    throw new AppError('No tiene permisos para ver solicitudes de vendedor', 403);
  }

  return SolicitudVendedor.findAll({
    include: relacionesSolicitud,
    order: [['creadoEn', 'DESC']],
  });
};

// Aprobar/rechazar (exclusivo administrador — a diferencia de solicitudes
// de cancelación, que puede resolver cualquier personal interno: crear una
// cuenta de vendedor es una decisión de negocio de mayor alcance).
const resolverSolicitudVendedor = async (idSolicitudCrudo, decision, usuario, motivoRechazo) => {
  if (usuario?.rol !== 'administrador') {
    throw new AppError('Solo un administrador puede resolver solicitudes de vendedor', 403);
  }

  if (decision !== 'aprobar' && decision !== 'rechazar') {
    throw new AppError('La decisión debe ser "aprobar" o "rechazar"', 400);
  }

  const idSolicitud = validarIdSolicitud(idSolicitudCrudo);

  await sequelize.transaction(async (transaction) => {
    // Orden fijo de locks (mismo criterio que
    // solicitudCancelacion.service.js): la solicitud primero, la cuenta
    // del solicitante después — evita que dos aprobaciones concurrentes
    // (poco probable, pero real) creen dos tiendas para la misma cuenta.
    const solicitud = await SolicitudVendedor.findByPk(idSolicitud, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!solicitud) {
      throw new AppError('Solicitud no encontrada', 404);
    }

    if (solicitud.estado !== 'pendiente') {
      throw new AppError('Esta solicitud ya fue resuelta', 409);
    }

    const solicitante = await Usuario.findByPk(solicitud.idUsuario, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!solicitante) {
      throw new AppError('La cuenta que solicitó no existe', 404);
    }

    if (decision === 'aprobar') {
      if (solicitante.rol !== 'cliente') {
        // La cuenta cambió de rol entre que solicitó y que se resuelve
        // (ya es vendedor independiente, personal interno, etc.) — no se
        // asume nada, se rechaza con un mensaje explícito.
        throw new AppError(
          'La cuenta solicitante ya no es una cuenta cliente elegible (puede ya tener una tienda)',
          409,
        );
      }

      const tiendaExistente = await Tienda.findOne({ where: { idUsuario: solicitante.idUsuario }, transaction });
      if (tiendaExistente) {
        throw new AppError('Esta cuenta ya tiene una tienda', 409);
      }

      await Tienda.create(
        {
          idUsuario: solicitante.idUsuario,
          nombre: solicitud.nombreTienda,
          tipoDocumento: solicitud.tipoDocumento,
          numeroDocumento: solicitud.numeroDocumento,
          razonSocial: solicitud.razonSocial,
          estado: 'activa',
        },
        { transaction },
      );

      await solicitante.update({ rol: 'vendedor_independiente' }, { transaction });

      await solicitud.update(
        { estado: 'aprobada', resueltoEn: new Date(), idUsuarioResolvio: usuario.idUsuario },
        { transaction },
      );
    } else {
      await solicitud.update(
        {
          estado: 'rechazada',
          resueltoEn: new Date(),
          idUsuarioResolvio: usuario.idUsuario,
          motivoRechazo: motivoRechazo || null,
        },
        { transaction },
      );
    }
  });
};

const obtenerTiendaPropia = async (usuario) => {
  if (!esVendedorIndependiente(usuario?.rol)) {
    throw new AppError('No tiene permisos para ver esta tienda', 403);
  }

  const tienda = await Tienda.findByPk(usuario.idTienda);

  if (!tienda) {
    throw new AppError('Tienda no encontrada', 404);
  }

  return tienda;
};

// Administración de tiendas (suspender/reactivar) — exclusivo
// administrador. Hace que `tienda.estado` sea un campo REAL, no
// decorativo: producto.service.js lo hace cumplir en cada escritura.
const listarTiendas = async (usuario) => {
  if (usuario?.rol !== 'administrador') {
    throw new AppError('No tiene permisos para ver las tiendas', 403);
  }

  return Tienda.findAll({
    include: [{ model: Usuario, as: 'usuario', include: [{ model: Cliente, as: 'cliente' }] }],
    order: [['creadoEn', 'DESC']],
  });
};

const cambiarEstadoTienda = async (idTiendaCrudo, estadoNuevo, usuario) => {
  if (usuario?.rol !== 'administrador') {
    throw new AppError('No tiene permisos para cambiar el estado de una tienda', 403);
  }

  if (!['activa', 'suspendida'].includes(estadoNuevo)) {
    throw new AppError('El estado debe ser "activa" o "suspendida"', 400);
  }

  const idTienda = validarEnteroEnRango(idTiendaCrudo, 1, MAXIMO_ENTERO_POSITIVO, 'El ID de la tienda no es válido');

  // Mismo bloqueo de fila que producto.service.js#resolverTiendaPropiaActiva
  // (hallazgo real de Codex): así, suspender una tienda se serializa con
  // cualquier escritura de producto que esa tienda tuviera en curso, en vez
  // de competir con ella.
  return sequelize.transaction(async (transaction) => {
    const tienda = await Tienda.findByPk(idTienda, { transaction, lock: transaction.LOCK.UPDATE });
    if (!tienda) {
      throw new AppError('Tienda no encontrada', 404);
    }

    await tienda.update({ estado: estadoNuevo }, { transaction });
    return tienda;
  });
};

// "Mis ventas" de un vendedor independiente (el punto de mayor cuidado de
// esta etapa, ver revisión de Codex): NUNCA se devuelve la Venta completa
// —eso filtraría el total real de la compra, el medio de pago, el
// comprobante, la dirección de entrega completa y las líneas de OTROS
// vendedores o de PetShop al mismo comprador— sino un DTO propio,
// construido a mano, con solo lo que este vendedor necesita: sus propias
// líneas, su propio subtotal, y los datos mínimos del comprador (nombre).
const construirDtoVentaDeTienda = (venta, detallesPropios) => {
  const subtotalPropio = detallesPropios.reduce(
    (acumulado, detalle) => acumulado + Number(detalle.subtotal),
    0,
  );

  return {
    idVenta: venta.idVenta,
    fecha: venta.fecha,
    estado: venta.estado,
    metodoEntrega: venta.metodoEntrega,
    cliente: venta.cliente ? { nombre: venta.cliente.nombre, apellido: venta.cliente.apellido } : null,
    detallesPropios: detallesPropios.map((detalle) => ({
      idDetalleVenta: detalle.idDetalleVenta,
      cantidad: detalle.cantidad,
      precioUnitario: detalle.precioUnitario,
      subtotal: detalle.subtotal,
      producto: detalle.producto ? { idProducto: detalle.producto.idProducto, nombre: detalle.producto.nombre } : null,
    })),
    subtotalPropio: subtotalPropio.toFixed(2),
  };
};

const listarVentasDeTienda = async (usuario) => {
  if (!esVendedorIndependiente(usuario?.rol)) {
    throw new AppError('No tiene permisos para ver estas ventas', 403);
  }

  // Un producto de la propia tienda, en cualquier línea de cualquier
  // venta: se agrupa por venta después de traer las líneas (una venta
  // puede tener más de una línea de esta misma tienda).
  const detalles = await DetalleVenta.findAll({
    include: [
      { model: Producto, as: 'producto', where: { idTienda: usuario.idTienda }, attributes: ['idProducto', 'nombre'] },
      {
        model: Venta,
        as: 'venta',
        include: [{ model: Cliente, as: 'cliente' }],
      },
    ],
    order: [[{ model: Venta, as: 'venta' }, 'fecha', 'DESC']],
  });

  const ventasPorId = new Map();

  for (const detalle of detalles) {
    const idVenta = detalle.venta.idVenta;
    if (!ventasPorId.has(idVenta)) {
      ventasPorId.set(idVenta, { venta: detalle.venta, detalles: [] });
    }
    ventasPorId.get(idVenta).detalles.push(detalle);
  }

  return Array.from(ventasPorId.values()).map(({ venta, detalles: detallesPropios }) =>
    construirDtoVentaDeTienda(venta, detallesPropios),
  );
};

const obtenerVentaDeTiendaPorId = async (idVentaCrudo, usuario) => {
  if (!esVendedorIndependiente(usuario?.rol)) {
    throw new AppError('No tiene permisos para ver esta venta', 403);
  }

  const idVenta = validarEnteroEnRango(idVentaCrudo, 1, MAXIMO_ENTERO_POSITIVO, 'El ID de la venta no es válido');

  const venta = await Venta.findByPk(idVenta, {
    include: [{ model: Cliente, as: 'cliente' }],
  });

  if (!venta) {
    throw new AppError('Venta no encontrada', 404);
  }

  const detallesPropios = await DetalleVenta.findAll({
    where: { idVenta },
    include: [{ model: Producto, as: 'producto', where: { idTienda: usuario.idTienda }, attributes: ['idProducto', 'nombre'] }],
  });

  if (detallesPropios.length === 0) {
    // No es que la venta no exista (podría ser de otro cliente, o no
    // tener ningún producto de esta tienda): en los dos casos, la
    // respuesta es la misma — "no encontrada" — para no revelar cuál es
    // el motivo real (mismo criterio que el resto de las verificaciones
    // de "propia o no" en este proyecto).
    throw new AppError('Venta no encontrada', 404);
  }

  return construirDtoVentaDeTienda(venta, detallesPropios);
};

// Reutiliza `relaciones` de producto.service.js (mismo shape que el
// catálogo público, incluida la imagen) — sin filtro de tienda suspendida:
// el propio vendedor debe poder seguir viendo (y editando) sus productos
// aunque su tienda esté suspendida, para entender qué está pasando.
const listarProductosDeTienda = async (usuario) => {
  if (!esVendedorIndependiente(usuario?.rol)) {
    throw new AppError('No tiene permisos para ver estos productos', 403);
  }

  return Producto.findAll({
    where: { idTienda: usuario.idTienda },
    include: relacionesProducto,
    order: [['nombre', 'ASC']],
  });
};

export {
  solicitarSerVendedor,
  listarSolicitudesVendedor,
  resolverSolicitudVendedor,
  obtenerTiendaPropia,
  listarTiendas,
  cambiarEstadoTienda,
  listarVentasDeTienda,
  obtenerVentaDeTiendaPorId,
  listarProductosDeTienda,
};
