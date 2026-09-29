// Intento de compra en curso (CU-04): se guarda en localStorage, asociado a
// un usuario y a una "firma" del carrito (qué productos y cantidades), para
// poder recuperarse de una respuesta perdida o de recargar la página sin
// generar una segunda compra ni perder la entrega elegida (ver
// docs/cu04-checkout-pago.md, "Recuperación tras perder la respuesta").
// NUNCA guarda datos de pago (ni tipo, ni tarjeta): eso se vuelve a pedir
// siempre que hace falta un intento nuevo.
//
// Se asocia a `idCliente` (revisión de diseño, Codex — ronda de
// correcciones): sin esto, cerrar sesión e iniciar con otra cuenta en el
// mismo navegador podía "heredar" el intento en curso de la cuenta
// anterior. Un intento guardado que no coincide con el idCliente de la
// sesión actual se ignora (no se mezcla, tampoco se borra: si se vuelve a
// esa cuenta, sigue disponible).
const CLAVE_ALMACENAMIENTO = 'petshop_compra_en_curso';

// Respaldo en memoria: si NINGÚN almacenamiento del navegador está
// disponible, esto sigue devolviendo la MISMA clave dentro de la misma
// carga de página, en vez de generar una distinta en cada llamada — pero
// una recarga de página pierde este respaldo (es una variable de módulo,
// no persiste).
let respaldoEnMemoria = null;

// Tres niveles de persistencia, de mejor a peor (revisión independiente,
// Codex — ronda de correcciones: el respaldo en memoria por sí solo NO
// cubre "localStorage falla Y la página se recarga", que es EXACTAMENTE el
// escenario que esto existe para resolver — perder la respuesta de una
// compra ya aprobada):
//   1. localStorage: sobrevive recargas Y cerrar/reabrir el navegador.
//   2. sessionStorage: sobrevive una recarga de la MISMA pestaña (alcanza
//      para el caso que importa acá), aunque no un cierre de pestaña; en
//      la práctica, un navegador que bloquea localStorage (algunos modos
//      privados, políticas de organización) suele seguir permitiendo
//      sessionStorage.
//   3. Memoria: ni siquiera sessionStorage disponible — cobertura mínima,
//      solo dentro de la misma carga de página.
const firmarDetalles = (detalles) =>
  [...detalles]
    .sort((a, b) => a.idProducto - b.idProducto)
    .map((detalle) => `${detalle.idProducto}:${detalle.cantidad}`)
    .join('|');

const generarClave = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `clave-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Cadena de lectura en cascada (corrección, revisión independiente): un
// nivel se salta cuando lanza (no disponible) O cuando responde "vacío",
// porque "vacío" ahí NO prueba que no haya nada guardado — guardar() solo
// baja a `sessionStorage` cuando `localStorage.setItem` lanza (por ejemplo
// `QuotaExceededError` con `localStorage.getItem` funcionando igual), así
// que en ese escenario `localStorage.getItem` sigue devolviendo `null` para
// esta clave SIEMPRE (nunca se pudo escribir ahí), y el valor real vive
// únicamente en `sessionStorage`. Devolver `null` apenas `localStorage`
// responde vacío (versión anterior) hacía que dos llamadas seguidas a
// `obtenerOCrearClave()` generaran dos claves DISTINTAS para el mismo
// carrito en ese caso — perdía la idempotencia exactamente cuando más hacía
// falta.
//
// Esto no "resucita" un intento viejo ya resuelto: `guardar()` (abajo)
// limpia el nivel inferior cada vez que logra escribir en uno superior, y
// `limpiarClave()` limpia los tres niveles siempre. Así que un nivel
// inferior solo tiene contenido cuando es la única copia vigente — nunca
// una copia vieja conviviendo con una más nueva en un nivel superior.
const leerGuardado = () => {
  try {
    const enLocal = localStorage.getItem(CLAVE_ALMACENAMIENTO);
    if (enLocal !== null) {
      return JSON.parse(enLocal);
    }
  } catch {
    // localStorage no disponible: sigue con el siguiente nivel.
  }

  try {
    const enSesion = sessionStorage.getItem(CLAVE_ALMACENAMIENTO);
    if (enSesion !== null) {
      return JSON.parse(enSesion);
    }
  } catch {
    // sessionStorage tampoco disponible: sigue con el respaldo en memoria.
  }

  return respaldoEnMemoria;
};

// A diferencia de localStorage/sessionStorage, `respaldoEnMemoria` NO se
// actualiza en cada llamada a guardar(): solo cuando de verdad es el nivel
// que se está usando (los otros dos fallaron). Escribirlo siempre —
// "por las dudas", como una copia extra — es exactamente lo que hacía que
// `leerGuardado()` pudiera resucitar un intento viejo: en cuanto
// localStorage/sessionStorage quedaban vacíos por CUALQUIER motivo legítimo
// (se limpiaron con éxito, es una sesión nueva), la cascada de lectura de
// más abajo caía en esa copia de memoria aunque no tuviera nada que ver con
// el intento actual — encontrado al reutilizar este módulo entre pruebas
// que comparten la misma instancia del módulo (mismo defecto de fondo que
// podría darse en producción si alguien borra el almacenamiento del
// navegador a mano en medio de una sesión).
// Best-effort: limpia una copia vieja en un nivel que NO ganó esta
// escritura. `removeItem` no necesita espacio libre (al contrario que
// `setItem`), así que normalmente funciona incluso en el mismo nivel cuyo
// `setItem` acaba de fallar por cuota — por eso vale la pena intentarlo ahí
// también, no solo en los niveles "inferiores".
const intentarLimpiar = (storage) => {
  try {
    storage.removeItem(CLAVE_ALMACENAMIENTO);
  } catch {
    // no-op: ese nivel no está disponible ni para leer/escribir ni para
    // limpiar — no hay nada más que hacer ahí.
  }
};

// Revisión independiente (hallazgo real sobre esta misma corrección): no
// alcanza con limpiar el nivel INFERIOR cuando un nivel superior escribe
// con éxito — el caso inverso también es un problema. Si `localStorage` ya
// tenía guardado un intento ANTERIOR (de un carrito distinto, por ejemplo,
// tras una cotización desactualizada que a propósito no se limpia) y
// DESPUÉS `localStorage.setItem` empieza a fallar (cuota), `guardar()` cae
// a `sessionStorage` con el intento NUEVO — pero `localStorage` sigue
// teniendo el viejo, no vacío, así que `leerGuardado()` lo devuelve como si
// fuera el vigente. `obtenerIntentoGuardado()` lo descarta igual (no
// coincide `idCliente`/firma con el carrito actual), así que no se mezclan
// compras de carritos distintos — pero si el usuario recarga la página
// ANTES de resolver el intento nuevo, la comparación de firma también
// rechaza el guardado viejo y el intento nuevo (el que sí importa, guardado
// en sessionStorage) nunca se llega a mirar: se pierde la protección de
// idempotencia justo en el escenario que esta cadena de 3 niveles existe
// para cubrir. Por eso cada escritura exitosa limpia TODOS los demás
// niveles (no solo los de menor prioridad), no solo el nivel que "ganó".
const guardar = (estado) => {
  const valor = JSON.stringify(estado);

  try {
    localStorage.setItem(CLAVE_ALMACENAMIENTO, valor);
    intentarLimpiar(sessionStorage);
    respaldoEnMemoria = null;
    return;
  } catch {
    // localStorage no disponible para ESCRIBIR: se intenta sessionStorage a
    // continuación (no se abandona acá).
  }

  try {
    sessionStorage.setItem(CLAVE_ALMACENAMIENTO, valor);
    intentarLimpiar(localStorage);
    respaldoEnMemoria = null;
    return;
  } catch {
    // Ningún almacenamiento del navegador disponible para escribir: memoria
    // queda como ÚNICA copia (recién ahora, no antes).
  }

  intentarLimpiar(localStorage);
  intentarLimpiar(sessionStorage);

  respaldoEnMemoria = estado;
};

// Intento guardado para ESTE usuario y ESTE carrito (o null si no hay
// ninguno, o si el que hay es de otro usuario/carrito distinto). No genera
// nada nuevo: solo lee.
const obtenerIntentoGuardado = (idCliente, detalles) => {
  const guardado = leerGuardado();
  const firma = firmarDetalles(detalles);

  if (guardado?.idCliente === idCliente && guardado?.firma === firma && guardado?.clave) {
    return guardado;
  }

  return null;
};

// Devuelve la clave para este carrito: reutiliza la guardada (mismo
// usuario, mismo carrito) o crea una nueva. `entrega` (método + dirección,
// SIN datos de pago) se guarda junto con la clave para poder prellenar el
// formulario si hace falta reconstruirlo tras una recarga, en vez de
// resetear a los valores por defecto (que podrían no coincidir con el
// contenido del intento original y hacerlo fallar como "clave usada con
// contenido distinto").
const obtenerOCrearClave = (idCliente, detalles, entrega = {}) => {
  const existente = obtenerIntentoGuardado(idCliente, detalles);
  const firma = firmarDetalles(detalles);

  if (existente) {
    // Actualiza la entrega guardada si cambió (el usuario sigue editando el
    // formulario con la misma clave), sin tocar la clave en sí.
    guardar({ ...existente, entrega });
    return existente.clave;
  }

  const clave = generarClave();
  guardar({ idCliente, firma, clave, entrega });
  return clave;
};

// Reinicia el intento en curso para este usuario/carrito: usado cuando un
// intento anterior se resolvió (aprobado, ya no hace falta) o cuando el
// cliente elige explícitamente "iniciar un nuevo intento" tras un rechazo
// (CU-04, §1: "un intento rechazado debe permitir comenzar otro intento de
// manera explícita" — nunca automático).
const limpiarClave = () => {
  respaldoEnMemoria = null;
  try {
    localStorage.removeItem(CLAVE_ALMACENAMIENTO);
  } catch {
    // no-op: sin localStorage, no había nada persistente que limpiar ahí.
  }
  try {
    sessionStorage.removeItem(CLAVE_ALMACENAMIENTO);
  } catch {
    // no-op: sin sessionStorage, no había nada persistente que limpiar ahí.
  }
};

export { obtenerOCrearClave, obtenerIntentoGuardado, limpiarClave, firmarDetalles };
