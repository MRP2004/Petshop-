// Carga datos ficticios suficientes para recorrer la aplicación (catálogo,
// checkout, panel de gestión) en un ambiente de desarrollo local. No debe
// ejecutarse contra una base de producción: usa sync() (no destructivo) y
// hace upsert manual por nombre/email para poder correrse más de una vez sin
// duplicar filas.
//
// Uso:
//   cd backend
//   node scripts/sembrarDatosDemo.js
//
// Las contraseñas impresas al final son SOLO para desarrollo local: no son
// credenciales reales, no se guardan en ningún archivo del repositorio, y no
// deben reutilizarse fuera de este propósito.
import 'dotenv/config';
import sequelize from '../src/config/database.js';
import Categoria from '../src/models/categoria.model.js';
import TipoMascota from '../src/models/tipoMascota.model.js';
import Proveedor from '../src/models/proveedor.model.js';
import MedioPago from '../src/models/medioPago.model.js';
import Producto from '../src/models/producto.model.js';
import Cliente from '../src/models/cliente.model.js';
import Usuario from '../src/models/usuario.model.js';
import { hashearContrasena } from '../src/utils/contrasenas.js';

const buscarOCrear = async (Modelo, where, datosExtra = {}) => {
  const existente = await Modelo.findOne({ where });
  if (existente) {
    return existente;
  }
  return Modelo.create({ ...where, ...datosExtra });
};

const sembrar = async () => {
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

  // Medios de pago simulados del checkout de cliente (CU-04): compra.service.js
  // los busca por este nombre exacto para vincularlos a la Venta — el
  // cliente no los elige de esta lista, elige "transferencia" o "débito" y
  // el backend resuelve cuál de estos dos usar (ver
  // docs/cu04-checkout-pago.md). No aparecen en la carga manual del
  // personal ni en el checkout salvo por su nombre; no representan ninguna
  // pasarela real.
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
  const credencialesDemo = [
    { email: 'admin@petshop.demo', password: 'Demo1234Admin', rol: 'administrador' },
    { email: 'vendedor@petshop.demo', password: 'Demo1234Vende', rol: 'vendedor' },
  ];

  for (const { email, password, rol } of credencialesDemo) {
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
  const passwordClienteDemo = 'Demo1234Client';
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
      contrasenaHash: await hashearContrasena(passwordClienteDemo),
      rol: 'cliente',
      idCliente: cliente.idCliente,
    });
  }

  console.log('Datos de demostración listos.');
  console.log('');
  console.log('Usuarios de prueba (SOLO desarrollo local, no son credenciales reales):');
  console.log(`  Administrador -> admin@petshop.demo / Demo1234Admin`);
  console.log(`  Vendedor      -> vendedor@petshop.demo / Demo1234Vende`);
  console.log(`  Cliente       -> cliente@petshop.demo / Demo1234Client`);

  await sequelize.close();
};

sembrar().catch((error) => {
  console.error('No se pudieron cargar los datos de demostración:', error.message);
  process.exit(1);
});
