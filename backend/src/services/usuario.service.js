import sequelize from '../config/database.js';
import Usuario from '../models/usuario.model.js';
import Cliente from '../models/cliente.model.js';
import AppError from '../errors/AppError.js';
import { hashearContrasena, verificarContrasena } from '../utils/contrasenas.js';
import { firmarToken } from '../utils/token.js';
import { esObjetoPlano } from '../utils/validacion.js';
import { prepararDatosCliente } from './cliente.service.js';

const LONGITUD_MINIMA_CONTRASENA = 8;

const prepararCredenciales = (datos) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError('El cuerpo de la solicitud no es válido', 400);
  }

  const email = typeof datos.email === 'string' ? datos.email.trim().toLowerCase() : '';
  const password = typeof datos.password === 'string' ? datos.password : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError('El correo electrónico no es válido', 400);
  }

  if (password.length < LONGITUD_MINIMA_CONTRASENA) {
    throw new AppError(
      `La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`,
      400,
    );
  }

  return { email, password };
};

// Registro público: SIEMPRE crea un usuario con rol 'cliente', vinculado a
// un Cliente nuevo creado en la misma transacción. No acepta un rol del
// cuerpo de la solicitud bajo ninguna circunstancia, aunque se envíe: crear
// administradores o vendedores requiere la vía interna (crearUsuarioInterno,
// protegida por rol administrador).
const registrarUsuario = async (datos) => {
  const { email, password } = prepararCredenciales(datos);

  // Reutiliza exactamente la misma validación de nombre/apellido/contacto
  // que el CRUD administrativo de clientes: el registro público no puede
  // tener reglas de negocio distintas a las que aplica un empleado.
  const datosCliente = prepararDatosCliente(datos);

  const contrasenaHash = await hashearContrasena(password);

  const usuario = await sequelize.transaction(async (transaction) => {
    const cliente = await Cliente.create(datosCliente, { transaction });

    return Usuario.create(
      {
        email,
        contrasenaHash,
        rol: 'cliente',
        idCliente: cliente.idCliente,
      },
      { transaction },
    );
  });

  return iniciarSesionConUsuario(usuario);
};

// Alta interna de cuentas vendedor/administrador. No crea Cliente: esos
// roles no compran, gestionan el negocio. Solo alcanzable protegida por
// requiereRol('administrador') en la ruta.
const crearUsuarioInterno = async (datos) => {
  const { email, password } = prepararCredenciales(datos);

  if (!esObjetoPlano(datos) || !['vendedor', 'administrador'].includes(datos.rol)) {
    throw new AppError(
      "El rol debe ser 'vendedor' o 'administrador'",
      400,
    );
  }

  const contrasenaHash = await hashearContrasena(password);

  const usuario = await Usuario.create({
    email,
    contrasenaHash,
    rol: datos.rol,
    idCliente: null,
  });

  return {
    idUsuario: usuario.idUsuario,
    email: usuario.email,
    rol: usuario.rol,
  };
};

// El objeto "usuario" que se devuelve acá es exactamente lo mismo que
// después va a poder leer el frontend en cualquier momento via GET
// /api/usuarios/perfil (que devuelve el payload ya decodificado del
// token): mismo shape en los dos casos, a propósito, para que el estado de
// sesión en el frontend no cambie de forma según de dónde vino (login vs.
// recarga de página). Por eso no incluye email: el token tampoco lo lleva
// ("el token solo lleva lo necesario para autorizar", ver firmarToken).
const iniciarSesionConUsuario = (usuario) => ({
  token: firmarToken(usuario),
  usuario: {
    idUsuario: usuario.idUsuario,
    rol: usuario.rol,
    idCliente: usuario.idCliente,
  },
});

const iniciarSesion = async (datos) => {
  const { email, password } = prepararCredenciales(datos);

  const usuario = await Usuario.findOne({ where: { email } });

  // Mismo mensaje genérico tanto si el email no existe como si la contraseña
  // no coincide, para no revelar qué correos están registrados.
  if (!usuario || !(await verificarContrasena(password, usuario.contrasenaHash))) {
    throw new AppError('Correo o contraseña incorrectos', 401);
  }

  return iniciarSesionConUsuario(usuario);
};

export { registrarUsuario, crearUsuarioInterno, iniciarSesion };
