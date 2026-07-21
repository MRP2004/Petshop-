import Producto from '../models/producto.model.js';
import Categoria from '../models/categoria.model.js';
import TipoMascota from '../models/tipoMascota.model.js';
import Proveedor from '../models/proveedor.model.js';
import AppError from '../errors/AppError.js';

const relaciones = [
  {
    model: Categoria,
    as: 'categoria',
  },
  {
    model: TipoMascota,
    as: 'tipoMascota',
  },
  {
    model: Proveedor,
    as: 'proveedor',
  },
];

const validarId = (id) => {
  const idProducto = Number(id);

  if (!Number.isInteger(idProducto) || idProducto <= 0) {
    throw new AppError('El ID del producto no es válido', 400);
  }

  return idProducto;
};

const prepararIdOpcional = (valor, nombreCampo) => {
  if (valor === undefined || valor === null || valor === '') {
    return null;
  }

  const id = Number(valor);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(`${nombreCampo} no es válido`, 400);
  }

  return id;
};

const prepararDatos = (datos) => {
  const nombre =
    typeof datos.nombre === 'string' ? datos.nombre.trim() : '';

  const descripcion =
    typeof datos.descripcion === 'string'
      ? datos.descripcion.trim()
      : null;

  const precio = Number(datos.precio);
  const stockActual = Number(datos.stockActual);
  const stockMinimo = Number(datos.stockMinimo);

  const idProveedor = prepararIdOpcional(
    datos.idProveedor,
    'El ID del proveedor',
  );

  const idTipoMascota = prepararIdOpcional(
    datos.idTipoMascota,
    'El ID del tipo de mascota',
  );

  const idCategoria = prepararIdOpcional(
    datos.idCategoria,
    'El ID de la categoría',
  );

  if (nombre.length < 2 || nombre.length > 80) {
    throw new AppError(
      'El nombre debe contener entre 2 y 80 caracteres',
      400,
    );
  }

  if (descripcion && descripcion.length > 200) {
    throw new AppError(
      'La descripción no puede superar los 200 caracteres',
      400,
    );
  }

  if (
    datos.precio === undefined ||
    datos.precio === null ||
    datos.precio === '' ||
    !Number.isFinite(precio) ||
    precio < 0 ||
    precio > 99999999.99
  ) {
    throw new AppError('El precio no es válido', 400);
  }

  if (
    !Number.isInteger(stockActual) ||
    stockActual < 0
  ) {
    throw new AppError(
      'El stock actual debe ser un número entero igual o mayor que cero',
      400,
    );
  }

  if (
    !Number.isInteger(stockMinimo) ||
    stockMinimo < 0
  ) {
    throw new AppError(
      'El stock mínimo debe ser un número entero igual o mayor que cero',
      400,
    );
  }

  return {
    nombre,
    descripcion: descripcion || null,
    precio,
    stockActual,
    stockMinimo,
    idProveedor,
    idTipoMascota,
    idCategoria,
  };
};

const comprobarRelaciones = async ({
  idProveedor,
  idTipoMascota,
  idCategoria,
}) => {
  const [proveedor, tipoMascota, categoria] = await Promise.all([
    idProveedor
      ? Proveedor.findByPk(idProveedor)
      : Promise.resolve(null),

    idTipoMascota
      ? TipoMascota.findByPk(idTipoMascota)
      : Promise.resolve(null),

    idCategoria
      ? Categoria.findByPk(idCategoria)
      : Promise.resolve(null),
  ]);

  if (idProveedor && !proveedor) {
    throw new AppError('El proveedor indicado no existe', 400);
  }

  if (idTipoMascota && !tipoMascota) {
    throw new AppError(
      'El tipo de mascota indicado no existe',
      400,
    );
  }

  if (idCategoria && !categoria) {
    throw new AppError('La categoría indicada no existe', 400);
  }
};

const obtenerProductos = async () => {
  return Producto.findAll({
    include: relaciones,
    order: [['nombre', 'ASC']],
  });
};

const obtenerProductoPorId = async (id) => {
  const idProducto = validarId(id);

  const producto = await Producto.findByPk(idProducto, {
    include: relaciones,
  });

  if (!producto) {
    throw new AppError('Producto no encontrado', 404);
  }

  return producto;
};

const crearProducto = async (datos) => {
  const datosPreparados = prepararDatos(datos);

  await comprobarRelaciones(datosPreparados);

  const producto = await Producto.create(datosPreparados);

  return obtenerProductoPorId(producto.idProducto);
};

const actualizarProducto = async (id, datos) => {
  const idProducto = validarId(id);
  const producto = await Producto.findByPk(idProducto);

  if (!producto) {
    throw new AppError('Producto no encontrado', 404);
  }

  const datosPreparados = prepararDatos(datos);

  await comprobarRelaciones(datosPreparados);
  await producto.update(datosPreparados);

  return obtenerProductoPorId(idProducto);
};

const eliminarProducto = async (id) => {
  const idProducto = validarId(id);
  const producto = await Producto.findByPk(idProducto);

  if (!producto) {
    throw new AppError('Producto no encontrado', 404);
  }

  await producto.destroy();
};

export {
  obtenerProductos,
  obtenerProductoPorId,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
};