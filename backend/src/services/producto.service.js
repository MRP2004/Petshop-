import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import Producto from '../models/producto.model.js';
import Categoria from '../models/categoria.model.js';
import TipoMascota from '../models/tipoMascota.model.js';
import Proveedor from '../models/proveedor.model.js';
import ImagenProducto from '../models/imagenProducto.model.js';
import AppError from '../errors/AppError.js';
import {
  MAXIMO_ENTERO_POSITIVO,
  esObjetoPlano,
  validarEnteroEnRango,
  prepararEnteroOpcional,
  prepararImporteObligatorio,
  limpiarCadenaOpcional,
} from '../utils/validacion.js';

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
  {
    model: ImagenProducto,
    as: 'imagen',
    required: false,
  },
];

// Longitud máxima razonable para una URL de imagen (ver
// docs/backend-api.md): suficientemente holgada para una URL real con
// parámetros de consulta, sin permitir un valor arbitrariamente largo.
const LONGITUD_MAXIMA_URL_IMAGEN = 300;

// No hay fotos de producto reales fabricadas para esta entrega (ver
// docs/frontend-diseno.md): esto no guarda un archivo ni lo aloja, solo
// valida y persiste una URL que el personal carga a mano (por ejemplo, la
// foto que ya publica un proveedor). Se exige http(s) explícito para
// descartar valores que claramente no son una URL (evita que alguien cargue
// "sin imagen" o un nombre de archivo local por error, que el navegador
// jamás podría resolver).
const prepararUrlImagen = (valorCrudo) => {
  if (valorCrudo === undefined || valorCrudo === null || valorCrudo === '') {
    return null;
  }

  if (typeof valorCrudo !== 'string') {
    throw new AppError('La URL de la imagen no es válida', 400);
  }

  const url = valorCrudo.trim();

  if (url.length > LONGITUD_MAXIMA_URL_IMAGEN) {
    throw new AppError(
      `La URL de la imagen no puede superar los ${LONGITUD_MAXIMA_URL_IMAGEN} caracteres`,
      400,
    );
  }

  if (!/^https?:\/\/.+/i.test(url)) {
    throw new AppError(
      'La URL de la imagen debe empezar con http:// o https://',
      400,
    );
  }

  return url;
};

// Crea, reemplaza o borra la fila de ImagenProducto según lo que se haya
// mandado en el formulario: igual criterio que el resto de los campos
// opcionales de este mismo formulario (idProveedor, idTipoMascota,
// idCategoria en prepararDatosComunes) — el valor actual del formulario
// siempre reemplaza al anterior, no es un parche disperso.
//
// Corrección de una revisión posterior: esto antes corría fuera de
// cualquier transacción, "porque no había ninguna regla de negocio en
// juego" — pero sí la hay: si esto tiene éxito y el paso siguiente de
// quien llama falla (o al revés), el producto y su imagen quedan
// inconsistentes entre sí, sin ninguna forma de revertir uno sin el otro.
// Se reprodujo con persistencia simulada exactamente ese caso (borrar la
// imagen con éxito y que el borrado del producto fallara después, dejando
// el producto vivo pero sin imagen). Ahora recibe la transacción de quien
// llama (crearProducto/actualizarProducto) y la usa en cada operación, así
// que si cualquier otro paso de esa misma operación falla, esto también se
// revierte solo (rollback automático de sequelize.transaction).
const sincronizarImagenProducto = async (idProducto, urlImagen, transaction) => {
  if (urlImagen === null) {
    await ImagenProducto.destroy({ where: { idProducto }, transaction });
    return;
  }

  const existente = await ImagenProducto.findByPk(idProducto, { transaction });
  if (existente) {
    await existente.update({ url: urlImagen }, { transaction });
  } else {
    await ImagenProducto.create({ idProducto, url: urlImagen }, { transaction });
  }
};

const validarId = (id) =>
  validarEnteroEnRango(
    id,
    1,
    MAXIMO_ENTERO_POSITIVO,
    'El ID del producto no es válido',
  );

// Campos comunes a creación y edición: nombre, descripción, precio y las
// relaciones opcionales. El stock queda fuera a propósito (ver
// prepararDatosCreacion / prepararDatosActualizacion): mezclarlo acá abriría
// la puerta a que una edición de datos generales vuelva a pisar el stock.
const prepararDatosComunes = (datos) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError('El cuerpo del producto no es válido', 400);
  }

  const nombre =
    typeof datos.nombre === 'string' ? datos.nombre.trim() : '';

  const descripcion = limpiarCadenaOpcional(
    datos.descripcion,
    'La descripción',
  );

  const precioCentavos = prepararImporteObligatorio(
    datos.precio,
    'El precio',
  );

  const idProveedor = prepararEnteroOpcional(
    datos.idProveedor,
    1,
    MAXIMO_ENTERO_POSITIVO,
    'El ID del proveedor no es válido',
  );

  const idTipoMascota = prepararEnteroOpcional(
    datos.idTipoMascota,
    1,
    MAXIMO_ENTERO_POSITIVO,
    'El ID del tipo de mascota no es válido',
  );

  const idCategoria = prepararEnteroOpcional(
    datos.idCategoria,
    1,
    MAXIMO_ENTERO_POSITIVO,
    'El ID de la categoría no es válido',
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

  const stockMinimo = validarEnteroEnRango(
    datos.stockMinimo,
    0,
    MAXIMO_ENTERO_POSITIVO,
    'El stock mínimo debe ser un número entero igual o mayor que cero',
  );

  return {
    nombre,
    descripcion: descripcion || null,
    // El precio se persiste a partir de los mismos centavos ya validados y
    // redondeados una sola vez, igual que en venta.service.js: evita que el
    // valor que se guarda difiera del que se validó.
    precio: (precioCentavos / 100).toFixed(2),
    stockMinimo,
    idProveedor,
    idTipoMascota,
    idCategoria,
  };
};

// Solo al crear se define el stock inicial: es un dato de alta, no un
// movimiento, así que no pasa por la operación transaccional de stock.
const prepararDatosCreacion = (datos) => {
  const comunes = prepararDatosComunes(datos);

  const stockActual = validarEnteroEnRango(
    datos.stockActual,
    0,
    MAXIMO_ENTERO_POSITIVO,
    'El stock actual debe ser un número entero igual o mayor que cero',
  );

  return { ...comunes, stockActual };
};

// La edición general de un producto no puede tocar el stock: si lo hiciera
// en silencio, un PUT con datos desactualizados podría pisar el descuento
// que una venta concurrente ya aplicó. Por eso, si el cuerpo trae
// stockActual, se rechaza explícitamente en vez de ignorarlo sin avisar.
const prepararDatosActualizacion = (datos) => {
  if (esObjetoPlano(datos) && datos.stockActual !== undefined) {
    throw new AppError(
      'El stock no se modifica por esta vía: use PATCH /api/productos/:id/stock',
      400,
    );
  }

  return prepararDatosComunes(datos);
};

// Movimiento de stock: cantidad es un delta (puede ser negativo para
// correcciones) que se suma al stock actual dentro de una transacción con
// bloqueo de fila, para que sea seguro frente a ventas y cancelaciones
// concurrentes sobre el mismo producto.
const prepararMovimientoStock = (datos) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError(
      'El cuerpo del movimiento de stock no es válido',
      400,
    );
  }

  const cantidad = validarEnteroEnRango(
    datos.cantidad,
    -MAXIMO_ENTERO_POSITIVO,
    MAXIMO_ENTERO_POSITIVO,
    'La cantidad del movimiento debe ser un número entero',
  );

  if (cantidad === 0) {
    throw new AppError(
      'La cantidad del movimiento no puede ser cero',
      400,
    );
  }

  return cantidad;
};

const comprobarRelaciones = async (
  { idProveedor, idTipoMascota, idCategoria },
  transaction,
) => {
  const [proveedor, tipoMascota, categoria] = await Promise.all([
    idProveedor
      ? Proveedor.findByPk(idProveedor, { transaction })
      : Promise.resolve(null),

    idTipoMascota
      ? TipoMascota.findByPk(idTipoMascota, { transaction })
      : Promise.resolve(null),

    idCategoria
      ? Categoria.findByPk(idCategoria, { transaction })
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

// Filtros del listado público de catálogo (query string): idCategoria e
// idTipoMascota, tal como pide el listado con filtro de la propuesta. Se
// ignoran silenciosamente si están ausentes; un valor presente pero inválido
// se rechaza (mismo criterio que el resto de los IDs de la API).
const prepararFiltrosListado = (query) => {
  const where = {};

  const idCategoria = prepararEnteroOpcional(
    query?.idCategoria,
    1,
    MAXIMO_ENTERO_POSITIVO,
    'El ID de categoría del filtro no es válido',
  );

  if (idCategoria !== null) {
    where.idCategoria = idCategoria;
  }

  const idTipoMascota = prepararEnteroOpcional(
    query?.idTipoMascota,
    1,
    MAXIMO_ENTERO_POSITIVO,
    'El ID de tipo de mascota del filtro no es válido',
  );

  if (idTipoMascota !== null) {
    where.idTipoMascota = idTipoMascota;
  }

  return where;
};

const obtenerProductos = async (filtros) => {
  return Producto.findAll({
    where: prepararFiltrosListado(filtros),
    include: relaciones,
    order: [['nombre', 'ASC']],
  });
};

// Alcance adicional voluntario: productos con stock por debajo del mínimo
// definido. Endpoint separado (no un filtro más del listado público) porque
// es información operativa para reponer stock, no para mostrarle al cliente.
const obtenerProductosConStockBajo = async () => {
  return Producto.findAll({
    where: {
      stockActual: {
        [Op.lt]: sequelize.col('stockMinimo'),
      },
    },
    include: relaciones,
    order: [['stockActual', 'ASC']],
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

// Corrección de una revisión posterior: producto e imagen se crean,
// actualizan y borran dentro de la MISMA transacción (antes cada paso se
// ejecutaba por su cuenta). Se reprodujo con persistencia simulada el caso
// que motivó esto: al borrar, ImagenProducto.destroy tenía éxito y
// producto.destroy fallaba después (relación con ventas) — el producto
// quedaba vivo pero sin imagen, una mezcla que nunca debería poder
// observarse. Con todo dentro de sequelize.transaction, cualquier paso que
// falle revierte también los que ya habían tenido éxito (ver
// test/productoImagenAtomico.test.js).
const crearProducto = async (datos) => {
  const datosPreparados = prepararDatosCreacion(datos);
  // Se valida antes de abrir la transacción (igual criterio que el resto
  // de las preparaciones): si la URL es inválida, ni siquiera se intenta
  // crear el producto.
  const urlImagen = prepararUrlImagen(datos?.urlImagen);

  const idProducto = await sequelize.transaction(async (transaction) => {
    await comprobarRelaciones(datosPreparados, transaction);

    const producto = await Producto.create(datosPreparados, { transaction });

    if (urlImagen) {
      await ImagenProducto.create(
        { idProducto: producto.idProducto, url: urlImagen },
        { transaction },
      );
    }

    return producto.idProducto;
  });

  return obtenerProductoPorId(idProducto);
};

const actualizarProducto = async (id, datos) => {
  const idProducto = validarId(id);
  const datosPreparados = prepararDatosActualizacion(datos);
  const urlImagen = prepararUrlImagen(datos?.urlImagen);

  await sequelize.transaction(async (transaction) => {
    const producto = await Producto.findByPk(idProducto, { transaction });

    if (!producto) {
      throw new AppError('Producto no encontrado', 404);
    }

    await comprobarRelaciones(datosPreparados, transaction);
    await producto.update(datosPreparados, { transaction });
    await sincronizarImagenProducto(idProducto, urlImagen, transaction);
  });

  return obtenerProductoPorId(idProducto);
};

const eliminarProducto = async (id) => {
  const idProducto = validarId(id);

  await sequelize.transaction(async (transaction) => {
    const producto = await Producto.findByPk(idProducto, { transaction });

    if (!producto) {
      throw new AppError('Producto no encontrado', 404);
    }

    // La FK de imagenproducto -> producto queda ON DELETE NO ACTION (mismo
    // comportamiento ya documentado para direccionentrega -> venta, ver
    // docs/backend-base-de-datos.md): sin este borrado explícito antes,
    // eliminar un producto con imagen cargada fallaría con un error de
    // restricción de clave foránea en vez de un mensaje de dominio. A
    // diferencia del historial de ventas (detalleventa, que si existe hace
    // fallar producto.destroy() y por lo tanto toda la transacción), la
    // imagen no es un dato de negocio que deba bloquear el borrado.
    await ImagenProducto.destroy({ where: { idProducto }, transaction });
    await producto.destroy({ transaction });
  });
};

// Único camino habilitado para cambiar el stock de un producto ya existente.
// Bloquea la fila del producto (mismo mecanismo que usan registrarVenta y
// cancelarVenta) para que un movimiento manual y una venta concurrentes
// sobre el mismo producto se serialicen en vez de perder una de las dos
// actualizaciones.
const ajustarStockProducto = async (id, datos) => {
  const idProducto = validarId(id);
  const cantidad = prepararMovimientoStock(datos);

  await sequelize.transaction(async (transaction) => {
    const producto = await Producto.findByPk(idProducto, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!producto) {
      throw new AppError('Producto no encontrado', 404);
    }

    const nuevoStock = producto.stockActual + cantidad;

    if (
      !Number.isSafeInteger(nuevoStock) ||
      nuevoStock < 0 ||
      nuevoStock > MAXIMO_ENTERO_POSITIVO
    ) {
      throw new AppError(
        'El movimiento dejaría el stock en un valor inválido (negativo o fuera de rango)',
        409,
      );
    }

    await producto.update(
      {
        stockActual: nuevoStock,
      },
      {
        transaction,
      },
    );
  });

  return obtenerProductoPorId(idProducto);
};

export {
  obtenerProductos,
  obtenerProductosConStockBajo,
  obtenerProductoPorId,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  ajustarStockProducto,
};
