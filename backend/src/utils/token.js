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

// El token solo lleva lo necesario para autorizar: id, rol y, si es cliente,
// el idCliente vinculado (así una compra pública deriva idCliente del token
// en vez de confiar en lo que mande el navegador).
const firmarToken = (usuario) =>
  jwt.sign(
    {
      idUsuario: usuario.idUsuario,
      rol: usuario.rol,
      idCliente: usuario.idCliente,
    },
    obtenerClave(),
    { expiresIn: DURACION_TOKEN },
  );

const verificarToken = (token) => jwt.verify(token, obtenerClave());

export { firmarToken, verificarToken };
