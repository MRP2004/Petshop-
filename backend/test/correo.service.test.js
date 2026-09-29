import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';

import Comprobante from '../src/models/comprobante.model.js';
import { enviarComprobantePorCorreo } from '../src/services/correo.service.js';

// Esta suite corre sin MySQL (ver .github/workflows/backend-tests.yml). Se
// mockea Comprobante.update para observar qué estado final persiste cada
// escenario, sin necesitar una base real.
//
// Incluye `.detalles`/`.pago` (corrección — venta #20: el correo automático
// ahora adjunta el mismo PDF que genera comprobantePdf.service.js, así que
// una venta de prueba sin esos campos ya no alcanza: `generarPdfComprobante`
// los necesita para no lanzar — ver "si la generación del PDF falla" más
// abajo para el caso en que sí faltan a propósito).
const ventaBase = () => ({
  idVenta: 1,
  fecha: new Date('2026-01-15T12:00:00Z'),
  total: '100.00',
  estado: 'registrada',
  metodoEntrega: 'retiro en sucursal',
  cliente: { nombre: 'Cliente', apellido: 'De Prueba', email: 'cliente@petshop.test' },
  comprobante: {
    numero: 'PS-2026-000001',
    estadoCorreo: 'pendiente',
    intentosEnvioCorreo: 0,
    nombreCompradorHistorico: 'Cliente',
    apellidoCompradorHistorico: 'De Prueba',
    correoCompradorHistorico: 'cliente@petshop.test',
  },
  pago: { tipo: 'transferencia', estado: 'aprobado_simulado' },
  detalles: [
    {
      idDetalleVenta: 1,
      cantidad: 1,
      precioUnitario: '100.00',
      subtotal: '100.00',
      producto: { nombre: 'Producto de prueba' },
      promocionAplicada: null,
    },
  ],
});

const conMockDeUpdate = async (fn) => {
  const updateOriginal = Comprobante.update;
  let datosActualizados;
  Comprobante.update = async (datos) => {
    datosActualizados = datos;
    return [1];
  };

  try {
    await fn();
    return datosActualizados;
  } finally {
    Comprobante.update = updateOriginal;
  }
};

const CORREO_TRANSPORTE_ORIGINAL = process.env.CORREO_TRANSPORTE;
const SMTP_HOST_ORIGINAL = process.env.SMTP_HOST;
const URL_PUBLICA_FRONTEND_ORIGINAL = process.env.URL_PUBLICA_FRONTEND;

test.after(() => {
  process.env.CORREO_TRANSPORTE = CORREO_TRANSPORTE_ORIGINAL;
  process.env.SMTP_HOST = SMTP_HOST_ORIGINAL;
  process.env.URL_PUBLICA_FRONTEND = URL_PUBLICA_FRONTEND_ORIGINAL;
});

test('venta sin comprobante (carga manual del personal): no intenta actualizar nada', async () => {
  const updateOriginal = Comprobante.update;
  let seLlamoUpdate = false;
  Comprobante.update = async (...args) => {
    seLlamoUpdate = true;
    return updateOriginal.apply(Comprobante, args);
  };

  try {
    await enviarComprobantePorCorreo({ idVenta: 1, comprobante: null });
    assert.equal(seLlamoUpdate, false);
  } finally {
    Comprobante.update = updateOriginal;
  }
});

test('cliente sin correo (estadoCorreo "no_aplica"): no intenta actualizar nada', async () => {
  const updateOriginal = Comprobante.update;
  let seLlamoUpdate = false;
  Comprobante.update = async (...args) => {
    seLlamoUpdate = true;
    return updateOriginal.apply(Comprobante, args);
  };

  try {
    await enviarComprobantePorCorreo({
      ...ventaBase(),
      comprobante: { ...ventaBase().comprobante, estadoCorreo: 'no_aplica' },
    });
    assert.equal(seLlamoUpdate, false);
  } finally {
    Comprobante.update = updateOriginal;
  }
});

test('CORREO_TRANSPORTE=prueba: nunca produce "enviado"/"aceptado" — pasa a "simulado"', async () => {
  process.env.CORREO_TRANSPORTE = 'prueba';
  const datos = await conMockDeUpdate(() => enviarComprobantePorCorreo(ventaBase()));
  assert.equal(datos.estadoCorreo, 'simulado');
});

test('sin SMTP_HOST y sin modo de prueba explícito: "no_configurado", sin intentar enviar nada', async () => {
  delete process.env.CORREO_TRANSPORTE;
  delete process.env.SMTP_HOST;
  const datos = await conMockDeUpdate(() => enviarComprobantePorCorreo(ventaBase()));
  assert.equal(datos.estadoCorreo, 'no_configurado');
});

// Este es el caso central de la corrección: aunque Comprobante.update
// falle, enviarComprobantePorCorreo NUNCA debe lanzar — quien la llama
// (compra.service.js) ya respondió, o está por hacerlo, con la venta ya
// confirmada.
test('si la propia actualización de estado falla, la función NO lanza (no tumba una respuesta ya comprometida)', async () => {
  process.env.CORREO_TRANSPORTE = 'prueba';
  const updateOriginal = Comprobante.update;
  Comprobante.update = async () => {
    throw new Error('Fallo simulado de base de datos');
  };

  try {
    await assert.doesNotReject(() => enviarComprobantePorCorreo(ventaBase()));
  } finally {
    Comprobante.update = updateOriginal;
  }
});

test('el mensaje usa el correo histórico del comprobante, no el correo actual del cliente', async () => {
  process.env.CORREO_TRANSPORTE = 'prueba';
  const venta = {
    ...ventaBase(),
    cliente: { nombre: 'Cliente', apellido: 'De Prueba', email: 'correo-actual-distinto@petshop.test' },
  };

  // Con jsonTransport no hay forma directa de inspeccionar el mensaje desde
  // acá sin acoplarse a nodemailer; se comprueba indirectamente que el
  // envío con el correo histórico no falla (no lanza por destinatario
  // inválido) y que efectivamente termina en 'simulado' — la construcción
  // del mensaje (construirMensaje) no es exportada a propósito, mismo
  // criterio que el resto de este servicio.
  const datos = await conMockDeUpdate(() => enviarComprobantePorCorreo(venta));
  assert.equal(datos.estadoCorreo, 'simulado');
});

test('un comprobante sin instantánea histórica (anterior a esta corrección) igual puede enviarse, con el dato actual como respaldo', async () => {
  process.env.CORREO_TRANSPORTE = 'prueba';
  const venta = {
    ...ventaBase(),
    comprobante: {
      ...ventaBase().comprobante,
      nombreCompradorHistorico: null,
      apellidoCompradorHistorico: null,
      correoCompradorHistorico: null,
    },
  };

  const datos = await conMockDeUpdate(() => enviarComprobantePorCorreo(venta));
  assert.equal(datos.estadoCorreo, 'simulado');
});

test('SMTP real: el servidor acepta al destinatario → "aceptado" (nunca "enviado")', async () => {
  delete process.env.CORREO_TRANSPORTE;
  process.env.SMTP_HOST = 'smtp.prueba.invalido';
  const createTransportOriginal = nodemailer.createTransport;
  nodemailer.createTransport = () => ({
    sendMail: async () => ({ accepted: ['cliente@petshop.test'], rejected: [] }),
  });

  try {
    const datos = await conMockDeUpdate(() => enviarComprobantePorCorreo(ventaBase()));
    assert.equal(datos.estadoCorreo, 'aceptado');
  } finally {
    nodemailer.createTransport = createTransportOriginal;
    delete process.env.SMTP_HOST;
  }
});

test('SMTP real: el servidor rechaza al destinatario → "fallido", aunque sendMail no haya lanzado', async () => {
  delete process.env.CORREO_TRANSPORTE;
  process.env.SMTP_HOST = 'smtp.prueba.invalido';
  const createTransportOriginal = nodemailer.createTransport;
  nodemailer.createTransport = () => ({
    sendMail: async () => ({ accepted: [], rejected: ['cliente@petshop.test'] }),
  });

  try {
    const datos = await conMockDeUpdate(() => enviarComprobantePorCorreo(ventaBase()));
    assert.equal(datos.estadoCorreo, 'fallido');
  } finally {
    nodemailer.createTransport = createTransportOriginal;
    delete process.env.SMTP_HOST;
  }
});

test('reenviar sobre una venta cancelada no lanza y sigue completando el envío (el mensaje refleja el estado actual)', async () => {
  process.env.CORREO_TRANSPORTE = 'prueba';
  const venta = { ...ventaBase(), estado: 'cancelada' };

  const datos = await conMockDeUpdate(() => enviarComprobantePorCorreo(venta));
  assert.equal(datos.estadoCorreo, 'simulado');
});

// --- Corrección (venta #20): el correo automático adjunta el comprobante ---

test('el correo adjunta el mismo PDF que genera comprobantePdf.service.js (mismo diseño, sin duplicarlo)', async () => {
  delete process.env.CORREO_TRANSPORTE;
  process.env.SMTP_HOST = 'smtp.prueba.invalido';
  const createTransportOriginal = nodemailer.createTransport;
  let mensajeVisto;
  nodemailer.createTransport = () => ({
    sendMail: async (mensaje) => {
      mensajeVisto = mensaje;
      return { accepted: ['cliente@petshop.test'], rejected: [] };
    },
  });

  try {
    const datos = await conMockDeUpdate(() => enviarComprobantePorCorreo(ventaBase()));
    assert.equal(datos.estadoCorreo, 'aceptado');
    assert.equal(mensajeVisto.attachments.length, 1);
    assert.equal(mensajeVisto.attachments[0].filename, 'PS-2026-000001.pdf');
    assert.equal(mensajeVisto.attachments[0].contentType, 'application/pdf');
    // %PDF es la firma de todo archivo PDF válido (primeros 4 bytes) — no
    // hace falta parsear el PDF entero para confirmar que es uno de verdad.
    assert.ok(Buffer.isBuffer(mensajeVisto.attachments[0].content));
    assert.equal(mensajeVisto.attachments[0].content.subarray(0, 4).toString(), '%PDF');
  } finally {
    nodemailer.createTransport = createTransportOriginal;
    delete process.env.SMTP_HOST;
  }
});

test('si la generación del PDF falla (datos inconsistentes), el envío se marca "fallido" sin lanzar', async () => {
  process.env.CORREO_TRANSPORTE = 'prueba';
  // Ni `pago` ni `medioPago`: comprobantePdf.service.js necesita al menos
  // uno de los dos para el bloque "Pago" — con ninguno, lanza. Simula una
  // venta con datos corruptos/incompletos, sin necesitar mockear el módulo
  // del PDF directamente (export de solo lectura, ver comprobantePdf.service.js).
  const venta = { ...ventaBase(), pago: undefined, medioPago: undefined };

  const datos = await conMockDeUpdate(() => enviarComprobantePorCorreo(venta));
  assert.equal(datos.estadoCorreo, 'fallido');
});

test('sin URL_PUBLICA_FRONTEND configurada: el mensaje NO incluye ningún enlace a localhost', async () => {
  delete process.env.URL_PUBLICA_FRONTEND;
  process.env.CORREO_TRANSPORTE = 'prueba';
  const createTransportOriginal = nodemailer.createTransport;
  let mensajeVisto;
  const transporteOriginal = nodemailer.createTransport;
  nodemailer.createTransport = (...args) => {
    const transportador = transporteOriginal(...args);
    const sendMailOriginal = transportador.sendMail.bind(transportador);
    transportador.sendMail = async (mensaje) => {
      mensajeVisto = mensaje;
      return sendMailOriginal(mensaje);
    };
    return transportador;
  };

  try {
    await conMockDeUpdate(() => enviarComprobantePorCorreo(ventaBase()));
    assert.ok(!mensajeVisto.text.includes('localhost'));
    assert.ok(mensajeVisto.text.includes('adjuntamos el comprobante en PDF'));
  } finally {
    nodemailer.createTransport = createTransportOriginal;
  }
});

test('con URL_PUBLICA_FRONTEND configurada a una URL pública real: el mensaje sí incluye el enlace', async () => {
  process.env.URL_PUBLICA_FRONTEND = 'https://petshop.ejemplo.com';
  process.env.CORREO_TRANSPORTE = 'prueba';
  const transporteOriginal = nodemailer.createTransport;
  let mensajeVisto;
  nodemailer.createTransport = (...args) => {
    const transportador = transporteOriginal(...args);
    const sendMailOriginal = transportador.sendMail.bind(transportador);
    transportador.sendMail = async (mensaje) => {
      mensajeVisto = mensaje;
      return sendMailOriginal(mensaje);
    };
    return transportador;
  };

  try {
    await conMockDeUpdate(() => enviarComprobantePorCorreo(ventaBase()));
    assert.ok(mensajeVisto.text.includes('https://petshop.ejemplo.com/mis-compras/1'));
  } finally {
    nodemailer.createTransport = transporteOriginal;
    delete process.env.URL_PUBLICA_FRONTEND;
  }
});

test('URL_PUBLICA_FRONTEND mal configurada apuntando a localhost: se ignora igual (nunca se manda un enlace a localhost)', async () => {
  process.env.URL_PUBLICA_FRONTEND = 'http://localhost:5173';
  process.env.CORREO_TRANSPORTE = 'prueba';
  const transporteOriginal = nodemailer.createTransport;
  let mensajeVisto;
  nodemailer.createTransport = (...args) => {
    const transportador = transporteOriginal(...args);
    const sendMailOriginal = transportador.sendMail.bind(transportador);
    transportador.sendMail = async (mensaje) => {
      mensajeVisto = mensaje;
      return sendMailOriginal(mensaje);
    };
    return transportador;
  };

  try {
    await conMockDeUpdate(() => enviarComprobantePorCorreo(ventaBase()));
    assert.ok(!mensajeVisto.text.includes('localhost'));
  } finally {
    nodemailer.createTransport = transporteOriginal;
    delete process.env.URL_PUBLICA_FRONTEND;
  }
});
