import {
  registrarUsuario,
  crearUsuarioInterno,
  iniciarSesion,
} from '../services/usuario.service.js';
import { generarTokenCsrf } from '../utils/csrf.js';
import {
  NOMBRE_COOKIE_SESION,
  NOMBRE_COOKIE_CSRF,
  opcionesCookieSesion,
  opcionesCookieCsrf,
} from '../utils/sesion.js';

// Deja la sesión en dos cookies (ver utils/sesion.js) y devuelve en el
// cuerpo solo lo que el frontend necesita para pintar la interfaz
// (usuario) y el token CSRF (también queda en una cookie legible, pero
// devolverlo acá evita que el frontend tenga que parsear document.cookie
// apenas después de loguearse). El JWT en sí NUNCA viaja en el cuerpo de
// la respuesta: solo en la cookie HttpOnly, inaccesible para JavaScript
// (mitiga que un XSS lo robe leyendo localStorage).
const iniciarSesionEnRespuesta = (res, { token, usuario }) => {
  const tokenCsrf = generarTokenCsrf();

  res.cookie(NOMBRE_COOKIE_SESION, token, opcionesCookieSesion());
  res.cookie(NOMBRE_COOKIE_CSRF, tokenCsrf, opcionesCookieCsrf());

  return { usuario, csrfToken: tokenCsrf };
};

const registro = async (req, res, next) => {
  try {
    const resultado = await registrarUsuario(req.body);
    res.status(201).json(iniciarSesionEnRespuesta(res, resultado));
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const resultado = await iniciarSesion(req.body);
    res.status(200).json(iniciarSesionEnRespuesta(res, resultado));
  } catch (error) {
    next(error);
  }
};

const cerrarSesion = (req, res) => {
  res.clearCookie(NOMBRE_COOKIE_SESION, opcionesCookieSesion());
  res.clearCookie(NOMBRE_COOKIE_CSRF, opcionesCookieCsrf());
  res.status(204).send();
};

const crearInterno = async (req, res, next) => {
  try {
    const usuario = await crearUsuarioInterno(req.body);
    res.status(201).json(usuario);
  } catch (error) {
    next(error);
  }
};

// Devuelve lo que ya está codificado en el propio token: no hace falta una
// consulta adicional a la base para que el frontend sepa quién está
// autenticado y con qué rol. También es la forma en que el frontend
// recupera la sesión al cargar la página (ya no puede leer el JWT de
// localStorage: está en una cookie HttpOnly).
const perfil = (req, res) => {
  res.status(200).json(req.usuario);
};

export { registro, login, cerrarSesion, crearInterno, perfil };
