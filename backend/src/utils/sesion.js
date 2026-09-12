// Configuración de las cookies de sesión, compartida entre
// usuario.controller.js (las escribe) y autenticacion.middleware.js (las
// lee), para no duplicar nombres/opciones en dos lugares.
//
// Dos cookies:
// - NOMBRE_COOKIE_SESION (HttpOnly): lleva el JWT. JavaScript del frontend
//   nunca puede leerla ni copiarla (mitiga que un XSS robe la sesión leyendo
//   localStorage, que es exactamente lo que esta estrategia evita).
// - NOMBRE_COOKIE_CSRF (NO HttpOnly, a propósito): un valor aleatorio que sí
//   puede leer el JavaScript del propio frontend (mismo origen) para
//   mandarlo de vuelta como header en cada solicitud que cambia estado
//   (patrón "double submit cookie"). Un sitio atacante no puede leer esta
//   cookie (pertenece al origen del backend, no al suyo), así que no puede
//   fabricar el header aunque logre que el navegador mande la cookie de
//   sesión en una solicitud cross-site.
// Corrección de una revisión posterior: dos instancias del backend en
// puertos distintos (desarrollo en 3000, E2E en 3001) NO alcanzan para
// aislar sus cookies — el navegador comparte el mismo frasco de cookies
// entre puertos distintos del mismo host ("localhost" no distingue
// puerto), así que sin este sufijo, iniciar sesión contra el backend E2E
// podría pisar (o ser pisado por) la cookie de una sesión de desarrollo
// abierta en la misma máquina. `ENTORNO` (definido en .env.e2e como "e2e";
// ausente en desarrollo) agrega un sufijo al nombre de ambas cookies, así
// cada backend usa cookies con nombre distinto y no pueden colisionar.
const SUFIJO_ENTORNO = process.env.ENTORNO ? `_${process.env.ENTORNO}` : '';
const NOMBRE_COOKIE_SESION = `petshop_sesion${SUFIJO_ENTORNO}`;
const NOMBRE_COOKIE_CSRF = `petshop_csrf${SUFIJO_ENTORNO}`;
const DURACION_SESION_MS = 8 * 60 * 60 * 1000; // 8 horas, igual que el JWT (ver utils/token.js)

const esProduccion = () => process.env.NODE_ENV === 'production';

// secure=true exige HTTPS: se activa solo en producción. En desarrollo
// (HTTP, localhost) exigirlo impediría que el navegador guarde la cookie.
const opcionesCookieSesion = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: esProduccion(),
  path: '/',
  maxAge: DURACION_SESION_MS,
});

const opcionesCookieCsrf = () => ({
  httpOnly: false,
  sameSite: 'lax',
  secure: esProduccion(),
  path: '/',
  maxAge: DURACION_SESION_MS,
});

export {
  NOMBRE_COOKIE_SESION,
  NOMBRE_COOKIE_CSRF,
  opcionesCookieSesion,
  opcionesCookieCsrf,
};
