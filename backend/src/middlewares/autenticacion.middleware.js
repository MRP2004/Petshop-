import { verificarToken } from '../utils/token.js';
import { analizarCookies } from '../utils/cookies.js';
import { coincideCsrf } from '../utils/csrf.js';
import { NOMBRE_COOKIE_SESION, NOMBRE_COOKIE_CSRF } from '../utils/sesion.js';
import { esPersonalInterno, esCompradorRegistrado } from '../utils/roles.js';

const METODOS_MUTABLES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// La sesión llega por la cookie HttpOnly (navegador, ver
// docs/backend-autenticacion.md) o por un header Authorization: Bearer
// (herramientas/scripts/pruebas automatizadas, que no tienen navegador ni
// cookies). Un Bearer explícito no es vulnerable a CSRF (un sitio atacante
// no puede agregar ese header a una solicitud cross-site), así que solo se
// exige el token CSRF cuando la credencial vino de la cookie.
const extraerCredenciales = (req) => {
  const encabezadoAuth = req.headers.authorization;

  if (encabezadoAuth?.startsWith('Bearer ')) {
    return { token: encabezadoAuth.slice('Bearer '.length).trim(), origen: 'encabezado' };
  }

  const cookies = analizarCookies(req.headers.cookie);

  if (cookies[NOMBRE_COOKIE_SESION]) {
    return {
      token: cookies[NOMBRE_COOKIE_SESION],
      origen: 'cookie',
      csrfCookie: cookies[NOMBRE_COOKIE_CSRF],
    };
  }

  return { token: null, origen: null };
};

// Exige un usuario autenticado válido; deja sus datos en req.usuario
// (idUsuario, rol, idCliente) para que controladores/servicios los usen.
const requiereAutenticacion = (req, res, next) => {
  const { token, origen, csrfCookie } = extraerCredenciales(req);

  if (!token) {
    return res.status(401).json({ error: 'Se requiere iniciar sesión' });
  }

  // Protección CSRF (double-submit cookie): en una solicitud que cambia
  // estado y se autentica por cookie, el header X-CSRF-Token debe coincidir
  // con la cookie petshop_csrf (legible por JS del propio frontend, no por
  // el de un sitio atacante). Ver utils/sesion.js para el detalle completo.
  if (origen === 'cookie' && METODOS_MUTABLES.has(req.method)) {
    const csrfHeader = req.headers['x-csrf-token'];

    if (!coincideCsrf(csrfHeader, csrfCookie)) {
      return res.status(403).json({ error: 'Token CSRF inválido o ausente' });
    }
  }

  try {
    req.usuario = verificarToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: 'La sesión no es válida o expiró' });
  }
};

// Si hay una credencial válida la decodifica en req.usuario; si no hay, o es
// inválida, continúa sin usuario (para rutas públicas cuyo comportamiento
// puede variar levemente si el visitante está identificado). No exige CSRF:
// no protege ninguna acción que cambie estado por sí misma.
const autenticacionOpcional = (req, res, next) => {
  const { token } = extraerCredenciales(req);

  if (token) {
    try {
      req.usuario = verificarToken(token);
    } catch {
      // Token inválido en una ruta pública: se ignora, no se bloquea.
    }
  }

  return next();
};

// Debe usarse después de requiereAutenticacion. "Ocultar botones no es
// autorización": esta es la comprobación real del lado del servidor.
const requiereRol =
  (...rolesPermitidos) =>
  (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'Se requiere iniciar sesión' });
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        error: 'No tiene permisos para realizar esta acción',
      });
    }

    return next();
  };

// Para rutas de Cliente por :id: un cliente autenticado solo puede acceder a
// su propio registro (comparando req.usuario.idCliente contra :id); el
// personal (vendedor/administrador) accede a cualquiera. Debe usarse después
// de requiereAutenticacion.
//
// Ronda 2, Etapa 8: un vendedor independiente TAMBIÉN puede acceder a su
// propio registro de Cliente (conserva idCliente, sigue siendo comprador) —
// mismo chequeo que 'cliente', nunca el de personal interno.
const permitirPropioClienteOStaff = (req, res, next) => {
  if (esPersonalInterno(req.usuario?.rol)) {
    return next();
  }

  if (
    esCompradorRegistrado(req.usuario?.rol) &&
    String(req.usuario.idCliente) === String(req.params.id)
  ) {
    return next();
  }

  return res.status(403).json({
    error: 'No tiene permisos para realizar esta acción',
  });
};

export {
  requiereAutenticacion,
  autenticacionOpcional,
  requiereRol,
  permitirPropioClienteOStaff,
};
