// Pruebas de integración real contra MySQL para el ciclo de vida de la
// venta: registro, cancelación, envío y las condiciones de carrera del
// Corte B. Requieren una base de datos de pruebas ya preparada (ver
// docs/backend-base-de-datos.md) y NO se ejecutan con `npm test`.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import sequelize from '../src/config/database.js';
import Venta from '../src/models/venta.model.js';
import DetalleVenta from '../src/models/detalleVenta.model.js';
import Producto from '../src/models/producto.model.js';
import {
  registrarVenta,
  cancelarVenta,
  marcarVentaComoEnviada,
  obtenerVentaPorId,
} from '../src/services/venta.service.js';
import { ajustarStockProducto } from '../src/services/producto.service.js';
import {
  prepararEsquema,
  limpiarDatos,
  crearClienteDePrueba,
  crearMedioPagoDePrueba,
  crearProductoDePrueba,
  retenerBloqueoDeFila,
  esperarContencionSobre,
} from './ayudaIntegracion.js';

let cliente;
let medioPago;

before(async () => {
  await prepararEsquema();
});

beforeEach(async () => {
  await limpiarDatos();
  cliente = await crearClienteDePrueba();
  medioPago = await crearMedioPagoDePrueba();
});

after(async () => {
  await sequelize.close();
});

// Ejecuta dos operaciones reales que compiten por el mismo bloqueo de fila,
// confirmando contención real antes de resolverla (en vez de confiar en que
// Promise.allSettled por sí solo entrelace las llamadas como se espera).
// Garantiza liberar el bloqueo (con timeout) aunque falle una aserción, para
// no dejar transacciones abiertas.
const ejecutarConContencionReal = async (
  { tabla, columnaId, id },
  operaciones,
) => {
  const { idConexion, liberar } = await retenerBloqueoDeFila(
    tabla,
    columnaId,
    id,
  );

  try {
    const promesas = operaciones.map((operacion) => operacion());

    const huboContencion = await esperarContencionSobre(idConexion, {
      timeoutMs: 3000,
    });

    assert.equal(
      huboContencion,
      true,
      'no se detectó contención real sobre el bloqueo retenido: la prueba ' +
        'no demuestra lo que dice demostrar (ver performance_schema.data_lock_waits)',
    );

    await liberar();

    return Promise.allSettled(promesas);
  } finally {
    // No-op si ya se liberó arriba; garantiza que, ante cualquier falla
    // (incluida la del assert de contención), no quede una transacción
    // abierta en la conexión cruda.
    await liberar();
  }
};

test('registrar una venta válida decrementa el stock y persiste cabecera, detalles e importes', async () => {
  const producto = await crearProductoDePrueba({
    nombre: 'Alimento gato 1kg',
    precio: '250.50',
    stockActual: 20,
  });

  const venta = await registrarVenta({
    idCliente: cliente.idCliente,
    idMedioPago: medioPago.idMedioPago,
    detalles: [{ idProducto: producto.idProducto, cantidad: 3 }],
  });

  assert.equal(venta.estado, 'registrada');
  assert.equal(venta.total, '751.50'); // 250.50 * 3
  assert.equal(venta.detalles.length, 1);
  assert.equal(venta.detalles[0].cantidad, 3);
  assert.equal(venta.detalles[0].precioUnitario, '250.50');
  assert.equal(venta.detalles[0].subtotal, '751.50');

  const productoActualizado = await Producto.findByPk(producto.idProducto);
  assert.equal(productoActualizado.stockActual, 17); // 20 - 3
});

test('stock insuficiente rechaza la venta con 409 y no decrementa nada', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 2 });

  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: cliente.idCliente,
        idMedioPago: medioPago.idMedioPago,
        detalles: [{ idProducto: producto.idProducto, cantidad: 5 }],
      }),
    (error) => error.statusCode === 409,
  );

  const productoActualizado = await Producto.findByPk(producto.idProducto);
  assert.equal(productoActualizado.stockActual, 2);

  const cantidadVentas = await Venta.count();
  assert.equal(cantidadVentas, 0);
});

test('validación: un fallo por stock insuficiente antes de escribir nada no crea venta, detalles ni toca stock', async () => {
  // Este caso falla en la validación (loop de lectura), antes de que
  // registrarVenta cree la Venta o cualquier DetalleVenta. Se conserva
  // como caso de validación; el caso de abajo ("rollback real...") cubre
  // en cambio un fallo que ocurre DESPUÉS de que ya hubo escrituras reales
  // dentro de la misma transacción.
  const productoConStock = await crearProductoDePrueba({
    nombre: 'Producto con stock',
    stockActual: 100,
  });
  const productoSinStock = await crearProductoDePrueba({
    nombre: 'Producto sin stock',
    stockActual: 1,
  });

  await assert.rejects(() =>
    registrarVenta({
      idCliente: cliente.idCliente,
      idMedioPago: medioPago.idMedioPago,
      detalles: [
        { idProducto: productoConStock.idProducto, cantidad: 5 },
        { idProducto: productoSinStock.idProducto, cantidad: 5 },
      ],
    }),
  );

  const productoConStockActualizado = await Producto.findByPk(
    productoConStock.idProducto,
  );
  assert.equal(productoConStockActualizado.stockActual, 100);
  assert.equal(await Venta.count(), 0);
  assert.equal(await DetalleVenta.count(), 0);
});

test('rollback real: un fallo después de escrituras reales dentro de la transacción revierte todo (Venta, DetalleVenta y stock ya restituido)', async () => {
  // Escenario: dos productos vendidos en una única venta. Al cancelar, el
  // bucle de cancelarVenta restituye el stock producto por producto, EN
  // ORDEN ASCENDENTE de idProducto. El primero se restituye con éxito (una
  // escritura real, dentro de la transacción); el segundo se restituiría a
  // un valor que excede el máximo de INTEGER (validación agregada en esta
  // corrección), lo que hace fallar la transacción completa DESPUÉS de que
  // la primera escritura ya ocurrió (sin commitear todavía).
  const productoA = await crearProductoDePrueba({
    nombre: 'A - stock normal',
    stockActual: 10,
  });
  const productoB = await crearProductoDePrueba({
    nombre: 'B - va a quedar en el máximo',
    stockActual: 10,
  });

  // Nos aseguramos de que productoA.idProducto < productoB.idProducto, para
  // que el orden ascendente del bucle de cancelarVenta procese primero A.
  assert.ok(productoA.idProducto < productoB.idProducto);

  const venta = await registrarVenta({
    idCliente: cliente.idCliente,
    idMedioPago: medioPago.idMedioPago,
    detalles: [
      { idProducto: productoA.idProducto, cantidad: 3 },
      { idProducto: productoB.idProducto, cantidad: 3 },
    ],
  });

  // productoA: 10 - 3 = 7. productoB: 10 - 3 = 7, y ahora se lo lleva (con
  // una entrada real de stock, operación ya probada de forma aislada) hasta
  // el máximo representable, para que restituir 3 unidades más desborde.
  const MAXIMO_ENTERO_POSITIVO = 2147483647;
  await ajustarStockProducto(productoB.idProducto, {
    cantidad: MAXIMO_ENTERO_POSITIVO - 7,
  });

  const productoBAntesDeCancelar = await Producto.findByPk(
    productoB.idProducto,
  );
  assert.equal(productoBAntesDeCancelar.stockActual, MAXIMO_ENTERO_POSITIVO);

  await assert.rejects(
    () => cancelarVenta(venta.idVenta),
    (error) => error.statusCode === 409,
  );

  // La venta NO debe haber quedado cancelada...
  const ventaFinal = await obtenerVentaPorId(venta.idVenta);
  assert.equal(ventaFinal.estado, 'registrada');

  // ...ni productoA debe haber quedado con la restitución a medio aplicar
  // (7 + 3 = 10 es lo que se hubiera visto si el rollback NO hubiera
  // revertido esa primera escritura real).
  const productoAFinal = await Producto.findByPk(productoA.idProducto);
  assert.equal(
    productoAFinal.stockActual,
    7,
    'la restitución de A (ya ejecutada dentro de la transacción) debía revertirse',
  );

  const productoBFinal = await Producto.findByPk(productoB.idProducto);
  assert.equal(productoBFinal.stockActual, MAXIMO_ENTERO_POSITIVO);
});

test('un subtotal individual fuera de rango se rechaza específicamente por el subtotal, no por el descuento', async () => {
  const producto = await crearProductoDePrueba({
    precio: '99999999.99', // máximo de DECIMAL(10,2)
    stockActual: 10,
  });

  // El descuento es válido por sí mismo (99999999.99, el máximo permitido
  // para un importe): si el rechazo ocurriera por el descuento, este valor
  // no lo explicaría. Lo que debe fallar es el subtotal de la línea
  // (99999999.99 * 2 = 199999999.98), muchísimo antes de llegar siquiera a
  // comparar el descuento contra el subtotal general.
  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: cliente.idCliente,
        idMedioPago: medioPago.idMedioPago,
        detalles: [{ idProducto: producto.idProducto, cantidad: 2 }],
        descuento: 99999999.99,
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message ===
        `El subtotal del producto ${producto.nombre} supera el máximo permitido`,
  );

  assert.equal(await Venta.count(), 0);

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 10, 'no debía tocarse el stock');
});

test('un total final fuera de rango se rechaza aunque cada subtotal individual sea válido', async () => {
  const productoUno = await crearProductoDePrueba({
    nombre: 'Producto A',
    precio: '60000000.00',
    stockActual: 10,
  });
  const productoDos = await crearProductoDePrueba({
    nombre: 'Producto B',
    precio: '60000000.00',
    stockActual: 10,
  });

  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: cliente.idCliente,
        idMedioPago: medioPago.idMedioPago,
        detalles: [
          { idProducto: productoUno.idProducto, cantidad: 1 },
          { idProducto: productoDos.idProducto, cantidad: 1 },
        ],
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El total de la venta supera el máximo permitido',
  );

  assert.equal(await Venta.count(), 0);
});

test('cancelar una venta restituye exactamente el stock vendido', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 10 });

  const venta = await registrarVenta({
    idCliente: cliente.idCliente,
    idMedioPago: medioPago.idMedioPago,
    detalles: [{ idProducto: producto.idProducto, cantidad: 4 }],
  });

  const ventaCancelada = await cancelarVenta(venta.idVenta);
  assert.equal(ventaCancelada.estado, 'cancelada');

  const productoActualizado = await Producto.findByPk(producto.idProducto);
  assert.equal(productoActualizado.stockActual, 10); // 10 - 4 + 4
});

test('cancelar una venta ya cancelada (secuencial) responde 409 y no vuelve a restituir stock', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 10 });

  const venta = await registrarVenta({
    idCliente: cliente.idCliente,
    idMedioPago: medioPago.idMedioPago,
    detalles: [{ idProducto: producto.idProducto, cantidad: 4 }],
  });

  await cancelarVenta(venta.idVenta);

  await assert.rejects(
    () => cancelarVenta(venta.idVenta),
    (error) =>
      error.statusCode === 409 &&
      error.message === 'Solo se pueden cancelar ventas registradas',
  );

  const productoActualizado = await Producto.findByPk(producto.idProducto);
  assert.equal(productoActualizado.stockActual, 10);
});

test('marcar como enviada cambia el estado; enviar o cancelar de nuevo se rechaza', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 10 });

  const venta = await registrarVenta({
    idCliente: cliente.idCliente,
    idMedioPago: medioPago.idMedioPago,
    detalles: [{ idProducto: producto.idProducto, cantidad: 2 }],
  });

  const ventaEnviada = await marcarVentaComoEnviada(venta.idVenta);
  assert.equal(ventaEnviada.estado, 'enviada');

  await assert.rejects(
    () => marcarVentaComoEnviada(venta.idVenta),
    (error) => error.statusCode === 409,
  );

  await assert.rejects(
    () => cancelarVenta(venta.idVenta),
    (error) => error.statusCode === 409,
  );

  const productoActualizado = await Producto.findByPk(producto.idProducto);
  assert.equal(productoActualizado.stockActual, 8);
});

test('concurrencia real (contención confirmada): cancelar y enviar al mismo tiempo, solo una transición exitosa', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 10 });

  const venta = await registrarVenta({
    idCliente: cliente.idCliente,
    idMedioPago: medioPago.idMedioPago,
    detalles: [{ idProducto: producto.idProducto, cantidad: 4 }],
  });

  const resultados = await ejecutarConContencionReal(
    { tabla: 'venta', columnaId: 'idVenta', id: venta.idVenta },
    [
      () => cancelarVenta(venta.idVenta),
      () => marcarVentaComoEnviada(venta.idVenta),
    ],
  );

  const exitosas = resultados.filter((r) => r.status === 'fulfilled');
  const fallidas = resultados.filter((r) => r.status === 'rejected');

  assert.equal(exitosas.length, 1, 'exactamente una transición debía tener éxito');
  assert.equal(fallidas.length, 1);
  assert.equal(fallidas[0].reason.statusCode, 409);

  const ventaFinal = await obtenerVentaPorId(venta.idVenta);
  const productoFinal = await Producto.findByPk(producto.idProducto);

  if (ventaFinal.estado === 'cancelada') {
    assert.equal(productoFinal.stockActual, 10);
  } else {
    assert.equal(ventaFinal.estado, 'enviada');
    assert.equal(productoFinal.stockActual, 6);
  }
});

test('concurrencia real (contención confirmada): dos cancelaciones simultáneas de la misma venta, solo una exitosa, sin duplicar restitución', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 10 });

  const venta = await registrarVenta({
    idCliente: cliente.idCliente,
    idMedioPago: medioPago.idMedioPago,
    detalles: [{ idProducto: producto.idProducto, cantidad: 4 }],
  });

  const resultados = await ejecutarConContencionReal(
    { tabla: 'venta', columnaId: 'idVenta', id: venta.idVenta },
    [() => cancelarVenta(venta.idVenta), () => cancelarVenta(venta.idVenta)],
  );

  const exitosas = resultados.filter((r) => r.status === 'fulfilled');
  const fallidas = resultados.filter((r) => r.status === 'rejected');

  assert.equal(exitosas.length, 1);
  assert.equal(fallidas.length, 1);
  assert.equal(fallidas[0].reason.statusCode, 409);

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(
    productoFinal.stockActual,
    10,
    'la restitución debía aplicarse exactamente una vez, no dos',
  );
});

test('concurrencia real (contención confirmada): dos ventas simultáneas sobre el mismo stock no generan sobreventa', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 5 });

  const pedido = (cantidad) => () =>
    registrarVenta({
      idCliente: cliente.idCliente,
      idMedioPago: medioPago.idMedioPago,
      detalles: [{ idProducto: producto.idProducto, cantidad }],
    });

  // Dos ventas concurrentes piden 3 unidades cada una sobre un stock de 5:
  // juntas exceden el stock disponible, así que como máximo una puede
  // tener éxito. El bloqueo retenido acá es el mismo que ambas competirían
  // por tomar (LOCK.UPDATE sobre Producto), así que confirmar contención
  // sobre esta conexión prueba que las dos llegaron a competir de verdad.
  const resultados = await ejecutarConContencionReal(
    { tabla: 'producto', columnaId: 'idProducto', id: producto.idProducto },
    [pedido(3), pedido(3)],
  );

  const exitosas = resultados.filter((r) => r.status === 'fulfilled');
  const fallidas = resultados.filter((r) => r.status === 'rejected');

  assert.equal(exitosas.length, 1);
  assert.equal(fallidas.length, 1);
  assert.equal(fallidas[0].reason.statusCode, 409);

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 2); // 5 - 3, nunca negativo ni 5 - 6
});
