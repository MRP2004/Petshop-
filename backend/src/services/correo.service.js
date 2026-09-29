import nodemailer from 'nodemailer';
import sequelize from '../config/database.js';
import Comprobante from '../models/comprobante.model.js';
import { formatearImporte, formatearFechaHora } from '../utils/formato.js';
import { etiquetaEstadoPago, etiquetaEstadoVenta } from '../utils/estadosLegibles.js';
import { generarPdfComprobante } from './comprobantePdf.service.js';

// Límite de tiempo para el intento de envío (revisión independiente,
// Codex): sendMail() se espera dentro de la respuesta HTTP de la compra
// (§8: "el envío ocurre después del commit", antes de responder — así el
// estado de correo que se muestra ya es el real, no "pendiente" a
// propósito). Sin este límite, un SMTP colgado bloquearía indefinidamente
// una respuesta de una venta que ya está confirmada de verdad. Un tiempo
// agotado NO es certeza de que el correo nunca se envió (podría haber
// salido igual, del lado del servidor SMTP, después de este límite) — se
// trata como 'fallido' por ser el estado más honesto disponible sin
// agregar un tercer estado "incierto" (ver comprobante.model.js).
const TIMEOUT_ENVIO_MS = 8000;

// Transporte configurado por variables de entorno (CU-04, §8/ronda de
// correcciones): SMTP real si hay SMTP_HOST configurado y no se pidió
// explícitamente el modo de prueba; si no, un transporte "json" que arma el
// mensaje en memoria y no manda nada real. Devuelve también `modo`, para
// que quien llama sepa CUÁL de los dos motivos de "no hay envío real" está
// pasando (antes ambos casos se guardaban igual, como si el mensaje se
// hubiera "enviado" — ver comprobante.model.js):
//   'prueba'         — CORREO_TRANSPORTE=prueba, explícito (usado por
//                      .env.test/.env.e2e: "no envíen correos reales
//                      durante las pruebas").
//   'no_configurado' — no hay SMTP_HOST y tampoco se pidió modo de prueba:
//                      alguien se olvidó de configurar el servicio en este
//                      entorno (p. ej. desarrollo local recién clonado).
//   'smtp'           — hay SMTP_HOST configurado: se intenta un envío real.
// Se crea de nuevo en cada llamada (nodemailer no abre conexión real hasta
// sendMail): más simple que memoizar y evita estado compartido entre
// pruebas que cambian la configuración.
const crearTransportador = () => {
  if (process.env.CORREO_TRANSPORTE === 'prueba') {
    return { transportador: nodemailer.createTransport({ jsonTransport: true }), modo: 'prueba' };
  }

  if (!process.env.SMTP_HOST) {
    return { transportador: null, modo: 'no_configurado' };
  }

  return {
    transportador: nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    }),
    modo: 'smtp',
  };
};

// El destinatario y el nombre son SIEMPRE el dato histórico del comprador
// (CU-04, ronda de correcciones — revisión de diseño, Codex): usar
// venta.cliente.email/nombre acá reintroduciría el mismo problema que en el
// PDF (ver comprobantePdf.service.js) — el cliente podría cambiar su correo
// entre el commit de la venta y el momento en que efectivamente se manda
// este mensaje (o en un reenvío posterior, mucho después), y el comprobante
// terminaría yendo a una casilla distinta de la que el comprador tenía al
// comprar. Con respaldo al dato actual solo para comprobantes emitidos
// antes de que existiera esta instantánea (nombreCompradorHistorico/
// correoCompradorHistorico son NULL en esos casos).

// URL pública, opcional, del frontend (corrección — revisión de Mauro tras
// probar la venta #20): `FRONTEND_URL` (usada para CORS, ver app.js) es
// SIEMPRE una URL de `localhost` en los tres entornos configurados hasta
// ahora (desarrollo, `.env.test`, `.env.e2e`) — nunca corresponde incluir
// esa URL en un correo real, que puede terminar en la bandeja de cualquier
// persona fuera de esta máquina. Se usa una variable NUEVA y separada,
// deliberadamente vacía por defecto: sin ella configurada, el correo
// simplemente omite el enlace (el resumen + el PDF adjunto ya alcanzan por
// sí solos para que el mensaje sea útil) en vez de mandar un enlace roto o
// engañoso.
const esHostPublico = (hostname) =>
  hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1';

// Valida también la forma de la URL configurada (no solo que exista): una
// variable mal cargada (vacía, o con un valor que no es una URL) nunca debe
// terminar rompiendo el envío del comprobante — se omite el enlace en vez de
// lanzar. Se lee `process.env` DENTRO de la función, no en una constante de
// módulo (mismo criterio que `crearTransportador()`/`CORREO_REMITENTE` más
// abajo, y no como se hizo acá en un primer intento): una constante de
// módulo queda congelada con el valor que tenía al importarse la primera
// vez, ignorando cualquier cambio posterior a esa variable de entorno.
const obtenerEnlaceValido = (idVenta) => {
  const urlPublicaFrontend = process.env.URL_PUBLICA_FRONTEND;

  if (!urlPublicaFrontend) return null;

  try {
    const url = new URL(`/mis-compras/${idVenta}`, urlPublicaFrontend);
    return esHostPublico(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
};

// `pdfAdjunto`: el mismo Buffer que genera comprobantePdf.service.js para la
// descarga manual desde el detalle de la venta (CU-04, corrección — "no
// mantengas dos diseños distintos"): el correo automático adjunta EXACTAMENTE
// ese PDF, no arma uno propio.
const construirMensaje = (venta, pdfAdjunto) => {
  const nombre = venta.comprobante.nombreCompradorHistorico ?? venta.cliente.nombre;
  const apellido = venta.comprobante.apellidoCompradorHistorico ?? venta.cliente.apellido;
  const destinatario = venta.comprobante.correoCompradorHistorico ?? venta.cliente.email;
  const enlace = obtenerEnlaceValido(venta.idVenta);

  // El reenvío debe reflejar el estado ACTUAL, incluida una venta cancelada
  // (CU-04, ronda de correcciones): antes el texto siempre decía "tu compra
  // fue confirmada", sin importar si después se canceló. El estado y el
  // pago vienen de las mismas etiquetas legibles que usa el PDF/la
  // pantalla, no un texto aparte.
  const lineaEstado = `Estado del pedido: ${etiquetaEstadoVenta(venta.estado)}.`;
  const lineaPago = venta.pago ? `Estado del pago: ${etiquetaEstadoPago(venta.pago.estado)}.` : '';
  const lineaEnlace = enlace ? `Podés verlo también en tu cuenta: ${enlace}\n\n` : '';

  return {
    from: process.env.CORREO_REMITENTE || 'no-responder@petshop.demo',
    to: destinatario,
    subject: `Comprobante de tu compra — ${venta.comprobante.numero}`,
    text:
      `Hola ${nombre} ${apellido},\n\n` +
      `Comprobante ${venta.comprobante.numero}, del ${formatearFechaHora(venta.fecha)}.\n` +
      `Total: ${formatearImporte(venta.total)}.\n` +
      `${lineaEstado}\n` +
      `${lineaPago}\n\n` +
      'Te adjuntamos el comprobante en PDF con el detalle completo de tu compra.\n\n' +
      lineaEnlace +
      'Comprobante de demostración — sin validez fiscal.',
    attachments: [
      {
        filename: `${venta.comprobante.numero}.pdf`,
        content: pdfAdjunto,
        contentType: 'application/pdf',
      },
    ],
  };
};

// Envío con límite de tiempo: si sendMail() no resuelve dentro de
// TIMEOUT_ENVIO_MS, se lo trata como fallido (igual que cualquier otro
// error de envío), sin esperarlo indefinidamente. El timer se limpia
// siempre (revisión independiente, Codex: la primera versión dejaba un
// setTimeout vivo incluso cuando sendMail() ya había resuelto rápido, lo
// que mantenía el proceso — o la corrida de pruebas — activo de más). El
// transporte se cierra siempre al final (si expone close()): para un
// transporte SMTP real evita dejar el socket abierto más de lo necesario;
// jsonTransport no abre ninguno, pero cerrar igual no tiene costo.
const enviarConLimiteDeTiempo = (transportador, mensaje) => {
  let idTimeout;

  const limiteDeTiempo = new Promise((_resolve, reject) => {
    idTimeout = setTimeout(
      () => reject(new Error('Tiempo de espera agotado al enviar el correo')),
      TIMEOUT_ENVIO_MS,
    );
  });

  return Promise.race([transportador.sendMail(mensaje), limiteDeTiempo])
    .finally(() => clearTimeout(idTimeout))
    .finally(() => transportador.close?.());
};

const actualizarEstadoCorreo = async (idVenta, estadoCorreo) => {
  try {
    // Incremento atómico en SQL (no `venta.comprobante.intentosEnvioCorreo + 1`
    // calculado en JS con un valor potencialmente desactualizado): dos
    // envíos concurrentes del mismo comprobante (confirmación + un reenvío
    // manual solapado, poco probable pero posible) no se pisan el contador
    // entre sí.
    await Comprobante.update(
      {
        estadoCorreo,
        intentosEnvioCorreo: sequelize.literal('intentosEnvioCorreo + 1'),
      },
      { where: { idVenta } },
    );
  } catch (error) {
    console.error(
      `No se pudo actualizar el estado de correo de la venta ${idVenta}:`,
      error.message,
    );
  }
};

// Envía el comprobante por correo y actualiza estadoCorreo/intentosEnvioCorreo.
// Se llama SIEMPRE después de que la venta ya está comiteada (§8: "el envío
// ocurre después del commit") y solo en la confirmación original, nunca en
// un reintento idempotente (ver compra.service.js) — así se evitan envíos
// duplicados al repetir la solicitud de compra.
//
// Nunca lanza, bajo ningún escenario (revisión independiente, Codex: antes,
// si la propia actualización de estado en la base fallaba, ese error SÍ se
// propagaba sin atrapar, y podía convertir la respuesta de una venta ya
// confirmada en un 500): una falla de correo, o de guardar su estado, queda
// registrada y punto — nunca tumba la respuesta de una compra ya
// confirmada. Esto incluye una falla al GENERAR el PDF adjunto (corrección
// — venta #20): si `generarPdfComprobante` lanza, se trata exactamente
// igual que cualquier otro fallo de envío — 'fallido', sin adjunto parcial
// ni un correo a medias.
const enviarComprobantePorCorreo = async (venta) => {
  if (!venta.comprobante || venta.comprobante.estadoCorreo === 'no_aplica') {
    return; // venta sin comprobante (carga manual) o cliente sin email: nada que enviar.
  }

  const { transportador, modo } = crearTransportador();

  if (modo === 'no_configurado') {
    // Ni siquiera se arma el mensaje: no hay ningún transporte al que
    // dárselo. Se distingue de 'fallido' (que sí implica un intento real
    // que no prosperó) — ver comprobante.model.js.
    await actualizarEstadoCorreo(venta.idVenta, 'no_configurado');
    return;
  }

  let estadoFinal = 'fallido';

  try {
    const pdfAdjunto = await generarPdfComprobante(venta);
    const info = await enviarConLimiteDeTiempo(transportador, construirMensaje(venta, pdfAdjunto));

    if (modo === 'prueba') {
      // El transporte de prueba arma el mensaje en memoria y nunca lo
      // manda a ningún lado: jamás puede considerarse "aceptado" por un
      // servidor real (CU-04, ronda de correcciones — "un transporte en
      // memoria nunca debe producir un mensaje de 'correo enviado'").
      estadoFinal = 'simulado';
    } else {
      // SMTP real: `info.rejected` lista direcciones que el servidor
      // explícitamente rechazó; `info.accepted`, las que aceptó. La
      // aceptación del proveedor SMTP no es lo mismo que "llegó a la
      // bandeja del destinatario" — eso esta capa no puede saberlo, y no se
      // lo hace pasar por tal (ver docs/cu04-checkout-pago.md).
      const destinatarioRechazado = Array.isArray(info?.rejected) && info.rejected.length > 0;
      const destinatarioAceptado = !Array.isArray(info?.accepted) || info.accepted.length > 0;
      estadoFinal = destinatarioRechazado || !destinatarioAceptado ? 'fallido' : 'aceptado';
    }
  } catch (error) {
    console.error(
      `No se pudo generar o enviar el comprobante de la venta ${venta.idVenta} por correo:`,
      error.message,
    );
  }

  await actualizarEstadoCorreo(venta.idVenta, estadoFinal);
};

export { enviarComprobantePorCorreo };
