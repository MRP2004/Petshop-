// Utilidades compartidas por las pruebas de integración real contra MySQL.
// A diferencia de backend/test/ (pruebas puras y HTTP guardadas contra
// MySQL), estos archivos SÍ escriben y leen de una base real: por eso viven
// en un directorio separado, no terminan en ".test.js" (para que `node
// --test` sin argumentos, usado por `npm test`, nunca los descubra por
// accidente) y exigen una configuración explícita y estricta antes de
// tocar cualquier dato. Ver docs/backend-base-de-datos.md.
import mysql from 'mysql2/promise';
import sequelize from '../src/config/database.js';
import '../src/models/tipoMascota.model.js';
import '../src/models/categoria.model.js';
import '../src/models/proveedor.model.js';
import '../src/models/producto.model.js';
import '../src/models/cliente.model.js';
import '../src/models/medioPago.model.js';
import '../src/models/venta.model.js';
import '../src/models/detalleVenta.model.js';
import '../src/models/usuario.model.js';
import '../src/models/promocionProducto.model.js';
import '../src/models/direccionEntrega.model.js';
import '../src/models/imagenProducto.model.js';
import '../src/models/intentoCompra.model.js';
import '../src/models/pago.model.js';
import '../src/models/comprobante.model.js';
import '../src/models/detalleVentaPromocion.model.js';
import '../src/models/solicitudCancelacion.model.js';
import '../src/models/direccionCliente.model.js';
import '../src/models/favorito.model.js';
import '../src/models/aviso.model.js';
import '../src/models/tienda.model.js';
import '../src/models/solicitudVendedor.model.js';
import Cliente from '../src/models/cliente.model.js';
import MedioPago from '../src/models/medioPago.model.js';
import Producto from '../src/models/producto.model.js';
import Usuario from '../src/models/usuario.model.js';
import Tienda from '../src/models/tienda.model.js';
import PromocionProducto from '../src/models/promocionProducto.model.js';
import { hashearContrasena } from '../src/utils/contrasenas.js';

// Único nombre de base contra el que estas pruebas aceptan operar. No es un
// patrón (antes se aceptaba cualquier DB_NAME que contuviera "test"): es una
// comparación exacta, para no depender de una coincidencia parcial que
// alguien podría cumplir por accidente con un nombre real mal elegido.
// Puede sobreescribirse con INTEGRACION_DB_NAME_PERMITIDA si el equipo usa
// otro nombre, pero el valor efectivo también se vuelve a comprobar contra
// la conexión real más abajo.
const NOMBRE_BASE_PERMITIDA =
  process.env.INTEGRACION_DB_NAME_PERMITIDA || 'petshop_test';

// Identificador de base válido para interpolar en SQL (sin comillas ni
// escapes): letras, números y guion bajo, sin empezar con número, longitud
// razonable. Se valida ANTES de comparar con el nombre permitido y antes de
// usarlo en cualquier sentencia, aunque su origen sea una variable de
// entorno local y no una entrada de usuario.
const ES_IDENTIFICADOR_VALIDO = (nombre) =>
  typeof nombre === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(nombre);

// Chequeo síncrono, sin tocar la red: valida que la configuración no sea
// ambigua ANTES de siquiera intentar conectarse o consultar algo. Se llama
// al importar este módulo (aborta de inmediato si algo falta) y de nuevo
// antes de cada operación destructiva.
const asegurarConfiguracionExplicita = () => {
  const nombreConfigurado = process.env.DB_NAME;
  const habilitado = process.env.PERMITIR_LIMPIEZA_INTEGRACION;

  if (!ES_IDENTIFICADOR_VALIDO(NOMBRE_BASE_PERMITIDA)) {
    throw new Error(
      `El nombre de base permitida ("${NOMBRE_BASE_PERMITIDA}") no es un identificador válido. Abortando.`,
    );
  }

  if (habilitado !== 'si') {
    throw new Error(
      'Falta habilitación explícita: definí PERMITIR_LIMPIEZA_INTEGRACION=si ' +
        'para correr las pruebas de integración. Esto evita que se ejecuten ' +
        'por accidente (por ejemplo, desde un `npm test` mal configurado).',
    );
  }

  if (!ES_IDENTIFICADOR_VALIDO(nombreConfigurado)) {
    throw new Error(
      `DB_NAME ("${nombreConfigurado || '(vacío)'}") no es un identificador ` +
        'de base de datos válido. Configuración ambigua: abortando antes de conectar.',
    );
  }

  if (nombreConfigurado !== NOMBRE_BASE_PERMITIDA) {
    throw new Error(
      `DB_NAME ("${nombreConfigurado}") debe ser exactamente ` +
        `"${NOMBRE_BASE_PERMITIDA}" (comparación exacta, no un patrón). ` +
        'Configuración ambigua: abortando antes de conectar.',
    );
  }
};

asegurarConfiguracionExplicita();

// Chequeo asíncrono: además de la variable de entorno, comprueba el nombre
// EFECTIVO de la base ya conectada (SELECT DATABASE()), por si la conexión
// real terminara apuntando a otro lado por algún motivo ajeno a DB_NAME
// (host mal resuelto, conexión reutilizada de otra configuración, etc.).
// Se llama antes de sync() y antes de cada limpieza de datos.
const asegurarBaseEfectivaDePrueba = async () => {
  asegurarConfiguracionExplicita();

  const [[fila]] = await sequelize.query('SELECT DATABASE() AS nombre');

  if (fila.nombre !== NOMBRE_BASE_PERMITIDA) {
    throw new Error(
      `La conexión real está usando la base "${fila.nombre}", distinta de ` +
        `"${NOMBRE_BASE_PERMITIDA}". Abortando antes de escribir nada.`,
    );
  }
};

// Crea las tablas si todavía no existen. No usa `force` ni `alter`: en una
// base de pruebas recién creada esto simplemente construye el esquema desde
// los modelos actuales; en una que ya lo tiene, no toca nada (mismo
// comportamiento que server.js en desarrollo). El esquema resultante puede
// diferir del de la base de *desarrollo* si esta última quedó desactualizada
// respecto de los modelos actuales: ver docs/backend-base-de-datos.md.
const prepararEsquema = async () => {
  await sequelize.authenticate();
  await asegurarBaseEfectivaDePrueba();
  await sequelize.sync();
};

// Limpia los datos entre pruebas, en orden que respeta las claves foráneas
// (hijos antes que padres). Se usa DELETE explícito en vez de TRUNCATE para
// no tener que deshabilitar temporalmente las FK checks de la sesión.
//
// Incluye `usuario` (FK opcional a `cliente`: se borra antes que cliente),
// `promocionproducto` (FK obligatoria a `producto`, opcional a `categoria`:
// se borra antes que ambas), `direccionentrega` (FK obligatoria a `venta`,
// tabla del caso de uso de envío a domicilio: se borra antes que venta),
// `solicitudcancelacion` (FK obligatoria a `venta`: se borra antes que
// venta, misma razón) y las cuatro tablas de CU-04 (`pago`, `comprobante`,
// `detalleventapromocion` —dependen de `venta`/`detalleventa`, se borran
// antes— e `intentocompra` —depende de `cliente`/`venta`, se borra antes
// que ambas—) y `direccioncliente` (FK obligatoria a `cliente`, ronda 2:
// dirección estructurada del cliente, se borra antes que cliente) — las
// tablas que se agregaron después de que existiera esta limpieza y que
// había que sumar acá, respetando sus relaciones.
//
// Ronda 2, Etapa 8 (marketplace): `producto` se corrió ANTES que `usuario`
// (antes iba después) porque ahora `producto.idTienda` referencia a
// `tienda`, que a su vez referencia a `usuario` (`tienda.idUsuario`) —
// `imagenproducto` se movió junto a `producto` por la misma razón (debe
// seguir borrándose antes que `producto`). `solicitudvendedor` tiene DOS
// FKs a `usuario` (`idUsuario` del solicitante, `idUsuarioResolvio` del
// administrador que resolvió) — se borra antes que `usuario`, junto con
// `tienda`.
const limpiarDatos = async () => {
  await asegurarBaseEfectivaDePrueba();
  await sequelize.query('DELETE FROM aviso');
  await sequelize.query('DELETE FROM favorito');
  await sequelize.query('DELETE FROM direccioncliente');
  await sequelize.query('DELETE FROM direccionentrega');
  await sequelize.query('DELETE FROM solicitudcancelacion');
  await sequelize.query('DELETE FROM pago');
  await sequelize.query('DELETE FROM comprobante');
  await sequelize.query('DELETE FROM detalleventapromocion');
  await sequelize.query('DELETE FROM intentocompra');
  await sequelize.query('DELETE FROM detalleventa');
  await sequelize.query('DELETE FROM promocionproducto');
  await sequelize.query('DELETE FROM imagenproducto');
  await sequelize.query('DELETE FROM producto');
  await sequelize.query('DELETE FROM tienda');
  await sequelize.query('DELETE FROM solicitudvendedor');
  await sequelize.query('DELETE FROM usuario');
  await sequelize.query('DELETE FROM venta');
  await sequelize.query('DELETE FROM categoria');
  await sequelize.query('DELETE FROM tipomascota');
  await sequelize.query('DELETE FROM proveedor');
  await sequelize.query('DELETE FROM cliente');
  await sequelize.query('DELETE FROM mediopago');
};

// --- Fixtures mínimas, con datos ficticios ---

const crearClienteDePrueba = async (datos = {}) =>
  Cliente.create({
    nombre: 'Cliente',
    apellido: 'DePrueba',
    telefono: null,
    email: null,
    direccion: null,
    ...datos,
  });

const crearMedioPagoDePrueba = async (datos = {}) =>
  MedioPago.create({
    nombre: 'Efectivo de prueba',
    descripcion: null,
    habilitado: true,
    ...datos,
  });

// compra.service.js#obtenerIdMedioPagoSimulado busca estos DOS nombres
// exactos (ver sembrarDatosDemo.js/sembrarDatosE2E.js): cualquier prueba de
// integración que llame a confirmarCompra necesita que existan.
const crearMediosPagoSimuladosDePrueba = async () =>
  Promise.all([
    MedioPago.create({
      nombre: 'Transferencia bancaria (simulada)',
      descripcion: null,
      habilitado: true,
    }),
    MedioPago.create({
      nombre: 'Débito (simulado)',
      descripcion: null,
      habilitado: true,
    }),
  ]);

const crearProductoDePrueba = async (datos = {}) =>
  Producto.create({
    nombre: 'Producto de prueba',
    descripcion: null,
    precio: '100.00',
    stockActual: 10,
    stockMinimo: 1,
    idProveedor: null,
    idTipoMascota: null,
    idCategoria: null,
    ...datos,
  });

// Usuario 'cliente' vinculado a un Cliente propio (respeta la relación 1 a
// 1: ver models/usuario.model.js). Si no se pasa idCliente, crea un
// Cliente de prueba nuevo para vincular, igual que hace el registro
// público real (usuario.service.js#registrarUsuario).
const crearUsuarioDePrueba = async (datos = {}) => {
  const { idCliente, password = 'ClaveDePrueba123', ...resto } = datos;

  const idClienteFinal = idCliente ?? (await crearClienteDePrueba()).idCliente;

  return Usuario.create({
    email: `usuario-prueba-${Date.now()}-${Math.random().toString(36).slice(2)}@petshop.test`,
    contrasenaHash: await hashearContrasena(password),
    rol: 'cliente',
    idCliente: idClienteFinal,
    ...resto,
  });
};

// Cuenta 'vendedor_independiente' real con su Tienda propia ya creada (a
// diferencia de crearUsuarioDePrueba, que siempre arranca en 'cliente'):
// crea el Cliente + Usuario + Tienda en un solo paso, listos para probar
// autorización por tienda sin repetir esos 3 pasos en cada prueba. Conserva
// idCliente (a propósito, ver usuario.model.js: un vendedor independiente
// sigue siendo comprador).
const crearVendedorIndependienteDePrueba = async (datos = {}) => {
  const { password = 'ClaveDePrueba123', nombreTienda = 'Tienda de prueba', tienda: datosTienda = {}, ...resto } = datos;

  const usuario = await crearUsuarioDePrueba({
    password,
    rol: 'vendedor_independiente',
    ...resto,
  });

  const tienda = await Tienda.create({
    idUsuario: usuario.idUsuario,
    nombre: nombreTienda,
    tipoDocumento: 'CUIL',
    numeroDocumento: '20172543597', // CUIT/CUIL real, ver test/validacionFiscal.test.js
    estado: 'activa',
    ...datosTienda,
  });

  return { usuario, tienda };
};

// PromocionProducto requiere idProducto (FK obligatoria): si no se pasa, se
// crea un Producto de prueba nuevo para respetar esa relación en vez de
// insertar una fila que violaría la FK.
const crearPromocionDePrueba = async (datos = {}) => {
  const { idProducto, ...resto } = datos;

  const idProductoFinal = idProducto ?? (await crearProductoDePrueba()).idProducto;

  return PromocionProducto.create({
    fechaInicio: '2026-01-01',
    fechaFin: '2026-12-31',
    descuento: '10.00',
    idProducto: idProductoFinal,
    ...resto,
  });
};

// --- Sincronización determinista para pruebas de concurrencia ---
//
// En vez de confiar en que dos llamadas "al mismo tiempo" (Promise.all)
// efectivamente se entrelacen como se espera, estas utilidades abren una
// conexión CRUDA (fuera del pool de Sequelize, bajo control directo del
// test) que retiene un bloqueo real y deliberado sobre una fila, mientras
// se confirma —contra el propio MySQL, no por suposición— que hay otra
// transacción esperando exactamente ese bloqueo antes de continuar.

// Abre una conexión mysql2 independiente del pool de Sequelize, para poder
// mantener una transacción abierta bajo control directo del test (el pool
// de Sequelize no expone esa granularidad).
const abrirConexionCruda = async () => {
  asegurarConfiguracionExplicita();

  return mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
};

// Toma un bloqueo real y deliberado (SELECT ... FOR UPDATE) sobre la fila
// de `tabla` con clave primaria `id`, dentro de una transacción propia que
// queda abierta hasta que se llame a `liberar()`. Devuelve también el
// CONNECTION_ID() de esta conexión, para poder identificar sin ambigüedad,
// más abajo, quién bloquea a quién.
const retenerBloqueoDeFila = async (tabla, columnaId, id) => {
  const conexion = await abrirConexionCruda();

  await conexion.beginTransaction();
  await conexion.query(
    `SELECT ${columnaId} FROM ${tabla} WHERE ${columnaId} = ? FOR UPDATE`,
    [id],
  );

  const [[{ id: idConexion }]] = await conexion.query(
    'SELECT CONNECTION_ID() AS id',
  );

  let liberado = false;

  const liberar = async () => {
    if (liberado) return;
    liberado = true;
    // No se modificó ninguna fila (solo un SELECT ... FOR UPDATE): el
    // commit únicamente libera el bloqueo, no cambia ningún dato.
    await conexion.commit();
    await conexion.end();
  };

  return { idConexion, liberar };
};

// Cuenta, contra el propio performance_schema, cuántas transacciones están
// esperando específicamente el bloqueo retenido por la conexión
// `idConexionBloqueadora` — no cualquier espera global del servidor. Requiere
// que el usuario de conexión tenga SELECT sobre
// performance_schema.data_lock_waits y performance_schema.threads (ver
// docs/backend-base-de-datos.md para el GRANT exacto). Si falta el permiso,
// lanza un error explícito en vez de reportar "sin contención" por defecto,
// para no confundir una prueba sin evidencia con una prueba que sí la tiene.
const contarEsperasSobre = async (idConexionBloqueadora) => {
  try {
    const [filas] = await sequelize.query(
      `SELECT COUNT(*) AS cantidad
       FROM performance_schema.data_lock_waits w
       JOIN performance_schema.threads t ON t.THREAD_ID = w.BLOCKING_THREAD_ID
       WHERE t.PROCESSLIST_ID = ?`,
      { replacements: [idConexionBloqueadora] },
    );

    return Number(filas[0].cantidad);
  } catch (error) {
    throw new Error(
      'No se pudo consultar performance_schema.data_lock_waits/threads. ' +
        'El usuario de conexión necesita, como mínimo, ' +
        '`GRANT SELECT ON performance_schema.* TO \'<usuario>\'@\'<host>\'`. ' +
        `Error original: ${error.code || error.message}`,
    );
  }
};

// Espera activa (con timeout) a que el motor confirme contención real
// sobre la conexión bloqueadora indicada. No demuestra nada por sí sola si
// nadie revisa su resultado: quien la usa debe comprobar que devolvió
// `true` antes de continuar.
const esperarContencionSobre = async (
  idConexionBloqueadora,
  { timeoutMs = 3000, intervaloMs = 20 } = {},
) => {
  const limite = Date.now() + timeoutMs;

  while (Date.now() < limite) {
    const cantidad = await contarEsperasSobre(idConexionBloqueadora);

    if (cantidad > 0) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, intervaloMs));
  }

  return false;
};

export {
  NOMBRE_BASE_PERMITIDA,
  asegurarConfiguracionExplicita,
  asegurarBaseEfectivaDePrueba,
  prepararEsquema,
  limpiarDatos,
  crearClienteDePrueba,
  crearMedioPagoDePrueba,
  crearMediosPagoSimuladosDePrueba,
  crearProductoDePrueba,
  crearUsuarioDePrueba,
  crearVendedorIndependienteDePrueba,
  crearPromocionDePrueba,
  abrirConexionCruda,
  retenerBloqueoDeFila,
  esperarContencionSobre,
};
