import jwt from 'jsonwebtoken';

// La clave de firma debe configurarse por ambiente (ver .env.example); no
// hay un valor por defecto embebido en el código para no comprometer todas
// las instalaciones con el mismo secreto.
const obtenerClave = () => {
  const clave = process.env.JWT_SECRET;

  if (!clave || clave.length < 16) {
    throw new Error(
      'JWT_SECRET no está configurado (o es demasiado corto) en las variables de entorno',
    );
  }

  return clave;
};

const DURACION_TOKEN = '8h';

// El token identifica la cuenta e incluye sus datos de sesión al momento de
// emitirlo. En cada solicitud autenticada, el middleware usa idUsuario para
// cargar el rol, idCliente e idTienda actuales desde la base; no autoriza con
// los valores potencialmente desactualizados que quedaron en el token.
const firmarToken = (usuario) =>
  jwt.sign(
    {
      idUsuario: usuario.idUsuario,
      rol: usuario.rol,
      idCliente: usuario.idCliente,
      idTienda: usuario.idTienda ?? null,
    },
    obtenerClave(),
    { expiresIn: DURACION_TOKEN },
  );

const verificarToken = (token) => jwt.verify(token, obtenerClave());

export { firmarToken, verificarToken };
