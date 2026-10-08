import sequelize from '../config/database.js';
import Usuario from '../models/usuario.model.js';
import Cliente from '../models/cliente.model.js';
import Tienda from '../models/tienda.model.js';
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

// Ronda 2 (ver docs/frontend-diseno.md): el encabezado necesita mostrar el
// nombre de quien inició sesión, algo que el token JAMÁS lleva (ver
// firmarToken: "el token solo lleva lo necesario para autorizar") — a
// propósito, para no arrastrar un nombre desactualizado si el cliente edita
// su perfil después de loguearse, y para no agrandar el token con datos que
// no hacen falta para autorizar nada. En vez de eso, tanto el login/registro
// como GET /api/usuarios/perfil arman este mismo objeto con una consulta
// fresca a la base (ver obtenerPerfil más abajo) — mismo shape en los dos
// casos, a propósito, para que el estado de sesión en el frontend no cambie
// de forma según de dónde vino (login vs. recarga de página). `nombre`/
// `apellido` quedan en null para vendedor/administrador (no tienen Cliente
// asociado); `contrasenaHash` nunca se incluye.
// Ronda 2, Etapa 8 (marketplace): un vendedor independiente puede tener
// tienda SUSPENDIDA (ver tienda.service.js) sin dejar de ser vendedor — el
// `idTienda` viaja igual (autoriza "esta cuenta es dueña de esa tienda"),
// la suspensión se vuelve a comprobar en cada escritura real (nunca se
// confía en esto solo para decidir si algo se puede escribir).
const resolverIdTienda = async (usuario) => {
  if (usuario.rol !== 'vendedor_independiente') return null;
  const tienda = await Tienda.findOne({ where: { idUsuario: usuario.idUsuario } });
  return tienda?.idTienda ?? null;
};

const construirPerfilPublico = async (usuario) => {
  let nombre = null;
  let apellido = null;

  if (usuario.idCliente) {
    const cliente = await Cliente.findByPk(usuario.idCliente);
    if (cliente) {
      nombre = cliente.nombre;
      apellido = cliente.apellido;
    }
  }

  const idTienda = await resolverIdTienda(usuario);

  return {
    idUsuario: usuario.idUsuario,
    rol: usuario.rol,
    idCliente: usuario.idCliente,
    idTienda,
    email: usuario.email,
    nombre,
    apellido,
  };
};

const iniciarSesionConUsuario = async (usuario) => {
  const idTienda = await resolverIdTienda(usuario);

  return {
    // Se arma a mano (no `usuario.get({ plain: true })`): firmarToken ya
    // toma exactamente los campos que necesita, y esto evita depender de
    // que `usuario` sea siempre una instancia real de Sequelize (algunas
    // pruebas pasan un objeto plano ya "resuelto").
    token: firmarToken({
      idUsuario: usuario.idUsuario,
      rol: usuario.rol,
      idCliente: usuario.idCliente,
      idTienda,
    }),
    usuario: await construirPerfilPublico(usuario),
  };
};

// GET /api/usuarios/perfil: a diferencia de antes, ya NO devuelve el payload
// del token tal cual (ver git history) — hace esta consulta fresca para
// poder incluir nombre/apellido/email sin tener que meterlos en el token.
// Si el usuario ya no existe (cuenta borrada después de emitido el token,
// caso hoy no alcanzable por ningún endpoint pero cubierto igual), se trata
// como sesión inválida, no como un 500.
const obtenerPerfil = async (idUsuario) => {
  const usuario = await Usuario.findByPk(idUsuario);

  if (!usuario) {
    throw new AppError('Sesión inválida', 401);
  }

  return construirPerfilPublico(usuario);
};

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

export { registrarUsuario, crearUsuarioInterno, iniciarSesion, obtenerPerfil };
