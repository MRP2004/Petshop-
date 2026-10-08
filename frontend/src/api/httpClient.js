// Cliente HTTP único: todos los módulos de src/api/ pasan por acá. Centraliza
// la URL base, la sesión (cookies HttpOnly, ver docs/backend-autenticacion.md
// — el frontend nunca guarda el identificador de sesión en localStorage ni
// en ninguna variable de JS: el navegador la adjunta solo) y la traducción
// de errores del backend ({ error: "..." }) a una excepción con mensaje
// legible.
const URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Corrección (revisión independiente): el backend le agrega un sufijo al
// nombre de sus cookies según `ENTORNO` (ver backend/src/utils/sesion.js:
// `petshop_csrf_e2e` en vez de `petshop_csrf` cuando corre como E2E, para
// no colisionar con una sesión de desarrollo en el mismo navegador). Este
// nombre tenía que seguir esa misma regla — si no, `leerCookieCsrf()` de
// abajo nunca encuentra la cookie contra el backend E2E (nombre distinto),
// nunca manda `X-CSRF-Token`, y toda solicitud que cambia estado contra esa
// instancia terminaría en 403 "Token CSRF inválido o ausente". `VITE_ENTORNO`
// se define en frontend/.env.e2e, igual criterio que `ENTORNO` del backend.
const SUFIJO_ENTORNO = import.meta.env.VITE_ENTORNO ? `_${import.meta.env.VITE_ENTORNO}` : '';
const NOMBRE_COOKIE_CSRF = `petshop_csrf${SUFIJO_ENTORNO}`;
const METODOS_MUTABLES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

class ErrorApi extends Error {
  constructor(mensaje, status, datos) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    // Cuerpo JSON completo de la respuesta de error (además del mensaje):
    // algunos errores llevan datos estructurados propios (ver
    // compra.controller.js — codigo/cotizacionVigente en una cotización
    // desactualizada) que el mensaje solo no alcanza a transmitir.
    this.datos = datos;
  }
}

// La cookie de CSRF (a diferencia de la de sesión) NO es HttpOnly a
// propósito: el patrón "double submit cookie" exige que este mismo
// JavaScript pueda leerla para mandarla de vuelta como header (ver
// utils/sesion.js del backend). Un sitio atacante no puede leerla porque
// pertenece al origen del backend, no al suyo.
const leerCookieCsrf = () => {
  const coincidencia = document.cookie.match(
    new RegExp(`(?:^|; )${NOMBRE_COOKIE_CSRF}=([^;]*)`),
  );
  return coincidencia ? decodeURIComponent(coincidencia[1]) : null;
};

// Límite de tiempo por pedido (revisión independiente, Codex — CU-04, ronda
// de correcciones): sin esto, una conexión que queda "colgada" (ni
// resuelve ni falla) dejaba pantallas como la recuperación del checkout
// (ver Checkout.jsx, "Verificando tu compra…") esperando indefinidamente,
// sin mensaje de error ni forma de reintentar. Un timeout se trata igual
// que cualquier otro fallo de conexión (mismo AppError con status 0): no
// es certeza de que el pedido nunca haya llegado al servidor, solo que
// esta espera se terminó.
//
// Corrección (revisión independiente, ronda siguiente): el límite original
// solo cubría hasta que `fetch()` resolvía, es decir, hasta que LLEGABAN
// LOS ENCABEZADOS — el `clearTimeout` corría inmediatamente después,
// dentro de `fetchConLimiteDeTiempo`. Un servidor que manda encabezados
// (200, `Content-Type: application/json`) y después se queda a mitad de
// camino, sin terminar de mandar el cuerpo, dejaba el `await
// respuesta.json()`/`.blob()` posterior esperando indefinidamente de
// nuevo, sin ningún límite — exactamente el mismo problema que esto existe
// para resolver, solo que un paso más adelante. Ahora un único
// AbortController cubre pedido Y lectura del cuerpo: abortar el
// controlador durante la lectura del cuerpo también corta esa lectura (el
// signal de fetch se propaga al stream de la respuesta), así que alcanza
// con no limpiar el timeout hasta que el cuerpo terminó de leerse (o
// falló) — ver `solicitar()`/`solicitarBinario()` abajo, que arman su
// propio controlador y lo mantienen vivo durante toda la operación, no
// solo durante `fetch()`.
const TIMEOUT_SOLICITUD_MS = 15000;

const conLimiteDeTiempo = async (operacion) => {
  const controlador = new AbortController();
  const idTimeout = setTimeout(() => controlador.abort(), TIMEOUT_SOLICITUD_MS);

  try {
    return await operacion(controlador.signal);
  } finally {
    clearTimeout(idTimeout);
  }
};

// Se registra una única vez desde AuthContext: cuando cualquier pedido
// recibe 401 (sesión inválida o expirada), se limpia el estado de sesión
// en React, sin que cada pantalla tenga que manejarlo por separado.
let manejadorSesionInvalida = null;
const registrarManejadorSesionInvalida = (funcion) => {
  manejadorSesionInvalida = funcion;
};

const solicitar = (ruta, { metodo = 'GET', cuerpo } = {}) =>
  conLimiteDeTiempo(async (signal) => {
    const encabezados = { 'Content-Type': 'application/json' };

    if (METODOS_MUTABLES.has(metodo)) {
      const csrf = leerCookieCsrf();
      if (csrf) {
        encabezados['X-CSRF-Token'] = csrf;
      }
    }

    let respuesta;

    try {
      respuesta = await fetch(`${URL_BASE}${ruta}`, {
        method: metodo,
        headers: encabezados,
        // Necesario para que el navegador mande/reciba las cookies de
        // sesión en un pedido cross-origin (frontend y backend corren en
        // puertos distintos). El backend responde con
        // Access-Control-Allow-Credentials (ver app.js) exactamente para
        // permitir esto.
        credentials: 'include',
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
        signal,
      });
    } catch {
      // Cubre tanto "nunca hubo respuesta" como el límite de tiempo
      // venciendo antes de recibir encabezados — mismo error recuperable
      // en los dos casos, indistinguibles desde acá.
      throw new ErrorApi('No se pudo conectar con el servidor. Verificá tu conexión.', 0);
    }

    if (respuesta.status === 204) {
      return null;
    }

    const tipoContenido = respuesta.headers.get('content-type') || '';
    let datos;

    try {
      datos = tipoContenido.includes('application/json') ? await respuesta.json() : null;
    } catch {
      // Encabezados recibidos, pero la lectura del cuerpo falló: si fue
      // porque venció el límite de tiempo (el mismo `signal` de arriba
      // corta también la lectura del cuerpo en curso), se trata como
      // cualquier otro fallo de conexión recuperable, NO como "cuerpo
      // vacío/200 sin datos" — de lo contrario una compra recién
      // procesada por el servidor pero con el cuerpo cortado a mitad de
      // camino terminaría reportándose como "Ocurrió un error inesperado"
      // en vez del mensaje de conexión, sin poder reintentar sabiendo qué
      // pasó. Un cuerpo simplemente inválido (JSON mal formado, no
      // relacionado al límite de tiempo) sigue tratándose como ausencia de
      // cuerpo, igual que antes.
      if (signal.aborted) {
        throw new ErrorApi('No se pudo conectar con el servidor. Verificá tu conexión.', 0);
      }
      datos = null;
    }

    if (!respuesta.ok) {
      if (respuesta.status === 401 && manejadorSesionInvalida) {
        manejadorSesionInvalida();
      }
      throw new ErrorApi(datos?.error || 'Ocurrió un error inesperado', respuesta.status, datos);
    }

    return datos;
  });

// Descarga binaria (el PDF del comprobante, CU-04): a diferencia de
// solicitar(), no intenta interpretar la respuesta como JSON — ni en el
// caso de éxito (devuelve un Blob) ni en el de error (igual intenta leer
// { error } si el backend respondió JSON, para un mensaje legible).
const solicitarBinario = (ruta) =>
  conLimiteDeTiempo(async (signal) => {
    let respuesta;

    try {
      respuesta = await fetch(`${URL_BASE}${ruta}`, { credentials: 'include', signal });
    } catch {
      throw new ErrorApi('No se pudo conectar con el servidor. Verificá tu conexión.', 0);
    }

    if (!respuesta.ok) {
      if (respuesta.status === 401 && manejadorSesionInvalida) {
        manejadorSesionInvalida();
      }
      const tipoContenido = respuesta.headers.get('content-type') || '';
      const datos = tipoContenido.includes('application/json')
        ? await respuesta.json().catch(() => null)
        : null;
      throw new ErrorApi(
        datos?.error || 'No se pudo descargar el archivo',
        respuesta.status,
        datos,
      );
    }

    const nombreSugerido = /filename="([^"]+)"/.exec(
      respuesta.headers.get('content-disposition') || '',
    )?.[1];

    let blob;
    try {
      blob = await respuesta.blob();
    } catch {
      // Mismo criterio que en solicitar(): un cuerpo binario que queda a
      // mitad de camino (el PDF del comprobante, por ejemplo) se trata como
      // fallo de conexión recuperable si fue el límite de tiempo el que lo
      // cortó.
      if (signal.aborted) {
        throw new ErrorApi('No se pudo conectar con el servidor. Verificá tu conexión.', 0);
      }
      throw new ErrorApi('No se pudo descargar el archivo', respuesta.status);
    }

    return { blob, nombreSugerido };
  });

export { solicitar, solicitarBinario, ErrorApi, registrarManejadorSesionInvalida };
