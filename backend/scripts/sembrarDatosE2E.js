// Prepara datos de prueba REPETIBLES en la base EXCLUSIVA de E2E
// (petshop_e2e): antes de sembrar, borra todo lo que hubiera (respetando
// las claves foráneas) y vuelve a crear el mismo catálogo/cuentas fijas.
// Así cada corrida de Playwright arranca del mismo estado conocido, sin
// depender de qué stock dejó la corrida anterior ni acumular ventas de
// pruebas viejas (ver docs/frontend-pruebas.md, "Aislamiento para E2E").
//
// A diferencia de sembrarDatosDemo.js (upsert no destructivo, pensado para
// desarrollo local), este script SÍ borra datos — por eso exige la misma
// clase de resguardos que test-integracion/ayudaIntegracion.js, pero
// completamente separados de esos (una base y una habilitación propias):
// nunca debe poder ejecutarse por error contra petshop_db ni petshop_test.
//
// Uso:
//   cd backend
//   DOTENV_CONFIG_PATH=.env.e2e node scripts/sembrarDatosE2E.js
//   (o, con el script de package.json que ya arma esto: npm run sembrar:e2e)
import 'dotenv/config';
import sequelize from '../src/config/database.js';
import TipoMascota from '../src/models/tipoMascota.model.js';
import Categoria from '../src/models/categoria.model.js';
import Proveedor from '../src/models/proveedor.model.js';
import Producto from '../src/models/producto.model.js';
import '../src/models/facetaProducto.model.js';
import '../src/models/jerarquiaMascota.model.js';
import Cliente from '../src/models/cliente.model.js';
import MedioPago from '../src/models/medioPago.model.js';
import Usuario from '../src/models/usuario.model.js';
import '../src/models/venta.model.js';
import '../src/models/detalleVenta.model.js';
import '../src/models/promocionProducto.model.js';
import '../src/models/direccionEntrega.model.js';
import '../src/models/imagenProducto.model.js';
import '../src/models/intentoCompra.model.js';
import '../src/models/pago.model.js';
import '../src/models/comprobante.model.js';
import '../src/models/detalleVentaPromocion.model.js';
import '../src/models/solicitudCancelacion.model.js';
import { hashearContrasena } from '../src/utils/contrasenas.js';
import { registrarVenta } from '../src/services/venta.service.js';

// Nombre y usuario ÚNICOS contra los que este script acepta operar.
// Comparación exacta (no "contiene"), igual criterio que
// test-integracion/ayudaIntegracion.js, pero con su propia habilitación:
// esto es sembrado DESTRUCTIVO (borra todo antes de sembrar), así que el
// resguardo tiene que ser al menos igual de estricto.
const NOMBRE_BASE_PERMITIDA = process.env.E2E_DB_NAME_PERMITIDA || 'petshop_e2e';

const ES_IDENTIFICADOR_VALIDO = (nombre) =>
  typeof nombre === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(nombre);

const asegurarConfiguracionExplicita = () => {
  const nombreConfigurado = process.env.DB_NAME;
  const usuarioConfigurado = process.env.DB_USER;
  const habilitado = process.env.PERMITIR_SEMBRADO_E2E;

  if (!ES_IDENTIFICADOR_VALIDO(NOMBRE_BASE_PERMITIDA)) {
    throw new Error(
      `El nombre de base permitida ("${NOMBRE_BASE_PERMITIDA}") no es un identificador válido. Abortando.`,
    );
  }

  // Habilitación explícita, igual que ayudaIntegracion.js: si alguien
  // corre este script sin querer con la configuración de desarrollo
  // cargada, DB_NAME no va a coincidir de todas formas — pero esta
  // variable es una segunda barrera independiente, no solo una
  // comprobación de nombre.
  if (habilitado !== 'si') {
    throw new Error(
      'Falta habilitación explícita: definí PERMITIR_SEMBRADO_E2E=si para ' +
        'sembrar la base E2E. Esto evita que se ejecute por accidente.',
    );
  }

  if (nombreConfigurado !== NOMBRE_BASE_PERMITIDA) {
    throw new Error(
      `DB_NAME ("${nombreConfigurado || '(vacío)'}") debe ser exactamente ` +
        `"${NOMBRE_BASE_PERMITIDA}". Configuración ambigua: abortando antes de conectar. ` +
        '¿Falta cargar .env.e2e (DOTENV_CONFIG_PATH=.env.e2e)?',
    );
  }

  // Nunca root, ni el usuario de la app de desarrollo, ni el de
  // integración: cada ambiente tiene su propio usuario de conexión.
  if (!usuarioConfigurado || /^root$/i.test(usuarioConfigurado)) {
    throw new Error(
      `DB_USER ("${usuarioConfigurado || '(vacío)'}") no puede ser root ni estar vacío. Abortando.`,
    );
  }
};

asegurarConfiguracionExplicita();

const asegurarBaseEfectivaDeE2E = async () => {
  const [[fila]] = await sequelize.query(
    'SELECT DATABASE() AS baseEfectiva, CURRENT_USER() AS usuarioEfectivo',
  );

  if (fila.baseEfectiva !== NOMBRE_BASE_PERMITIDA) {
    throw new Error(
      `La conexión real está usando la base "${fila.baseEfectiva}", distinta de ` +
        `"${NOMBRE_BASE_PERMITIDA}". Abortando antes de escribir nada.`,
    );
  }

  if (/^root@/i.test(fila.usuarioEfectivo)) {
    throw new Error(
      `El usuario de conexión efectivo ("${fila.usuarioEfectivo}") es root. Abortando.`,
    );
  }

  console.log(`Base efectiva: ${fila.baseEfectiva}`);
  console.log(`Usuario efectivo: ${fila.usuarioEfectivo}`);
};

// Mismo orden (hijos antes que padres) que
// test-integracion/ayudaIntegracion.js#limpiarDatos, repetido acá a
// propósito en vez de importado: esta es la única dependencia que este
// script tiene con la base E2E, y debe poder borrarse/copiarse sin arrastrar
// nada de test-integracion/ (que tiene su propia habilitación, para
// petshop_test, no para esto).
//
// Corrección real (encontrada al re-sembrar tras la Etapa 8): esta lista
// se había quedado desactualizada desde las Etapas 4/5/6 — nunca sumó
// `direccioncliente`/`favorito`/`aviso`, así que sus filas quedaban
// huérfanas (apuntando a un cliente/usuario/producto ya borrado y
// recreado con otro id) después de cada re-siembra. Ahora incluye las 5
// tablas que se agregaron desde entonces, en el mismo orden que
// ayudaIntegracion.js — `producto` se corrió ANTES que `usuario` (antes
// iba después) porque `producto.idTienda` referencia a `tienda`, que a su
// vez referencia a `usuario`.
const limpiarTodo = async () => {
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
  await sequelize.query('DELETE FROM facetaproducto');
  await sequelize.query('DELETE FROM producto');
  await sequelize.query('DELETE FROM tienda');
  await sequelize.query('DELETE FROM solicitudvendedor');
  await sequelize.query('DELETE FROM usuario');
  await sequelize.query('DELETE FROM venta');
  await sequelize.query('DELETE FROM categoria');
  await sequelize.query('DELETE FROM jerarquiamascota');
  await sequelize.query('DELETE FROM tipomascota');
  await sequelize.query('DELETE FROM proveedor');
  await sequelize.query('DELETE FROM cliente');
  await sequelize.query('DELETE FROM mediopago');
};

const sembrar = async () => {
  await sequelize.authenticate();
  await asegurarBaseEfectivaDeE2E();
  await sequelize.sync();
  await limpiarTodo();

  const [perros, gatos] = await Promise.all([
    TipoMascota.create({ nombre: 'Perro', descripcion: 'Productos para perros' }),
    TipoMascota.create({ nombre: 'Gato', descripcion: 'Productos para gatos' }),
  ]);

  const [alimento, juguetes] = await Promise.all([
    Categoria.create({ nombre: 'Alimento', descripcion: 'Alimento balanceado' }),
    Categoria.create({ nombre: 'Juguetes', descripcion: 'Juguetes y entretenimiento' }),
  ]);

  const proveedor = await Proveedor.create({
    descripcion: 'Distribuidora E2E SA',
    direccion: 'Av. Siempre Viva 123',
    CUIT: '30-12345678-9',
    telefono: '3410000000',
  });

  // Los dos últimos son los que usa el checkout de pago simulado (CU-04):
  // ver compra.service.js#obtenerIdMedioPagoSimulado, que los busca por
  // este nombre exacto.
  const [efectivo] = await Promise.all([
    MedioPago.create({ nombre: 'Efectivo', descripcion: 'Pago en efectivo', habilitado: true }),
    MedioPago.create({
      nombre: 'Transferencia bancaria (simulada)',
      descripcion: 'Simulación de transferencia — checkout de cliente, sin movimiento real de dinero',
      habilitado: true,
    }),
    MedioPago.create({
      nombre: 'Débito (simulado)',
      descripcion: 'Simulación de pago con débito — checkout de cliente, sin pasarela real',
      habilitado: true,
    }),
  ]);

  // Stock alto a propósito: varias corridas de Playwright en la misma
  // siembra (o reintentos) no deberían agotarlo. Cada corrida completa de
  // todas formas vuelve a sembrar desde cero (ver limpiarTodo arriba), así
  // que esto es un margen adicional, no la única defensa.
  await Producto.bulkCreate([
    {
      nombre: 'Alimento perro adulto 15kg',
      descripcion: 'Balanceado para perros adultos',
      precio: '25999.00',
      stockActual: 500,
      stockMinimo: 5,
      idProveedor: proveedor.idProveedor,
      idTipoMascota: perros.idTipoMascota,
      idCategoria: alimento.idCategoria,
    },
    {
      nombre: 'Pelota de goma resistente',
      descripcion: 'Juguete resistente a mordidas para perros',
      precio: '3500.00',
      stockActual: 500,
      stockMinimo: 5,
      idProveedor: proveedor.idProveedor,
      idTipoMascota: perros.idTipoMascota,
      idCategoria: juguetes.idCategoria,
    },
    {
      nombre: 'Rascador para gatos',
      descripcion: 'Rascador de sisal con base',
      precio: '15500.00',
      stockActual: 500,
      stockMinimo: 2,
      idProveedor: proveedor.idProveedor,
      idTipoMascota: gatos.idTipoMascota,
      idCategoria: juguetes.idCategoria,
    },
  ]);

  const credenciales = [
    { email: 'admin@petshop-e2e.test', password: 'E2EDemo1234Admin', rol: 'administrador', idCliente: null },
    { email: 'vendedor@petshop-e2e.test', password: 'E2EDemo1234Vende', rol: 'vendedor', idCliente: null },
  ];

  for (const { email, password, rol, idCliente } of credenciales) {
    await Usuario.create({
      email,
      contrasenaHash: await hashearContrasena(password),
      rol,
      idCliente,
    });
  }

  // Mismo nombre/apellido que sembrarDatosDemo.js a propósito: las pruebas
  // E2E (recorrido-completo.spec.js) seleccionan el cliente por esta
  // etiqueta exacta ("Cliente De Prueba") en el selector del panel.
  const clienteE2E = await Cliente.create({
    nombre: 'Cliente',
    apellido: 'De Prueba',
    email: 'cliente@petshop-e2e.test',
    telefono: '3410000001',
    direccion: 'Calle Falsa 456',
  });

  await Usuario.create({
    email: 'cliente@petshop-e2e.test',
    contrasenaHash: await hashearContrasena('E2EDemo1234Client'),
    rol: 'cliente',
    idCliente: clienteE2E.idCliente,
  });

  // Venta fija preexistente (corrección de una revisión posterior):
  // e2e/capturas.spec.js visita /panel/ventas para sacar una captura, pero
  // esa pantalla no renderiza ninguna tabla cuando el listado está vacío
  // (ver PanelVentas.jsx: "No hay ventas con ese filtro." en su lugar) — en
  // una base recién sembrada, sin esto, esa captura fallaba si corría antes
  // que cualquier prueba que registre una venta (depende del orden de
  // ejecución, no del viewport, aunque el síntoma solo se veía en un
  // viewport por casualidad de ese orden). Se registra vía registrarVenta
  // (el mismo servicio real, no un INSERT manual) para que quede con stock
  // descontado y totales calculados de forma consistente con cualquier
  // venta real. Producto elegido a propósito: ninguna prueba de e2e/ lo usa,
  // así que esta venta fija no interfiere con sus aserciones de stock.
  const productoParaVentaFija = await Producto.findOne({
    where: { nombre: 'Alimento perro adulto 15kg' },
  });
  await registrarVenta(
    {
      idCliente: clienteE2E.idCliente,
      idMedioPago: efectivo.idMedioPago,
      detalles: [{ idProducto: productoParaVentaFija.idProducto, cantidad: 1 }],
    },
    { idUsuario: 0, rol: 'vendedor', idCliente: null },
  );

  console.log('Base de datos E2E (petshop_e2e) reiniciada y sembrada.');
  console.log('');
  console.log('Cuentas de prueba (SOLO E2E, no son credenciales reales):');
  console.log('  Administrador -> admin@petshop-e2e.test / E2EDemo1234Admin');
  console.log('  Vendedor      -> vendedor@petshop-e2e.test / E2EDemo1234Vende');
  console.log('  Cliente       -> cliente@petshop-e2e.test / E2EDemo1234Client');

  await sequelize.close();
};

sembrar().catch((error) => {
  console.error('No se pudo sembrar la base E2E:', error.message);
  process.exit(1);
});
