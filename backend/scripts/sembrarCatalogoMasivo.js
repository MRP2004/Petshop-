// Catálogo ficticio para evaluar filtros y paginación con 1000 productos.
// SOLO opera sobre petshop_catalogo_demo; no borra productos, ventas ni usuarios.
// Es idempotente: los nombres generados son estables entre ejecuciones.
import 'dotenv/config';
import { Op } from 'sequelize';
import sequelize from '../src/config/database.js';
import '../src/models/index.js';
import TipoMascota from '../src/models/tipoMascota.model.js';
import JerarquiaMascota from '../src/models/jerarquiaMascota.model.js';
import Categoria from '../src/models/categoria.model.js';
import Producto from '../src/models/producto.model.js';
import ImagenProducto from '../src/models/imagenProducto.model.js';
import FacetaProducto from '../src/models/facetaProducto.model.js';
import MedioPago from '../src/models/medioPago.model.js';
import Cliente from '../src/models/cliente.model.js';
import Usuario from '../src/models/usuario.model.js';
import { hashearContrasena } from '../src/utils/contrasenas.js';

const NOMBRE_BASE = 'petshop_catalogo_demo';
const CANTIDAD = 1000;
const categorias = ['Alimento', 'Snacks', 'Juguetes', 'Higiene', 'Accesorios', 'Hábitat', 'Equipamiento', 'Transporte'];
const mascotas = [
  { nombre: 'Perro', tipos: [], categorias: ['Alimento', 'Snacks', 'Juguetes', 'Higiene', 'Accesorios', 'Hábitat', 'Transporte'] },
  { nombre: 'Gato', tipos: [], categorias: ['Alimento', 'Snacks', 'Juguetes', 'Higiene', 'Accesorios', 'Hábitat', 'Transporte'] },
  { nombre: 'Ave', tipos: ['Periquito', 'Canario', 'Ninfa'], categorias: ['Alimento', 'Snacks', 'Juguetes', 'Accesorios', 'Hábitat'] },
  { nombre: 'Pequeños mamíferos', tipos: ['Conejo', 'Hámster', 'Cobayo', 'Hurón'], categorias: ['Alimento', 'Snacks', 'Juguetes', 'Higiene', 'Accesorios', 'Hábitat'] },
  { nombre: 'Pez', tipos: ['Goldfish', 'Betta', 'Guppy', 'Pez payaso'], categorias: ['Alimento', 'Accesorios', 'Hábitat', 'Equipamiento'] },
  { nombre: 'Reptil', tipos: ['Tortuga de agua', 'Gecko', 'Iguana'], categorias: ['Alimento', 'Accesorios', 'Hábitat', 'Equipamiento'] },
];
const marcasFicticias = ['Luma', 'Pampa', 'Mimo', 'Nido', 'Brote', 'Río', 'Trébol', 'Nube'];
const familias = {
  Alimento: ['Balanceado', 'Mezcla nutritiva', 'Alimento diario', 'Fórmula completa'],
  Snacks: ['Bocaditos', 'Premios crocantes', 'Mix de snacks', 'Galletitas'],
  Juguetes: ['Pelota interactiva', 'Mordillo', 'Juego de actividad', 'Juguete de cuerda'],
  Higiene: ['Cepillo suave', 'Toallitas de limpieza', 'Kit de higiene', 'Shampoo suave'],
  Accesorios: ['Comedero', 'Bebedero', 'Bolso de paseo', 'Accesorio de cuidado'],
  Hábitat: ['Cama acolchada', 'Refugio', 'Nido', 'Sustrato para hábitat'],
  Equipamiento: ['Filtro compacto', 'Lámpara de hábitat', 'Termómetro', 'Kit de mantenimiento'],
  Transporte: ['Transportadora', 'Bolso de viaje', 'Arnés de paseo', 'Manta portátil'],
};
const presentaciones = ['compacto', 'estándar', 'grande', 'liviano', 'reforzado'];
const slug = (texto) => texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const crearFacetas = (tipo, categoria, indice) => {
  const grupo = tipo.grupo.nombre;
  const elegir = (valores) => valores[indice % valores.length];
  return {
    etapaVida: grupo === 'Perro' ? elegir(['cachorro', 'adulto', 'senior'])
      : grupo === 'Gato' ? elegir(['gatito', 'adulto', 'senior']) : null,
    tamano: grupo === 'Perro' ? elegir(['pequeno', 'mediano', 'grande']) : null,
    condicion: grupo === 'Gato' ? elegir(['interior', 'esterilizado', 'activo']) : null,
    formato: ['Alimento', 'Snacks'].includes(categoria)
      ? grupo === 'Ave' ? elegir(['semillas', 'pellets'])
        : elegir(['seco', 'humedo', 'snack']) : null,
    tipoAgua: grupo === 'Pez' ? (tipo.nombre === 'Goldfish' ? 'fria' : tipo.nombre === 'Pez payaso' ? 'marina' : 'tropical') : null,
    tipoArena: grupo === 'Gato' && categoria === 'Higiene'
      ? elegir(['aglomerante', 'silice', 'ecologica']) : null,
  };
};

const ejecutar = async () => {
  if (process.env.DB_NAME !== NOMBRE_BASE || !process.env.DB_USER || /^root$/i.test(process.env.DB_USER)) {
    throw new Error('Configuración inválida: usá exclusivamente la base y el usuario de catálogo de demostración');
  }
  await sequelize.authenticate();
  const [[conexion]] = await sequelize.query('SELECT DATABASE() AS base, CURRENT_USER() AS usuario');
  console.log(`Base efectiva: ${conexion.base}; usuario: ${conexion.usuario}`);
  if (conexion.base !== NOMBRE_BASE) throw new Error(`Este sembrador solo acepta ${NOMBRE_BASE}`);
  if (!process.argv.includes('--confirmar')) {
    console.log('Modo informativo: no se modificó nada. Agregá --confirmar para sembrar.');
    return;
  }

  await sequelize.sync();
  await sequelize.transaction(async (transaction) => {
    const categoriasPorNombre = new Map();
    for (const nombre of categorias) {
      const [categoria] = await Categoria.findOrCreate({ where: { nombre }, defaults: { descripcion: `Productos de ${nombre.toLowerCase()}` }, transaction });
      categoriasPorNombre.set(nombre, categoria.idCategoria);
    }

    // Cuentas y medios estrictamente ficticios para poder recorrer también
    // carrito, checkout y panel de gestión dentro de esta base aislada.
    for (const nombre of ['Transferencia bancaria (simulada)', 'Débito (simulado)', 'Efectivo']) {
      await MedioPago.findOrCreate({
        where: { nombre },
        defaults: { descripcion: 'Medio de demostración', habilitado: true },
        transaction,
      });
    }
    const emailCliente = 'cliente-catalogo@petshop.demo';
    let usuarioCliente = await Usuario.findOne({ where: { email: emailCliente }, transaction });
    if (!usuarioCliente) {
      const cliente = await Cliente.create({
        nombre: 'Cliente', apellido: 'Catálogo', email: emailCliente,
        telefono: '3410000000', direccion: 'Rosario, Santa Fe',
      }, { transaction });
      usuarioCliente = await Usuario.create({
        email: emailCliente, contrasenaHash: await hashearContrasena('Demo1234Client'),
        rol: 'cliente', idCliente: cliente.idCliente,
      }, { transaction });
    }
    for (const [email, rol, password] of [
      ['vendedor-catalogo@petshop.demo', 'vendedor', 'Demo1234Vende'],
      ['admin-catalogo@petshop.demo', 'administrador', 'Demo1234Admin'],
    ]) {
      if (!(await Usuario.findOne({ where: { email }, transaction }))) {
        await Usuario.create({
          email, contrasenaHash: await hashearContrasena(password), rol, idCliente: null,
        }, { transaction });
      }
    }

    const tipos = [];
    for (const grupo of mascotas) {
      const [padre] = await TipoMascota.findOrCreate({ where: { nombre: grupo.nombre }, transaction });
      const nombres = grupo.tipos.length ? grupo.tipos : [grupo.nombre];
      for (const nombre of nombres) {
        const hijo = nombre === grupo.nombre
          ? padre
          : (await TipoMascota.findOrCreate({ where: { nombre }, transaction }))[0];
        if (hijo.idTipoMascota !== padre.idTipoMascota) {
          await JerarquiaMascota.findOrCreate({
            where: { idTipoPadre: padre.idTipoMascota, idTipoHijo: hijo.idTipoMascota }, transaction,
          });
        }
        tipos.push({ grupo, nombre, idTipoMascota: hijo.idTipoMascota });
      }
    }

    const generados = Array.from({ length: CANTIDAD }, (_, indice) => {
      const tipo = tipos[indice % tipos.length];
      const categoria = tipo.grupo.categorias[Math.floor(indice / tipos.length) % tipo.grupo.categorias.length];
      const familia = familias[categoria][Math.floor(indice / (tipos.length * 2)) % familias[categoria].length];
      const marca = marcasFicticias[Math.floor(indice / 5) % marcasFicticias.length];
      const presentacion = presentaciones[Math.floor(indice / tipos.length) % presentaciones.length];
      const nombre = `${marca} ${familia} ${tipo.nombre} ${presentacion} serie ${String(indice + 1).padStart(4, '0')}`;
      return {
        nombre,
        descripcion: `Artículo ficticio de demostración para ${tipo.nombre.toLowerCase()}. ${familia} ${presentacion}; sin marca comercial real.`,
        precio: ((1800 + (indice * 137) % 85000) / 1).toFixed(2),
        stockActual: indice % 17 === 0 ? 0 : indice % 9 === 0 ? 3 : 12 + (indice % 48),
        stockMinimo: 5,
        idCategoria: categoriasPorNombre.get(categoria),
        idTipoMascota: tipo.idTipoMascota,
        idProveedor: null,
        idTienda: null,
        urlImagen: `/demo-productos/${slug(tipo.grupo.nombre)}-${slug(categoria)}.svg`,
        facetas: { ...crearFacetas(tipo, categoria, indice), marca },
      };
    });

    for (let inicio = 0; inicio < generados.length; inicio += 100) {
      const lote = generados.slice(inicio, inicio + 100);
      const nombres = lote.map((producto) => producto.nombre);
      const existentes = await Producto.findAll({ where: { nombre: { [Op.in]: nombres } }, attributes: ['nombre'], transaction });
      const encontrados = new Set(existentes.map((producto) => producto.nombre));
      await Producto.bulkCreate(lote.filter((producto) => !encontrados.has(producto.nombre)).map(({ urlImagen, facetas, ...producto }) => producto), { transaction });
      const productos = await Producto.findAll({ where: { nombre: { [Op.in]: nombres } }, attributes: ['idProducto', 'nombre'], transaction });
      const urls = new Map(lote.map((producto) => [producto.nombre, producto.urlImagen]));
      const facetas = new Map(lote.map((producto) => [producto.nombre, producto.facetas]));
      await ImagenProducto.bulkCreate(productos.map((producto) => ({
        idProducto: producto.idProducto,
        url: urls.get(producto.nombre),
      })), { transaction, ignoreDuplicates: true });
      await FacetaProducto.bulkCreate(productos.map((producto) => ({
        idProducto: producto.idProducto,
        ...facetas.get(producto.nombre),
      })), { transaction, ignoreDuplicates: true });
    }
  });
  console.log(`${CANTIDAD} artículos ficticios presentes. Repetir el comando no duplica sus nombres ni imágenes.`);
};

ejecutar().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => sequelize.close());
