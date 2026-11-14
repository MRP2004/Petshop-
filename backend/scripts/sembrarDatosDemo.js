// Carga datos ficticios suficientes para recorrer la aplicación (catálogo,
// checkout, panel de gestión) en un ambiente de desarrollo local.
// No debe ejecutarse contra una base de producción.
// Las contraseñas de las cuentas demo se leen de backend/.env y no se
// imprimen. Este seed está limitado a ambientes de desarrollo.
import 'dotenv/config';
import { hashearContrasena } from '../src/utils/contrasenas.js';

const obtenerCredencialesDemo = () => {
  const entorno = (process.env.ENTORNO || '').trim().toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
  if (
    nodeEnv === 'production' ||
    ['production', 'produccion', 'producción', 'prod'].includes(entorno)
  ) {
    throw new Error('sembrar:demo está deshabilitado en ambientes de producción');
  }

  const credenciales = [
    {
      email: 'admin@petshop.demo',
      password: process.env.SEED_ADMIN_PASSWORD,
      rol: 'administrador',
      variable: 'SEED_ADMIN_PASSWORD',
    },
    {
      email: 'vendedor@petshop.demo',
      password: process.env.SEED_VENDEDOR_PASSWORD,
      rol: 'vendedor',
      variable: 'SEED_VENDEDOR_PASSWORD',
    },
  ];
  const passwordCliente = process.env.SEED_CLIENTE_PASSWORD;
  const faltantes = [
    ...credenciales
      .filter(({ password }) => !password?.trim())
      .map(({ variable }) => variable),
    ...(!passwordCliente?.trim() ? ['SEED_CLIENTE_PASSWORD'] : []),
  ];

  if (faltantes.length > 0) {
    throw new Error(`Faltan contraseñas en el entorno: ${faltantes.join(', ')}`);
  }

  return { credenciales, passwordCliente };
};

const buscarOCrear = async (Modelo, where, datosExtra = {}) => {
  const existente = await Modelo.findOne({ where });
  if (existente) {
    return existente;
  }
  return Modelo.create({ ...where, ...datosExtra });
};

const sembrar = async () => {
  const { credenciales, passwordCliente } = obtenerCredencialesDemo();

  const [
    { default: sequelize },
    { default: Categoria },
    { default: TipoMascota },
    { default: Proveedor },
    { default: MedioPago },
    { default: Producto },
    { default: Cliente },
    { default: Usuario },
  ] = await Promise.all([
    import('../src/config/database.js'),
    import('../src/models/categoria.model.js'),
    import('../src/models/tipoMascota.model.js'),
    import('../src/models/proveedor.model.js'),
    import('../src/models/medioPago.model.js'),
    import('../src/models/producto.model.js'),
    import('../src/models/cliente.model.js'),
    import('../src/models/usuario.model.js'),
  ]);

  await sequelize.authenticate();
  await sequelize.sync();

  const [perros, gatos] = await Promise.all([
    buscarOCrear(TipoMascota, { nombre: 'Perro' }, { descripcion: 'Productos para perros' }),
    buscarOCrear(TipoMascota, { nombre: 'Gato' }, { descripcion: 'Productos para gatos' }),
  ]);

  const [alimento, juguetes, higiene] = await Promise.all([
    buscarOCrear(Categoria, { nombre: 'Alimento' }, { descripcion: 'Alimento balanceado' }),
    buscarOCrear(Categoria, { nombre: 'Juguetes' }, { descripcion: 'Juguetes y entretenimiento' }),
    buscarOCrear(Categoria, { nombre: 'Higiene' }, { descripcion: 'Productos de higiene y cuidado' }),
  ]);

  const proveedor = await buscarOCrear(
    Proveedor,
    { descripcion: 'Distribuidora PetFood SA' },
    { direccion: 'Av. Siempre Viva 123', CUIT: '30-12345678-9', telefono: '3410000000' },
  );

  const [efectivo, tarjeta] = await Promise.all([
    buscarOCrear(MedioPago, { nombre: 'Efectivo' }, { descripcion: 'Pago en efectivo', habilitado: true }),
    buscarOCrear(MedioPago, { nombre: 'Tarjeta de débito' }, { descripcion: 'Pago con tarjeta', habilitado: true }),
  ]);

  // Medios de pago simulados del checkout de cliente: compra.service.js
  await Promise.all([
    buscarOCrear(
      MedioPago,
      { nombre: 'Transferencia bancaria (simulada)' },
      { descripcion: 'Simulación de transferencia — checkout de cliente, sin movimiento real de dinero', habilitado: true },
    ),
    buscarOCrear(
      MedioPago,
      { nombre: 'Débito (simulado)' },
      { descripcion: 'Simulación de pago con débito — checkout de cliente, sin pasarela real', habilitado: true },
    ),
  ]);

  const productos = [
    {
      nombre: 'Alimento perro adulto 15kg',
      descripcion: 'Balanceado para perros adultos, todas las razas',
      precio: '25999.00',
      stockActual: 40,
      stockMinimo: 5,
      idProveedor: proveedor.idProveedor,
      idTipoMascota: perros.idTipoMascota,
      idCategoria: alimento.idCategoria,
    },
    {
      nombre: 'Alimento gato adulto 7.5kg',
      descripcion: 'Balanceado para gatos adultos',
      precio: '18999.00',
      stockActual: 3,
      stockMinimo: 5,
      idProveedor: proveedor.idProveedor,
      idTipoMascota: gatos.idTipoMascota,
      idCategoria: alimento.idCategoria,
    },
    {
      nombre: 'Pelota de goma resistente',
      descripcion: 'Juguete resistente a mordidas para perros',
      precio: '3500.00',
      stockActual: 25,
      stockMinimo: 5,
      idProveedor: proveedor.idProveedor,
      idTipoMascota: perros.idTipoMascota,
      idCategoria: juguetes.idCategoria,
    },
    {
      nombre: 'Rascador para gatos',
      descripcion: 'Rascador de sisal con base',
      precio: '15500.00',
      stockActual: 10,
      stockMinimo: 2,
      idProveedor: proveedor.idProveedor,
      idTipoMascota: gatos.idTipoMascota,
      idCategoria: juguetes.idCategoria,
    },
    {
      nombre: 'Shampoo antipulgas',
      descripcion: 'Shampoo para perros y gatos, 500ml',
      precio: '4200.00',
      stockActual: 18,
      stockMinimo: 4,
      idProveedor: proveedor.idProveedor,
      idTipoMascota: null,
      idCategoria: higiene.idCategoria,
    },
  ];

  for (const datosProducto of productos) {
    await buscarOCrear(Producto, { nombre: datosProducto.nombre }, datosProducto);
  }

  // --- Usuarios de prueba (contraseñas ficticias, solo para desarrollo) ---
  for (const { email, password, rol } of credenciales) {
    const existente = await Usuario.findOne({ where: { email } });
    if (!existente) {
      await Usuario.create({
        email,
        contrasenaHash: await hashearContrasena(password),
        rol,
        idCliente: null,
      });
    }
  }

  const emailClienteDemo = 'cliente@petshop.demo';
  let usuarioCliente = await Usuario.findOne({ where: { email: emailClienteDemo } });
  if (!usuarioCliente) {
    const cliente = await Cliente.create({
      nombre: 'Cliente',
      apellido: 'De Prueba',
      email: emailClienteDemo,
      telefono: '3410000001',
      direccion: 'Calle Falsa 456',
    });
    usuarioCliente = await Usuario.create({
      email: emailClienteDemo,
      contrasenaHash: await hashearContrasena(passwordCliente),
      rol: 'cliente',
      idCliente: cliente.idCliente,
    });
  }

  console.log('Datos de demostración listos.');
  console.log('Las contraseñas de las cuentas demo no se muestran.');

  await sequelize.close();
};

sembrar().catch((error) => {
  console.error('No se pudieron cargar los datos de demostración:', error.message);
  process.exit(1);
});
