import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import Venta from '../models/venta.model.js';
import DetalleVenta from '../models/detalleVenta.model.js';
import Cliente from '../models/cliente.model.js';
import MedioPago from '../models/medioPago.model.js';
import Producto from '../models/producto.model.js';
import DireccionEntrega from '../models/direccionEntrega.model.js';
import AppError from '../errors/AppError.js';
import { prepararEnteroOpcional, limpiarCadenaOpcional } from '../utils/validacion.js';
import {
  MAXIMO_ENTERO_POSITIVO,
  esObjetoPlano,
  validarEnteroPositivo,
  prepararImporteOpcional,
  validarImportePersistido,
  calcularSubtotalCentavos,
  acumularSubtotalGeneral,
  calcularTotalCentavos,
  prepararDetalles,
} from '../utils/ventaValidaciones.js';

// Únicos dos valores reconocidos (coinciden con las opciones fijas que ya
// ofrece el checkout del frontend, Checkout.jsx y PanelNuevaVenta.jsx): no
// es una lista abierta, para poder exigir domicilio de forma confiable
// cuando corresponde entrega a domicilio.
const METODOS_ENTREGA_VALIDOS = ['retiro en sucursal', 'envío a domicilio'];
const LONGITUD_MINIMA_DIRECCION = 8;
const LONGITUD_MAXIMA_DIRECCION = 200;

// Envío a domicilio no puede confirmarse sin domicilio: si falta o es
// demasiado corto para ser una dirección real, se rechaza la venta entera
// (no se registra "a medias" con la entrega sin poder completarse). Para
// "retiro en sucursal" (o sin método indicado) se ignora cualquier
// dirección que igual se mande: no aplica, y no tiene sentido persistirla.
const prepararEntrega = (datos) => {
  const metodoEntregaCrudo =
    typeof datos.metodoEntrega === 'string' ? datos.metodoEntrega.trim() : '';

  if (!metodoEntregaCrudo) {
    return { metodoEntrega: null, direccionEntrega: null };
  }

  if (!METODOS_ENTREGA_VALIDOS.includes(metodoEntregaCrudo)) {
    throw new AppError(
      `El método de entrega debe ser uno de: ${METODOS_ENTREGA_VALIDOS.join(', ')}`,
      400,
    );
  }

  if (metodoEntregaCrudo !== 'envío a domicilio') {
    return { metodoEntrega: metodoEntregaCrudo, direccionEntrega: null };
  }

  const direccionEntrega = limpiarCadenaOpcional(datos.direccionEntrega, 'La dirección de entrega');

  if (!direccionEntrega || direccionEntrega.length < LONGITUD_MINIMA_DIRECCION) {
    throw new AppError(
      `La dirección de entrega es obligatoria para envío a domicilio (mínimo ${LONGITUD_MINIMA_DIRECCION} caracteres)`,
      400,
    );
  }

  if (direccionEntrega.length > LONGITUD_MAXIMA_DIRECCION) {
    throw new AppError(
      `La dirección de entrega no puede superar los ${LONGITUD_MAXIMA_DIRECCION} caracteres`,
      400,
    );
  }

  return { metodoEntrega: metodoEntregaCrudo, direccionEntrega };
};

// Una venta le pertenece a un cliente autenticado si coincide el idCliente;
// el personal (vendedor/administrador) puede operar sobre cualquiera. Se usa
// tanto para listar/ver como para cancelar, así la regla de "solo mis
// compras" vive en un único lugar.
const esPropiaOPersonal = (usuario, idClienteVenta) => {
  if (['vendedor', 'administrador'].includes(usuario?.rol)) {
    return true;
  }

  return usuario?.rol === 'cliente' && usuario.idCliente === idClienteVenta;
};

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
    ],
  },
  {
    model: DireccionEntrega,
    as: 'direccionEntrega',
    required: false, // solo existe cuando metodoEntrega es "envío a domicilio"
  },
];

// filtros: { idCliente, idProveedor } (query string, solo para personal; un
// cliente autenticado siempre ve únicamente las suyas, sin importar lo que
// mande en la query).
const obtenerVentas = async (usuario, filtros = {}) => {
  const where = {};

  if (usuario?.rol === 'cliente') {
    where.idCliente = usuario.idCliente;
  } else {
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

  // Un cliente autenticado compra siempre para sí mismo: el idCliente se
  // deriva de la sesión, nunca del cuerpo de la solicitud (evita que
  // modificando idCliente en el JSON se pueda comprar "como" otro cliente).
  // El personal, en cambio, elige el cliente al cargar una venta manual.
  const idCliente =
    usuario?.rol === 'cliente'
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
  const esCliente = usuario?.rol === 'cliente';

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

      const medioPago = await MedioPago.findByPk(idMedioPago, {
        transaction,
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

      const detallesCalculados = [];
      let subtotalGeneralCentavos = 0;

      for (const detalle of detallesPreparados) {
        const producto = await Producto.findByPk(
          detalle.idProducto,
          {
            transaction,
            lock: transaction.LOCK.UPDATE,
          },
        );

        if (!producto) {
          throw new AppError(
            `El producto ${detalle.idProducto} no existe`,
            400,
          );
        }

        if (producto.stockActual < detalle.cantidad) {
          throw new AppError(
            `Stock insuficiente para el producto ${producto.nombre}`,
            409,
          );
        }

        // El precio ya se valida al crear/editar el producto, pero la venta no
        // puede depender exclusivamente de esa validación ajena: se vuelve a
        // comprobar lo que efectivamente se leyó de la base en este momento.
        const precioCentavos = validarImportePersistido(
          producto.precio,
          `El precio del producto ${producto.nombre} almacenado no es válido`,
        );

        // Cada subtotal se valida contra el máximo de su propia columna, sin
        // importar si un descuento posterior podría dejar el total por debajo:
        // el subtotal se persiste igual en su propia fila de DetalleVenta.
        const subtotalCentavos = calcularSubtotalCentavos(
          precioCentavos,
          detalle.cantidad,
          `El subtotal del producto ${producto.nombre} no puede calcularse de forma segura`,
          `El subtotal del producto ${producto.nombre} supera el máximo permitido`,
        );

        subtotalGeneralCentavos = acumularSubtotalGeneral(
          subtotalGeneralCentavos,
          subtotalCentavos,
          'El importe acumulado de la venta es demasiado grande para procesarse',
        );

        detallesCalculados.push({
          producto,
          cantidad: detalle.cantidad,
          precioCentavos,
          subtotalCentavos,
        });
      }

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

      for (const detalle of detallesCalculados) {
        await DetalleVenta.create(
          {
            cantidad: detalle.cantidad,
            precioUnitario: (
              detalle.precioCentavos / 100
            ).toFixed(2),
            subtotal: (
              detalle.subtotalCentavos / 100
            ).toFixed(2),
            idVenta: venta.idVenta,
            idProducto: detalle.producto.idProducto,
          },
          {
            transaction,
          },
        );

        await detalle.producto.update(
          {
            stockActual:
              detalle.producto.stockActual - detalle.cantidad,
          },
          {
            transaction,
          },
        );
      }

      return venta.idVenta;
    },
  );

  return obtenerVentaPorId(idVenta, usuario);
};

const cancelarVenta = async (id, usuario) => {
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

    if (usuario && !esPropiaOPersonal(usuario, venta.idCliente)) {
      throw new AppError('No tiene permisos para cancelar esta venta', 403);
    }

    if (venta.estado !== 'registrada') {
      throw new AppError(
        'Solo se pueden cancelar ventas registradas',
        409,
      );
    }

    const detalles = await DetalleVenta.findAll({
      where: { idVenta },
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

    await venta.update(
      {
        estado: 'cancelada',
      },
      {
        transaction,
      },
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

    await venta.update(
      {
        estado: 'enviada',
      },
      {
        transaction,
      },
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
};
