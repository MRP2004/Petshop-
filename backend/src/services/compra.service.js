import crypto from 'node:crypto';
import sequelize from '../config/database.js';
import Cliente from '../models/cliente.model.js';
import Venta from '../models/venta.model.js';
import DetalleVenta from '../models/detalleVenta.model.js';
import DetalleVentaPromocion from '../models/detalleVentaPromocion.model.js';
import DireccionEntrega from '../models/direccionEntrega.model.js';
import Comprobante from '../models/comprobante.model.js';
import Pago from '../models/pago.model.js';
import MedioPago from '../models/medioPago.model.js';
import IntentoCompra from '../models/intentoCompra.model.js';
import AppError from '../errors/AppError.js';
import { vaciarCarritoEnTransaccion } from './carrito.service.js';
import { esObjetoPlano } from '../utils/validacion.js';
import {
  prepararDetalles,
  prepararEntrega,
  calcularSubtotalCentavos,
} from '../utils/ventaValidaciones.js';
import { cotizar, aRespuestaPublica } from './cotizacion.service.js';
import procesarPagoSimulado from './pagoSimulado.service.js';
import { obtenerVentaPorId } from './venta.service.js';
import { enviarComprobantePorCorreo } from './correo.service.js';
import { crearAviso, notificarTiendasParticipantes, TIPOS_AVISO } from './aviso.service.js';
import { esCompradorRegistrado } from '../utils/roles.js';
import {
  crearPreferencia,
  consultarPago,
  validarFirmaWebhook,
} from './mercadoPago.service.js';
import Usuario from '../models/usuario.model.js';

// Una cotización aceptada hace más de esto se considera vencida y exige
// pedir una nueva, aunque los precios no hayan cambiado.
const TTL_COTIZACION_MS = 10 * 60 * 1000;

const LONGITUD_MINIMA_CLAVE = 8;
const LONGITUD_MAXIMA_CLAVE = 100;

const validarClaveIdempotencia = (valor) => {
  if (
    typeof valor !== 'string' ||
    valor.trim().length < LONGITUD_MINIMA_CLAVE ||
    valor.trim().length > LONGITUD_MAXIMA_CLAVE
  ) {
    throw new AppError(
      `La clave de idempotencia debe ser una cadena de entre ${LONGITUD_MINIMA_CLAVE} y ${LONGITUD_MAXIMA_CLAVE} caracteres`,
      400,
    );
  }

  return valor.trim();
};

const validarCotizacionAceptada = (valor) => {
  if (
    !esObjetoPlano(valor) ||
    !Array.isArray(valor.lineas) ||
    valor.lineas.length === 0 ||
    typeof valor.totalCentavos !== 'number' ||
    typeof valor.emitidaEn !== 'string' ||
    Number.isNaN(Date.parse(valor.emitidaEn))
  ) {
    throw new AppError('La cotización aceptada no es válida', 400);
  }

  return valor;
};

// Contenido "comercial" de un intento de compra, para detectar si una misma
// claveIdempotencia se reutiliza con datos distintos. Deliberadamente
// NO incluye el medio de pago simulado ni ningún dato de tarjeta (corrección
// de una revisión de diseño): "contenido comercial" es QUÉ se
// compra (productos, cantidades, entrega), no CÓMO se paga. Si el hash
// incluyera el medio de pago, recuperarse de una respuesta perdida (recargar
// la página, ver claveIdempotencia.js) podía fallar con "clave usada con
// contenido distinto" apenas el formulario de pago se reiniciara con otra
// selección — con el medio de pago afuera, ese reintento encuentra el mismo
// intento ya resuelto (aprobado o rechazado) y devuelve su resultado sin
// reprocesar nada, sin importar qué medio haya vuelto a elegir la persona.
const calcularHashContenido = ({
  idCliente,
  detallesPreparados,
  metodoEntrega,
  direccionEntrega,
}) => {
  // detallesPreparados ya viene ordenado por idProducto (prepararDetalles),
  // así que el mismo carrito siempre produce el mismo contenido sin importar
  // en qué orden lo armó el frontend.
  const contenido = JSON.stringify({
    idCliente,
    detalles: detallesPreparados.map((d) => [d.idProducto, d.cantidad]),
    metodoEntrega,
    direccionEntrega,
  });

  return crypto.createHash('sha256').update(contenido).digest('hex');
};

// true si la cotización recién recalculada (con datos frescos de la base,
// dentro de la transacción) difiere de la que el cliente dice haber
// aceptado, o si esta última ya venció. La cotización que manda el
// navegador NUNCA autoriza un precio: solo sirve para esta comparación —
// el importe que se cobra siempre es el recalculado.
const cotizacionEstaDesactualizada = (cotizacionRecalculada, cotizacionAceptada) => {
  const antiguedadMs = Date.now() - Date.parse(cotizacionAceptada.emitidaEn);

  if (!Number.isFinite(antiguedadMs) || antiguedadMs < 0 || antiguedadMs > TTL_COTIZACION_MS) {
    return true;
  }

  if (cotizacionRecalculada.totalCentavos !== cotizacionAceptada.totalCentavos) {
    return true;
  }

  if (cotizacionRecalculada.lineas.length !== cotizacionAceptada.lineas.length) {
    return true;
  }

  const aceptadasPorProducto = new Map(
    cotizacionAceptada.lineas.map((linea) => [linea.idProducto, linea]),
  );

  return cotizacionRecalculada.lineas.some((linea) => {
    const aceptada = aceptadasPorProducto.get(linea.idProducto);

    if (!aceptada) return true;

    // Se compara el desglose completo, no solo el precio final: si el
    // precio de lista o el monto de descuento cambiaron pero, por
    // coincidencia, el precio final resultante es el mismo, igual se exige
    // repasar el resumen — lo que el cliente aceptó incluye ESE desglose,
    // no solo el número final.
    // Cantidad y subtotal también (Etapa 9, hallazgo de Codex): con el
    // mismo total, otra combinación de cantidades (A×2+B×1 en vez de
    // A×1+B×3) no es la compra que el cliente vio y aceptó.
    return (
      aceptada.cantidad !== linea.cantidad ||
      aceptada.subtotalCentavos !== linea.subtotalCentavos ||
      aceptada.precioFinalCentavos !== linea.precioFinalCentavos ||
      aceptada.precioListaCentavos !== linea.precioListaCentavos ||
      aceptada.montoDescuentoCentavos !== linea.montoDescuentoCentavos ||
      (aceptada.idPromocionProducto ?? null) !== (linea.idPromocionProducto ?? null)
    );
  });
};

const generarNumeroComprobante = (idVenta) =>
  `PS-${new Date().getFullYear()}-${String(idVenta).padStart(6, '0')}`;

// Errores de contención real de MySQL (deadlock / espera de lock agotada):
// no son un problema del pedido en sí, sino una condición de carrera
// transitoria (revisión de diseño, Codex) — se traducen a un 409
// reintentable en vez de un 500 genérico.
const esErrorDeContencionTransitoria = (error) =>
  ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error?.original?.code);

// Confirma una compra del checkout de cliente: cotiza, procesa el pago
// simulado y registra la venta de forma atómica e idempotente.
// A diferencia de venta.service.js#registrarVenta (carga manual del
// personal, sin pago ni idempotencia, sin tocar), esta función es
// exclusiva del rol cliente.
// `opciones.proveedorPrecios` es exclusivamente para pruebas de integración
// (ver test-integracion/proveedorPrecioDePrueba.js): permite simular una
// promoción vigente/vencida sin depender de las reglas reales de José, que
// todavía no existen. El body de la solicitud HTTP nunca puede llegar a
// pisarlo (el controller no lo reenvía) — no es un campo del cuerpo.

const registrarCompraAprobada = async ({
  transaction,
  cliente,
  usuario,
  idCliente,
  metodoEntrega,
  direccionEntrega,
  cotizacionRecalculada,
  medioPago,
  intento,
  datosPago,
}) => {
  const venta = await Venta.create(
    {
      fecha: new Date(),
      total: (cotizacionRecalculada.totalCentavos / 100).toFixed(2),
      estado: 'registrada',
      metodoEntrega,
      idCliente,
      idMedioPago: medioPago.idMedioPago,
    },
    { transaction },
  );

  await crearAviso(
    {
      idUsuario: usuario.idUsuario,
      tipo: TIPOS_AVISO.COMPRA_CONFIRMADA,
      mensaje: `Tu compra #${venta.idVenta} fue confirmada.`,
      enlace: `/mis-compras/${venta.idVenta}`,
    },
    transaction,
  );

  await notificarTiendasParticipantes(
    {
      idVenta: venta.idVenta,
      tiendasPorId: cotizacionRecalculada.tiendasPorId,
    },
    transaction,
  );

  if (direccionEntrega) {
    await DireccionEntrega.create(
      { idVenta: venta.idVenta, direccion: direccionEntrega },
      { transaction },
    );
  }

  for (const linea of cotizacionRecalculada.lineas) {
    const subtotalCentavos = calcularSubtotalCentavos(
      linea.precioFinalCentavos,
      linea.cantidad,
      `El subtotal del producto ${linea.nombre} no puede calcularse de forma segura`,
      `El subtotal del producto ${linea.nombre} supera el máximo permitido`,
    );

    const detalleVenta = await DetalleVenta.create(
      {
        cantidad: linea.cantidad,
        precioUnitario: (linea.precioFinalCentavos / 100).toFixed(2),
        subtotal: (subtotalCentavos / 100).toFixed(2),
        idVenta: venta.idVenta,
        idProducto: linea.idProducto,
      },
      { transaction },
    );

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

    await linea.producto.update(
      { stockActual: linea.producto.stockActual - linea.cantidad },
      { transaction },
    );
  }

  await Comprobante.create(
    {
      idVenta: venta.idVenta,
      numero: generarNumeroComprobante(venta.idVenta),
      estadoCorreo: cliente.email ? 'pendiente' : 'no_aplica',
      nombreCompradorHistorico: cliente.nombre,
      apellidoCompradorHistorico: cliente.apellido,
      correoCompradorHistorico: cliente.email,
    },
    { transaction },
  );

  await Pago.create(
    {
      idVenta: venta.idVenta,
      tipo: datosPago.tipo,
      estado: datosPago.estado,
      ultimosCuatroDigitos: datosPago.ultimosCuatroDigitos ?? null,
      marca: datosPago.marca ?? null,
      monto: (cotizacionRecalculada.totalCentavos / 100).toFixed(2),
      idPagoMercadoPago: datosPago.idPagoMercadoPago ?? null,
    },
    { transaction },
  );

  await vaciarCarritoEnTransaccion(usuario.idUsuario, transaction);

  await IntentoCompra.update(
    {
      estado: 'aprobado',
      idVenta: venta.idVenta,
      actualizadoEn: new Date(),
    },
    {
      where: { idIntentoCompra: intento.idIntentoCompra },
      transaction,
    },
  );

  return {
    tipo: 'aprobado',
    idVenta: venta.idVenta,
    reintento: false,
  };
};

const resolverMedioPagoMercadoPago = async (transaction) => {
  const medioPago = await MedioPago.findOne({
    where: { nombre: 'Mercado Pago' },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!medioPago) {
    throw new AppError('El medio de pago Mercado Pago no está configurado', 503);
  }

  if (!medioPago.habilitado) {
    throw new AppError('El medio de pago Mercado Pago no está habilitado', 409);
  }

  return medioPago;
};

const iniciarCheckoutMercadoPago = async (datos, usuario, opciones = {}) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError('El cuerpo de la compra no es válido', 400);
  }

  if (!esCompradorRegistrado(usuario?.rol)) {
    throw new AppError('Solo un cliente puede confirmar una compra', 403);
  }

  const idCliente = usuario.idCliente;
  const idUsuario = usuario.idUsuario;
  const claveIdempotencia = validarClaveIdempotencia(datos.claveIdempotencia);
  const detallesPreparados = prepararDetalles(datos.detalles);
  const { metodoEntrega, direccionEntrega } = prepararEntrega(datos);
  const cotizacionAceptada = validarCotizacionAceptada(datos.cotizacionAceptada);

  const hashContenido = calcularHashContenido({
    idCliente,
    detallesPreparados,
    metodoEntrega,
    direccionEntrega,
  });

  let intento;
  let cotizacionRecalculada;

  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const cliente = await Cliente.findByPk(idCliente, { transaction });

      if (!cliente) {
        throw new AppError('El cliente indicado no existe', 400);
      }

      await sequelize.query(
        `INSERT INTO intentocompra
           (claveIdempotencia, idCliente, hashContenido, estado, creadoEn, actualizadoEn)
         VALUES (:clave, :idCliente, :hash, 'procesando', NOW(), NOW())
         ON DUPLICATE KEY UPDATE idIntentoCompra = idIntentoCompra`,
        {
          replacements: {
            clave: claveIdempotencia,
            idCliente,
            hash: hashContenido,
          },
          transaction,
        },
      );

      intento = await IntentoCompra.findOne({
        where: { claveIdempotencia, idCliente },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (intento.hashContenido !== hashContenido) {
        throw new AppError(
          'La clave de idempotencia ya se usó con un contenido distinto',
          409,
        );
      }

      if (intento.estado === 'aprobado') {
        return {
          tipo: 'aprobado',
          idVenta: intento.idVenta,
        };
      }

      if (intento.estado === 'rechazado') {
        throw new AppError(
          intento.motivoRechazo || 'El intento de compra fue rechazado',
          409,
        );
      }

      if (intento.estado === 'pendiente_pago') {
        const datosGuardados = intento.datosCompra || {};

        if (!datosGuardados.initPoint) {
          throw new AppError(
            'El intento existe, pero no tiene una URL de pago recuperable',
            409,
          );
        }

        return {
          tipo: 'pendiente_pago',
          initPoint: datosGuardados.initPoint,
          idIntentoCompra: intento.idIntentoCompra,
        };
      }

      await resolverMedioPagoMercadoPago(transaction);

      cotizacionRecalculada = await cotizar(datos.detalles, {
        transaction,
        proveedorPrecios: opciones.proveedorPrecios,
      });

      if (cotizacionEstaDesactualizada(cotizacionRecalculada, cotizacionAceptada)) {
        const error = new AppError(
          'La cotización aceptada cambió: revisá el nuevo resumen antes de confirmar de nuevo',
          409,
        );

        error.cotizacionVigente = aRespuestaPublica(cotizacionRecalculada);
        error.codigo = 'COTIZACION_DESACTUALIZADA';

        throw error;
      }

      return {
        tipo: 'crear_preferencia',
        idIntentoCompra: intento.idIntentoCompra,
        idCliente,
        idUsuario,
        datosCompra: {
          detalles: detallesPreparados,
          metodoEntrega,
          direccionEntrega,
        },
      };
    });

    if (resultado.tipo !== 'crear_preferencia') {
      return resultado;
    }

    const notificationUrl = process.env.MP_WEBHOOK_URL;
    const frontendUrl = process.env.FRONTEND_URL;

    if (!notificationUrl || !frontendUrl) {
      throw new AppError(
        'Faltan configurar MP_WEBHOOK_URL o FRONTEND_URL',
        503,
      );
    }

    const preferencia = await crearPreferencia({
      items: cotizacionRecalculada.lineas.map((linea) => ({
        id: String(linea.idProducto),
        title: linea.nombre,
        quantity: linea.cantidad,
        unit_price: Number((linea.precioFinalCentavos / 100).toFixed(2)),
        currency_id: 'ARS',
      })),
      external_reference: String(resultado.idIntentoCompra),
      metadata: {
        id_intento_compra: resultado.idIntentoCompra,
        id_cliente: idCliente,
      },
      notification_url: notificationUrl,
      back_urls: {
        success: `${frontendUrl}/`,
        failure: `${frontendUrl}/`,
        pending: `${frontendUrl}/`,
      },
      
    });

    const initPoint = preferencia.sandbox_init_point || preferencia.init_point;

    if (!preferencia.id || !initPoint) {
      throw new AppError(
        'Mercado Pago no devolvió una preferencia de pago válida',
        502,
      );
    }

    await IntentoCompra.update(
      {
        estado: 'pendiente_pago',
        idPreferenciaMercadoPago: String(preferencia.id),
        datosCompra: {
          ...resultado.datosCompra,
          idUsuario,
          initPoint,
          montoEsperadoCentavos: cotizacionRecalculada.totalCentavos,
        },
        actualizadoEn: new Date(),
      },
      {
        where: {
          idIntentoCompra: resultado.idIntentoCompra,
          estado: 'procesando',
        },
      },
    );

    return {
      tipo: 'pendiente_pago',
      idIntentoCompra: resultado.idIntentoCompra,
      initPoint,
    };
  } catch (error) {
    if (esErrorDeContencionTransitoria(error)) {
      throw new AppError(
        'Ocurrió una condición de carrera al iniciar el pago; reintentá la operación',
        409,
      );
    }

    throw error;
  }
};

const confirmarCompra = async (datos, usuario, opciones = {}) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError('El cuerpo de la compra no es válido', 400);
  }

  // Ronda 2, Etapa 8: un vendedor independiente sigue siendo comprador
  // (conserva su propio idCliente) — puede confirmar una compra igual que
  // cualquier cliente.
  if (!esCompradorRegistrado(usuario?.rol)) {
    throw new AppError('Solo un cliente puede confirmar una compra', 403);
  }

  const idCliente = usuario.idCliente;
  const claveIdempotencia = validarClaveIdempotencia(datos.claveIdempotencia);
  const detallesPreparados = prepararDetalles(datos.detalles);
  const { metodoEntrega, direccionEntrega } = prepararEntrega(datos);
  const cotizacionAceptada = validarCotizacionAceptada(datos.cotizacionAceptada);

  // El pago (formato de tarjeta incluido) se valida/procesa MÁS ABAJO dentro
  // de la transacción, y solo si el intento resulta ser nuevo (revisión
  // independiente, Codex): si se llamara acá y el body llega con datos de
  // pago inválidos o incompletos — típico al recuperarse de una respuesta
  // perdida, con el formulario de pago ya reiniciado —, un intento YA
  // resuelto (aprobado o rechazado) nunca llegaría a devolverse: la
  // solicitud fallaría con 400 antes de siquiera consultar la idempotencia,
  // aunque la compra ya estuviera confirmada de verdad.

  const hashContenido = calcularHashContenido({
    idCliente,
    detallesPreparados,
    metodoEntrega,
    direccionEntrega,
  });

  let resultado;

  try {
    resultado = await sequelize.transaction(async (transaction) => {
      const cliente = await Cliente.findByPk(idCliente, { transaction });
      if (!cliente) {
        throw new AppError('El cliente indicado no existe', 400);
      }

      // Patrón de idempotencia con bloqueo de fila: el
      // INSERT...ON DUPLICATE KEY UPDATE + SELECT...FOR UPDATE,
      // dentro de la MISMA transacción, hace que una segunda solicitud
      // concurrente con la misma clave espere a que esta termine (commit o
      // rollback) antes de poder leer el resultado.
      await sequelize.query(
        `INSERT INTO intentocompra
           (claveIdempotencia, idCliente, hashContenido, estado, creadoEn, actualizadoEn)
         VALUES (:clave, :idCliente, :hash, 'procesando', NOW(), NOW())
         ON DUPLICATE KEY UPDATE idIntentoCompra = idIntentoCompra`,
        {
          replacements: { clave: claveIdempotencia, idCliente, hash: hashContenido },
          transaction,
        },
      );

      const intento = await IntentoCompra.findOne({
        where: { claveIdempotencia, idCliente },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (intento.hashContenido !== hashContenido) {
        throw new AppError(
          'La clave de idempotencia ya se usó con un contenido distinto',
          409,
        );
      }

      // Reintento de un intento YA resuelto (aprobado o rechazado): se
      // devuelve el mismo resultado sin reprocesar nada (ni pago, ni stock,
      // ni una segunda venta), aunque el stock haya cambiado mientras tanto.
      if (intento.estado === 'aprobado') {
        // La venta se relee DESPUÉS de esta transacción (más abajo), no
        // acá adentro: en este caso de reintento no hay nada más que leer
        // ni escribir bajo el lock, así que no tiene sentido mantener una
        // segunda conexión abierta solo para esto.
        return { tipo: 'aprobado', idVenta: intento.idVenta, reintento: true };
      }

      if (intento.estado === 'rechazado') {
        return {
          tipo: 'rechazado',
          motivoRechazo: intento.motivoRechazo,
          reintento: true,
        };
      }

      // intento.estado === 'procesando': fila recién insertada por ESTA
      // transacción (si hubiera sido de otra, el SELECT...FOR UPDATE de
      // arriba habría esperado hasta que esa otra terminara y quedara
      // 'aprobado'/'rechazado' — nunca 'procesando' visible desde acá).
      // Es la primera vez que se procesa este intento: ahora sí hace falta
      // un pago válido (ver el comentario al principio de la función).
      const resultadoPago = procesarPagoSimulado({
        tipo: datos.tipoPagoSimulado,
        datosDebito: datos.datosDebito,
      });

      // Orden de bloqueos DENTRO de esta transacción: intento (ya bloqueado
      // arriba) → medio de pago → productos (dentro de
      // cotizar(), en orden de idProducto). Mismo orden en TODA solicitud
      // que pasa por acá, así que dos transacciones concurrentes nunca
      // pueden esperarse en un ciclo (deadlock) por este motivo.
      //
      // Se resuelve y valida el medio de pago simulado ANTES de cotizar:
      // si está deshabilitado, se corta acá, sin haber tocado stock ni
      // promociones todavía (aunque tampoco importaría el orden para el
      // resultado final, ya que todo esto es la misma transacción y
      // cualquier throw revierte todo lo hecho hasta ahora).
      const medioPago = await resolverMedioPagoSimulado(resultadoPago.tipo, transaction);

      const cotizacionRecalculada = await cotizar(datos.detalles, {
        transaction,
        proveedorPrecios: opciones.proveedorPrecios,
      });

      if (cotizacionEstaDesactualizada(cotizacionRecalculada, cotizacionAceptada)) {
        // Al lanzar, TODA la transacción revierte — incluido el INSERT de
        // arriba: la clave queda libre para reintentarse con una cotización
        // nueva (no se "quema" por un desacuerdo de precio).
        const error = new AppError(
          'La cotización aceptada cambió: revisá el nuevo resumen antes de confirmar de nuevo',
          409,
        );
        error.cotizacionVigente = aRespuestaPublica(cotizacionRecalculada);
        error.codigo = 'COTIZACION_DESACTUALIZADA';
        throw error;
      }

      if (resultadoPago.estado === 'rechazado_simulado') {
        await IntentoCompra.update(
          {
            estado: 'rechazado',
            motivoRechazo: resultadoPago.motivoRechazo,
            actualizadoEn: new Date(),
          },
          { where: { idIntentoCompra: intento.idIntentoCompra }, transaction },
        );

        return {
          tipo: 'rechazado',
          motivoRechazo: resultadoPago.motivoRechazo,
          reintento: false,
        };
      }

      return await registrarCompraAprobada({
        transaction,
        cliente,
        usuario,
        idCliente,
        metodoEntrega,
        direccionEntrega,
        cotizacionRecalculada,
        medioPago,
        intento,
        datosPago: {
          tipo: resultadoPago.tipo,
          estado: 'aprobado_simulado',
          ultimosCuatroDigitos: resultadoPago.ultimosCuatroDigitos,
          marca: resultadoPago.marca,
        },
      });
    });
  } catch (error) {
    if (esErrorDeContencionTransitoria(error)) {
      throw new AppError(
        'Ocurrió una condición de carrera al procesar la compra; reintentá la operación',
        409,
      );
    }
    throw error;
  }

  if (resultado.tipo === 'aprobado') {
    resultado.venta = await obtenerVentaPorId(resultado.idVenta, usuario);

    // Envío de correo: DESPUÉS del commit (arriba), y solo en la
    // confirmación original — un reintento idempotente de una compra ya
    // aprobada no debe volver a mandar el comprobante (§8: "eviten envíos
    // duplicados al repetir la solicitud de compra"). No se espera un
    // resultado exitoso acá: enviarComprobantePorCorreo nunca lanza.
    if (!resultado.reintento) {
      await enviarComprobantePorCorreo(resultado.venta);
      // Se relee para reflejar estadoCorreo actualizado en la respuesta.
      resultado.venta = await obtenerVentaPorId(resultado.idVenta, usuario);
    }
  }

  return resultado;
};

// El checkout de cliente resuelve el medio de pago del catálogo a partir del
// tipo de pago simulado (no lo elige el cliente de una lista): busca por
// nombre fijo, sembrado por sembrarDatosDemo.js/sembrarDatosE2E.js. Si todavía no
// existe (base sin el seed actualizado), responde un 503 explícito en vez
// de fallar la venta con un error de FK confuso.
//
// Se lee con lock (SELECT...FOR UPDATE, mismo patrón que Producto en
// cotizacion.service.js — el nombre es único e indexado, ver
// medioPago.model.js) y se comprueba `habilitado`, así que una compra
// nueva podía completarse con un medio de pago que el personal ya había
// deshabilitado. El lock hace que, si alguien deshabilita el medio en el
// mismo instante en que se está confirmando una compra, ambas operaciones
// se serialicen en vez de que la compra lea un estado a punto de cambiar
// sin haberlo bloqueado. Solo se llama en la rama de un intento NUEVO (ver
// confirmarCompra): una compra ya aprobada nunca vuelve a mirar esto, así
// que sigue siendo recuperable aunque su medio se deshabilite después.
const resolverMedioPagoSimulado = async (tipoPagoSimulado, transaction) => {
  const nombre =
    tipoPagoSimulado === 'transferencia'
      ? 'Transferencia bancaria (simulada)'
      : 'Débito (simulado)';

  const medioPago = await MedioPago.findOne({
    where: { nombre },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!medioPago) {
    throw new AppError(
      `Falta sembrar el medio de pago "${nombre}" (correr sembrar:demo/sembrar:e2e con la versión actualizada)`,
      503,
    );
  }

  if (!medioPago.habilitado) {
    throw new AppError(
      `El medio de pago "${nombre}" no está disponible en este momento`,
      409,
    );
  }

  return medioPago;
};






const procesarWebhookMercadoPago = async (req) => {
  // 1. Validar la firma: no confiamos en notificaciones sin autenticar.
  const firmaValida = validarFirmaWebhook(req);

  if (!firmaValida) {
    throw new AppError('Firma de webhook de Mercado Pago inválida', 401);
  }

  // 2. Obtener el ID del pago notificado.
  const idPago =
    req.query?.['data.id'] ??
    req.body?.data?.id;

  if (!idPago) {
    throw new AppError('La notificación no contiene un ID de pago', 400);
  }

  // 3. Consultar el pago directamente en Mercado Pago.
  const pagoExterno = await consultarPago(String(idPago));

  // Las notificaciones pueden llegar antes de que el pago esté aprobado.
  // No creamos una venta para pagos pendientes o en proceso.
  if (pagoExterno.status !== 'approved') {
    return { procesado: false, estado: pagoExterno.status };
  }

  if (pagoExterno.currency_id !== 'ARS') {
    throw new AppError('La moneda del pago no coincide con la esperada', 400);
  }

  // 4. Identificar el intento mediante la referencia guardada al crear
  // la preferencia. No utilizamos un idCliente enviado por el navegador.
  const idIntentoCompra = Number(pagoExterno.external_reference);
  const idIntentoMetadata = Number(
    pagoExterno.metadata?.id_intento_compra,
  );

  if (
    !Number.isInteger(idIntentoCompra) ||
    idIntentoCompra <= 0 ||
    idIntentoMetadata !== idIntentoCompra
  ) {
    throw new AppError('El pago no corresponde a un intento válido', 400);
  }

  return sequelize.transaction(async (transaction) => {
    // 5. Bloquear el intento para evitar que dos webhooks simultáneos
    // registren dos ventas.
    const intento = await IntentoCompra.findByPk(idIntentoCompra, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!intento) {
      throw new AppError('No existe el intento asociado al pago', 404);
    }

    // Un webhook repetido nunca genera una segunda venta.
    if (intento.estado === 'aprobado') {
      if (String(intento.idPagoMercadoPago) !== String(pagoExterno.id)) {
        throw new AppError(
          'El intento ya fue aprobado con otro pago',
          409,
        );
      }

      return {
        procesado: true,
        reintento: true,
        idVenta: intento.idVenta,
      };
    }

    if (intento.estado !== 'pendiente_pago') {
      throw new AppError(
        'El intento no se encuentra pendiente de pago',
        409,
      );
    }

    const datosCompra = intento.datosCompra;

    if (
      !datosCompra ||
      !Array.isArray(datosCompra.detalles) ||
      !datosCompra.idUsuario ||
      !datosCompra.montoEsperadoCentavos
    ) {
      throw new AppError(
        'El intento no contiene los datos necesarios para confirmar la compra',
        409,
      );
    }

    // 6. Comprobar que el importe pagado coincide con el importe
    // de la preferencia que se creó para este intento.
    const montoPagadoCentavos = Math.round(
      Number(pagoExterno.transaction_amount) * 100,
    );

    if (montoPagadoCentavos !== Number(datosCompra.montoEsperadoCentavos)) {
      throw new AppError('El importe pagado no coincide con la compra', 409);
    }

    if (
      Number(pagoExterno.metadata?.id_cliente) !== Number(intento.idCliente)
    ) {
      throw new AppError('El cliente del pago no coincide con el intento', 409);
    }

    // 7. Recuperar cliente y usuario desde nuestra propia base de datos.
    const cliente = await Cliente.findByPk(intento.idCliente, {
      transaction,
    });

    if (!cliente) {
      throw new AppError('No existe el cliente asociado al intento', 404);
    }

    const usuario = await Usuario.findOne({
      where: { idCliente: intento.idCliente },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (
      !usuario ||
      Number(usuario.idUsuario) !== Number(datosCompra.idUsuario) ||
      !esCompradorRegistrado(usuario.rol)
    ) {
      throw new AppError('No se pudo verificar al comprador del intento', 409);
    }

    // 8. Orden de bloqueos: intento → medio de pago → productos.
    const medioPago = await resolverMedioPagoMercadoPago(transaction);

    // No reservamos stock mientras el pago está pendiente.
    // Lo comprobamos nuevamente ahora, antes de registrar la venta.
    const cotizacionRecalculada = await cotizar(datosCompra.detalles, {
      transaction,
    });

    if (
      cotizacionRecalculada.totalCentavos !==
      Number(datosCompra.montoEsperadoCentavos)
    ) {
      throw new AppError(
        'El precio de los productos cambió después del pago. La compra requiere revisión manual',
        409,
      );
    }

    // 9. Registrar venta y pago aprobado en la misma transacción.
    const resultado = await registrarCompraAprobada({
      transaction,
      cliente,
      usuario,
      idCliente: intento.idCliente,
      metodoEntrega: datosCompra.metodoEntrega,
      direccionEntrega: datosCompra.direccionEntrega,
      cotizacionRecalculada,
      medioPago,
      intento,
      datosPago: {
        tipo: 'mercado_pago',
        estado: 'aprobado',
        idPagoMercadoPago: String(pagoExterno.id),
      },
    });

    await intento.update(
      {
        idPagoMercadoPago: String(pagoExterno.id),
        actualizadoEn: new Date(),
      },
      { transaction },
    );

    return {
      procesado: true,
      reintento: false,
      idVenta: resultado.idVenta,
    };
  });
};

// Consulta el resultado de un intento de compra por su clave para recuperar
// una compra ya confirmada. Pura
// lectura, SIN transacción ni lock: nunca reemplaza el camino atómico de
// confirmarCompra (arriba) — una segunda confirmación con la misma clave
// SIEMPRE vuelve a pasar por el patrón INSERT...ON DUPLICATE KEY + SELECT...
// FOR UPDATE, nunca se salta ese camino solo porque esta consulta no
// encontró nada. "No encontrado" es intencionalmente ambiguo (puede ser que
// el intento nunca existió, que se revirtió, o que la transacción que lo creó
// todavía no haya terminado) y el frontend nunca debe interpretarlo como
// "no hay ningún conflicto posible".
const consultarIntento = async (clave, usuario) => {
  if (!esCompradorRegistrado(usuario?.rol)) {
    throw new AppError(
      'Solo un cliente puede consultar sus propios intentos de compra',
      403,
    );
  }

  const claveValidada = validarClaveIdempotencia(clave);

  // idCliente SIEMPRE de la sesión, nunca de la URL.
  const intento = await IntentoCompra.findOne({
    where: {
      claveIdempotencia: claveValidada,
      idCliente: usuario.idCliente,
    },
  });

  if (!intento) {
    return { encontrado: false };
  }

  if (intento.estado === 'aprobado') {
    return {
      encontrado: true,
      estado: 'aprobado',
      idVenta: intento.idVenta,
    };
  }

  if (intento.estado === 'rechazado') {
    return {
      encontrado: true,
      estado: 'rechazado',
      motivoRechazo: intento.motivoRechazo,
    };
  }

  if (intento.estado === 'pendiente_pago') {
    return {
      encontrado: true,
      estado: 'pendiente_pago',
      initPoint: intento.datosCompra?.initPoint ?? null,
    };
  }

  // El intento todavía está en preparación.
  return {
    encontrado: true,
    estado: 'procesando',
  };
};

export {
  confirmarCompra,
  consultarIntento,
  iniciarCheckoutMercadoPago,
  TTL_COTIZACION_MS,
  calcularHashContenido,
  cotizacionEstaDesactualizada,
  generarNumeroComprobante,
  validarClaveIdempotencia,
  validarCotizacionAceptada,
  procesarWebhookMercadoPago,
};
