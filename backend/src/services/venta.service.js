import sequelize from '../config/database.js';
import Venta from '../models/venta.model.js';
import DetalleVenta from '../models/detalleVenta.model.js';
import Cliente from '../models/cliente.model.js';
import MedioPago from '../models/medioPago.model.js';
import Producto from '../models/producto.model.js';
import AppError from '../errors/AppError.js';

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
];

const validarId = (valor, nombreCampo) => {
  const id = Number(valor);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(`${nombreCampo} no es válido`, 400);
  }

  return id;
};

const prepararImporteOpcional = (valor, nombreCampo) => {
  if (valor === undefined || valor === null || valor === '') {
    return null;
  }

  const importe = Number(valor);

  if (!Number.isFinite(importe) || importe < 0) {
    throw new AppError(`${nombreCampo} no es válido`, 400);
  }

  return importe;
};

const prepararDetalles = (detalles) => {
  if (!Array.isArray(detalles) || detalles.length === 0) {
    throw new AppError(
      'La venta debe contener al menos un producto',
      400,
    );
  }

  const idsUtilizados = new Set();

  const detallesPreparados = detalles.map((detalle) => {
    const idProducto = validarId(
      detalle.idProducto,
      'El ID del producto',
    );

    const cantidad = Number(detalle.cantidad);

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new AppError(
        'La cantidad debe ser un número entero mayor que cero',
        400,
      );
    }

    if (idsUtilizados.has(idProducto)) {
      throw new AppError(
        'Un producto no puede repetirse en la misma venta',
        400,
      );
    }

    idsUtilizados.add(idProducto);

    return {
      idProducto,
      cantidad,
    };
  });

  return detallesPreparados.sort(
    (a, b) => a.idProducto - b.idProducto,
  );
};

const obtenerVentas = async () => {
  return Venta.findAll({
    include: relacionesVenta,
    order: [['fecha', 'DESC']],
  });
};

const obtenerVentaPorId = async (id) => {
  const idVenta = validarId(id, 'El ID de la venta');

  const venta = await Venta.findByPk(idVenta, {
    include: relacionesVenta,
  });

  if (!venta) {
    throw new AppError('Venta no encontrada', 404);
  }

  return venta;
};

const registrarVenta = async (datos) => {
  const idCliente = validarId(
    datos.idCliente,
    'El ID del cliente',
  );

  const idMedioPago = validarId(
    datos.idMedioPago,
    'El ID del medio de pago',
  );

  const detallesPreparados = prepararDetalles(datos.detalles);

  const metodoEntrega =
    typeof datos.metodoEntrega === 'string'
      ? datos.metodoEntrega.trim()
      : null;

  if (metodoEntrega && metodoEntrega.length > 50) {
    throw new AppError(
      'El método de entrega no puede superar los 50 caracteres',
      400,
    );
  }

  const minimoMayorista = prepararImporteOpcional(
    datos.minimoMayorista,
    'El mínimo mayorista',
  );

  const descuento = prepararImporteOpcional(
    datos.descuento,
    'El descuento',
  ) ?? 0;

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

        const precioCentavos = Math.round(
          Number(producto.precio) * 100,
        );

        const subtotalCentavos =
          precioCentavos * detalle.cantidad;

        subtotalGeneralCentavos += subtotalCentavos;

        detallesCalculados.push({
          producto,
          cantidad: detalle.cantidad,
          precioCentavos,
          subtotalCentavos,
        });
      }

      const descuentoCentavos = Math.round(descuento * 100);

      if (descuentoCentavos > subtotalGeneralCentavos) {
        throw new AppError(
          'El descuento no puede superar el subtotal de la venta',
          400,
        );
      }

      const totalCentavos =
        subtotalGeneralCentavos - descuentoCentavos;

      if (totalCentavos > 999999999999) {
        throw new AppError(
          'El total de la venta supera el máximo permitido',
          400,
        );
      }

      const venta = await Venta.create(
        {
          total: (totalCentavos / 100).toFixed(2),
          estado: 'registrada',
          metodoEntrega: metodoEntrega || null,
          minimoMayorista:
            minimoMayorista === null
              ? null
              : minimoMayorista.toFixed(2),
          descuento:
            descuento === 0 ? null : descuento.toFixed(2),
          idCliente,
          idMedioPago,
        },
        {
          transaction,
        },
      );

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

  return obtenerVentaPorId(idVenta);
};

const cancelarVenta = async (id) => {
  const idVenta = validarId(id, 'El ID de la venta');

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

      await producto.update(
        {
          stockActual: producto.stockActual + detalle.cantidad,
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

  return obtenerVentaPorId(idVenta);
};

const marcarVentaComoEnviada = async (id) => {
  const idVenta = validarId(id, 'El ID de la venta');

  const venta = await Venta.findByPk(idVenta);

  if (!venta) {
    throw new AppError('Venta no encontrada', 404);
  }

  if (venta.estado !== 'registrada') {
    throw new AppError(
      'Solo se pueden enviar ventas registradas',
      409,
    );
  }

  await venta.update({
    estado: 'enviada',
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