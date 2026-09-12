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
  constructor(mensaje, status) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
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

// Se registra una única vez desde AuthContext: cuando cualquier pedido
// recibe 401 (sesión inválida o expirada), se limpia el estado de sesión
// en React, sin que cada pantalla tenga que manejarlo por separado.
let manejadorSesionInvalida = null;
const registrarManejadorSesionInvalida = (funcion) => {
  manejadorSesionInvalida = funcion;
};

const solicitar = async (ruta, { metodo = 'GET', cuerpo } = {}) => {
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
      // Necesario para que el navegador mande/reciba las cookies de sesión
      // en un pedido cross-origin (frontend y backend corren en puertos
      // distintos). El backend responde con Access-Control-Allow-Credentials
      // (ver app.js) exactamente para permitir esto.
      credentials: 'include',
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi('No se pudo conectar con el servidor. Verificá tu conexión.', 0);
  }

  if (respuesta.status === 204) {
    return null;
  }

  const tipoContenido = respuesta.headers.get('content-type') || '';
  const datos = tipoContenido.includes('application/json')
    ? await respuesta.json().catch(() => null)
    : null;

  if (!respuesta.ok) {
    if (respuesta.status === 401 && manejadorSesionInvalida) {
      manejadorSesionInvalida();
    }
    throw new ErrorApi(datos?.error || 'Ocurrió un error inesperado', respuesta.status);
  }

  return datos;
};

export { solicitar, ErrorApi, registrarManejadorSesionInvalida };
