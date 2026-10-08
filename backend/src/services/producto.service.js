import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import Producto from '../models/producto.model.js';
import Categoria from '../models/categoria.model.js';
import TipoMascota from '../models/tipoMascota.model.js';
import Proveedor from '../models/proveedor.model.js';
import ImagenProducto from '../models/imagenProducto.model.js';
import Favorito from '../models/favorito.model.js';
import Tienda from '../models/tienda.model.js';
import JerarquiaMascota from '../models/jerarquiaMascota.model.js';
import FacetaProducto from '../models/facetaProducto.model.js';
import AppError from '../errors/AppError.js';
import { prepararFiltrosCatalogo } from '../utils/filtrosCatalogo.js';
import {
  MAXIMO_ENTERO_POSITIVO,
  esObjetoPlano,
  validarEnteroEnRango,
  prepararEnteroOpcional,
  prepararImporteObligatorio,
  limpiarCadenaOpcional,
} from '../utils/validacion.js';
import { esVendedorIndependiente } from '../utils/roles.js';

// Ronda 2, Etapa 8 (marketplace): solo `idTienda`/`nombre` — NUNCA
// `numeroDocumento`/`razonSocial` (el CUIL/CUIT del vendedor no es un dato
// que el catálogo público deba exponer, aunque el resto de la fila
// `tienda` no sea secreto). El catálogo muestra "Vendido por: <nombre>"
// con esto, nada más.
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
  {
    model: Tienda,
    as: 'tienda',
    required: false,
    // `estado` se incluye para poder filtrar tiendas suspendidas (ver
    // SOLO_TIENDAS_NO_SUSPENDIDAS/obtenerProductoPorId más abajo) — no es
    // un dato sensible, a diferencia de numeroDocumento/razonSocial.
    attributes: ['idTienda', 'nombre', 'estado'],
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

  // Imágenes locales del catálogo de demostración: misma ruta en cualquier
  // host de Vite, incluido un puerto compartido. No se aceptan rutas
  // arbitrarias ni esquemas como javascript:.
  if (!/^https?:\/\/.+/i.test(url) && !/^\/demo-productos\/[a-z0-9-]+\.svg$/.test(url)) {
    throw new AppError(
      'La URL de la imagen debe usar http(s) o una imagen local de demostración',
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

// Ronda 2, Etapa 8: un producto de una tienda SUSPENDIDA no debe aparecer
// en el catálogo público — si no, "suspendida" sería un campo decorativo
// (hallazgo real de la revisión de Codex del diseño de esta etapa). Los
// productos de PetShop (idTienda NULL) nunca se ven afectados por esto:
// `$tienda.estado$` solo se evalúa quando existe una fila de tienda
// relacionada (LEFT JOIN vía `required:false` en `relaciones`).
const SOLO_TIENDAS_NO_SUSPENDIDAS = {
  [Op.or]: [{ idTienda: null }, { '$tienda.estado$': 'activa' }],
};

const obtenerProductos = async (filtros) => {
  return Producto.findAll({
    where: { [Op.and]: [prepararFiltrosListado(filtros), SOLO_TIENDAS_NO_SUSPENDIDAS] },
    include: relaciones,
    order: [['nombre', 'ASC']],
  });
};

// Endpoint paginado para el catálogo público. El listado histórico conserva
// su contrato de arreglo para los paneles y recorridos existentes.
const obtenerCatalogo = async (query) => {
  const filtros = prepararFiltrosCatalogo(query);
  const where = {};
  if (filtros.idCategoria !== null) where.idCategoria = filtros.idCategoria;

  if (filtros.idTipoMascota !== null) {
    const hijos = await JerarquiaMascota.findAll({
      where: { idTipoPadre: filtros.idTipoMascota },
      attributes: ['idTipoHijo'],
    });
    const ids = hijos.map((fila) => fila.idTipoHijo);
    if (filtros.idSubtipoMascota !== null) {
      if (!ids.includes(filtros.idSubtipoMascota)) {
        throw new AppError('El subtipo no pertenece al tipo de mascota elegido', 400);
      }
      where.idTipoMascota = filtros.idSubtipoMascota;
    } else {
      where.idTipoMascota = { [Op.in]: [filtros.idTipoMascota, ...ids] };
    }
  } else if (filtros.idSubtipoMascota !== null) {
    throw new AppError('Elegí primero un tipo de mascota', 400);
  }

  if (filtros.precioMin !== null || filtros.precioMax !== null) {
    where.precio = {};
    if (filtros.precioMin !== null) where.precio[Op.gte] = (filtros.precioMin / 100).toFixed(2);
    if (filtros.precioMax !== null) where.precio[Op.lte] = (filtros.precioMax / 100).toFixed(2);
  }
  if (filtros.disponibles) where.stockActual = { [Op.gt]: 0 };

  // findAndCountAll omite los LEFT JOIN no obligatorios al contar. Resolver
  // la visibilidad por IDs evita referenciar el alias tienda en COUNT y
  // mantiene la suspensión efectiva también en páginas posteriores.
  const tiendasActivas = await Tienda.findAll({
    where: { estado: 'activa' }, attributes: ['idTienda'], raw: true,
  });
  const condiciones = [where, {
    [Op.or]: [
      { idTienda: null },
      { idTienda: { [Op.in]: tiendasActivas.map((tienda) => tienda.idTienda) } },
    ],
  }];
  if (filtros.buscar) {
    condiciones.push(sequelize.where(
      sequelize.fn('LOWER', sequelize.col('Producto.nombre')),
      { [Op.like]: `%${escaparComodinesLike(filtros.buscar.toLowerCase())}%` },
    ));
  }
  const filtrarFacetas = Object.keys(filtros.facetas).length > 0;
  const ordenes = {
    nombre: [['nombre', 'ASC'], ['idProducto', 'ASC']],
    'precio-asc': [['precio', 'ASC'], ['idProducto', 'ASC']],
    'precio-desc': [['precio', 'DESC'], ['idProducto', 'ASC']],
    nuevos: [['idProducto', 'DESC']],
  };
  const { rows, count } = await Producto.findAndCountAll({
    where: { [Op.and]: condiciones },
    include: [
      ...relaciones,
      ...(filtrarFacetas
        ? [{ model: FacetaProducto, as: 'facetas', required: true, where: filtros.facetas, attributes: [] }]
        : []),
    ],
    distinct: true,
    // Todas las relaciones incluidas son 1:1.
    subQuery: false,
    order: ordenes[filtros.orden],
    limit: filtros.limite,
    offset: (filtros.pagina - 1) * filtros.limite,
  });

  return {
    productos: rows,
    total: count,
    pagina: filtros.pagina,
    totalPaginas: Math.ceil(count / filtros.limite),
    porPagina: filtros.limite,
  };
};

const obtenerMarcasCatalogo = async () => {
  const tiendasActivas = await Tienda.findAll({
    where: { estado: 'activa' }, attributes: ['idTienda'], raw: true,
  });
  const facetas = await FacetaProducto.findAll({
    attributes: ['marca'],
    include: [{
      model: Producto, as: 'producto', attributes: [], required: true,
      where: { [Op.or]: [
        { idTienda: null },
        { idTienda: { [Op.in]: tiendasActivas.map((tienda) => tienda.idTienda) } },
      ] },
    }],
    where: { marca: { [Op.ne]: null } },
    group: ['FacetaProducto.marca'],
    order: [['marca', 'ASC']],
    raw: true,
  });
  return facetas.map((fila) => fila.marca);
};

// Buscador predictivo del encabezado (ronda 2, ver docs/frontend-diseno.md):
// endpoint público y liviano, separado del listado general (que sigue sin
// tocarse: lo usa el filtrado del catálogo que trabajan los compañeros).
// Límite de longitud generoso pero acotado (evita una consulta LIKE sobre
// una cadena arbitrariamente larga); término vacío o ausente devuelve []
// en vez de un error 400, porque el frontend llama a esto en cada tecla —
// incluido el momento en que el campo queda vacío al borrar todo.
const LONGITUD_MAXIMA_BUSQUEDA = 80;
const LIMITE_SUGERENCIAS = 6;

const prepararTerminoBusqueda = (valorCrudo) => {
  if (valorCrudo === undefined || valorCrudo === null || valorCrudo === '') {
    return null;
  }

  if (typeof valorCrudo !== 'string') {
    throw new AppError('El término de búsqueda no es válido', 400);
  }

  const termino = valorCrudo.trim().slice(0, LONGITUD_MAXIMA_BUSQUEDA);

  return termino || null;
};

// `%` y `_` son comodines propios de LIKE (no de este endpoint): sin
// escaparlos, buscar literalmente "50%" coincidía con cualquier nombre que
// tuviera un "50" seguido de cualquier cosa, y buscar solo "%" o "_"
// devolvía prácticamente cualquier producto (hallazgo real de la revisión
// de Codex de esta etapa). MySQL usa "\" como carácter de escape de LIKE
// por defecto, así que también hay que escapar un "\" literal primero (si
// no, un "\" del usuario terminaría escapando el carácter que sigue).
const escaparComodinesLike = (texto) => texto.replace(/[\\%_]/g, '\\$&');

// "Alimento de prueba" (y cualquier producto de prueba equivalente) no debe
// ofrecerse como sugerencia: mismo criterio de publicabilidad que ya usa
// Home.jsx para "Productos destacados" (dato de desarrollo, no de catálogo
// real de cara al cliente). Se filtra con LOWER() en ambos lados para no
// depender de que la collation de la columna sea case-insensitive. Es una
// regla amplia a propósito: cualquier producto real que también tuviera
// "prueba" en el nombre quedaría oculto de las sugerencias — mismo
// trade-off ya aceptado en Home.jsx.
const obtenerSugerenciasBusqueda = async (query) => {
  const termino = prepararTerminoBusqueda(query?.q);

  if (!termino) {
    return [];
  }

  const terminoNormalizado = escaparComodinesLike(termino.toLowerCase());

  return Producto.findAll({
    where: {
      [Op.and]: [
        // Calificado como "Producto.nombre" (no un "nombre" a secas): al
        // sumar el JOIN con `tienda` para el filtro de suspendidas (más
        // abajo), un "nombre" ambiguo dejó de resolver solo — `tienda`
        // también tiene su propia columna `nombre`, y MySQL rechazaba la
        // consulta entera con "Column 'nombre' in where clause is
        // ambiguous" (hallazgo real al correr la prueba de integración de
        // este mismo hallazgo de Codex).
        sequelize.where(sequelize.fn('LOWER', sequelize.col('Producto.nombre')), {
          [Op.like]: `%${terminoNormalizado}%`,
        }),
        sequelize.where(sequelize.fn('LOWER', sequelize.col('Producto.nombre')), {
          [Op.notLike]: '%prueba%',
        }),
        // Hallazgo real de Codex (revisión de la implementación, Etapa 8):
        // el buscador predictivo es TAMBIÉN una vía pública de catálogo —
        // sin este filtro, un producto de una tienda suspendida seguía
        // apareciendo acá aunque ya estuviera oculto del listado y del
        // detalle.
        SOLO_TIENDAS_NO_SUSPENDIDAS,
      ],
    },
    attributes: ['idProducto', 'nombre', 'precio'],
    include: [
      { model: ImagenProducto, as: 'imagen', required: false, attributes: ['url'] },
      { model: Tienda, as: 'tienda', required: false, attributes: [] },
    ],
    order: [['nombre', 'ASC']],
    limit: LIMITE_SUGERENCIAS,
  });
};

// Alcance adicional voluntario: productos con stock por debajo del mínimo
// definido. Endpoint separado (no un filtro más del listado público) porque
// es información operativa para reponer stock, no para mostrarle al cliente.
// Ronda 2, Etapa 8: un vendedor independiente ve SOLO el stock bajo de su
// propia tienda (nunca el de PetShop ni el de otras tiendas); el personal
// interno sigue viendo todo, sin cambios.
const obtenerProductosConStockBajo = async (usuario) => {
  const where = {
    stockActual: {
      [Op.lt]: sequelize.col('stockMinimo'),
    },
  };

  if (esVendedorIndependiente(usuario?.rol)) {
    where.idTienda = usuario.idTienda;
  }

  return Producto.findAll({
    where,
    include: relaciones,
    order: [['stockActual', 'ASC']],
  });
};

// `ocultarSiTiendaSuspendida` solo lo pasa en `true` el controlador de la
// ruta PÚBLICA (ver producto.controller.js#buscarPorId): un producto de una
// tienda suspendida no debe poder verse en el catálogo ni por link directo
// (mismo criterio que el listado, ver SOLO_TIENDAS_NO_SUSPENDIDAS más
// arriba). Los usos INTERNOS de esta función (releer un producto recién
// creado/editado, favoritos, etc.) siguen sin este filtro — no tendría
// sentido ocultarle a un vendedor independiente su propio producto recién
// guardado solo porque, en teoría, alguien suspendió su tienda a mitad de
// la operación.
const obtenerProductoPorId = async (id, { ocultarSiTiendaSuspendida = false } = {}) => {
  const idProducto = validarId(id);

  const producto = await Producto.findByPk(idProducto, {
    include: relaciones,
  });

  if (!producto) {
    throw new AppError('Producto no encontrado', 404);
  }

  if (ocultarSiTiendaSuspendida && producto.idTienda && producto.tienda?.estado !== 'activa') {
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
// Ronda 2, Etapa 8: si quien crea/edita/borra/ajusta stock es un vendedor
// independiente, se resuelve y valida SU PROPIA tienda dentro de la MISMA
// transacción (nunca se confía en `usuario.idTienda` del JWT sin
// releerla: la tienda pudo suspenderse después de emitido el token, dentro
// de sus 8h de vigencia). El personal interno (`vendedor`/`administrador`)
// no pasa por ninguno de estos chequeos, igual que hoy.
// Con bloqueo de fila (hallazgo real de Codex, revisión de la
// implementación): sin esto, un vendedor podía leer 'activa', un
// administrador suspender la tienda en el medio, y la escritura del
// vendedor terminar igual después de la suspensión — "una tienda
// suspendida no puede escribir" quedaba débil ante esa carrera.
// `cambiarEstadoTienda` (tienda.service.js) toma el MISMO bloqueo antes de
// cambiar el estado, así las dos operaciones se serializan sobre esta fila
// en vez de competir.
const resolverTiendaPropiaActiva = async (usuario, transaction) => {
  const tienda = await Tienda.findByPk(usuario.idTienda, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!tienda) {
    // No debería pasar en la práctica (el JWT solo lleva idTienda si
    // realmente existe una Tienda para ese usuario), pero no se asume: se
    // rechaza explícitamente en vez de continuar con un idTienda inválido.
    throw new AppError('No se encontró la tienda asociada a esta cuenta', 403);
  }

  if (tienda.estado !== 'activa') {
    throw new AppError('Tu tienda está suspendida: no podés modificar productos mientras tanto', 403);
  }

  return tienda;
};

// Rechaza si el producto YA EXISTENTE no pertenece a la tienda del
// vendedor independiente que lo está editando/borrando/ajustando — nunca
// un producto de PetShop (idTienda NULL) ni de OTRA tienda. El personal
// interno no pasa por este chequeo (sin restricción, como siempre).
const verificarPropietarioProducto = (producto, usuario) => {
  if (esVendedorIndependiente(usuario?.rol) && producto.idTienda !== usuario.idTienda) {
    throw new AppError('No tiene permisos sobre este producto', 403);
  }
};

const crearProducto = async (datos, usuario) => {
  const datosPreparados = prepararDatosCreacion(datos);
  // Se valida antes de abrir la transacción (igual criterio que el resto
  // de las preparaciones): si la URL es inválida, ni siquiera se intenta
  // crear el producto.
  const urlImagen = prepararUrlImagen(datos?.urlImagen);

  // idProveedor es un distribuidor INTERNO de PetShop (hallazgo real de
  // Codex, revisión de la implementación): un vendedor independiente no
  // tiene ninguno propio, y dejarlo mandar un idProveedor real mezclaría
  // su producto marketplace con los filtros internos de "ventas por
  // proveedor" (venta.service.js#obtenerIdsVentaPorProveedor) como si
  // fuera mercadería de ese distribuidor. Se descarta ANTES de validar la
  // relación (ni siquiera se consulta si ese proveedor existe).
  if (esVendedorIndependiente(usuario?.rol)) {
    datosPreparados.idProveedor = null;
  }

  const idProducto = await sequelize.transaction(async (transaction) => {
    await comprobarRelaciones(datosPreparados, transaction);

    // idTienda NUNCA se lee del cuerpo (mismo criterio que idCliente en
    // checkout): un vendedor independiente crea siempre en SU tienda, sin
    // excepción; el personal interno crea siempre para PetShop (NULL).
    let idTienda = null;
    if (esVendedorIndependiente(usuario?.rol)) {
      await resolverTiendaPropiaActiva(usuario, transaction);
      idTienda = usuario.idTienda;
    }

    const producto = await Producto.create(
      { ...datosPreparados, idTienda },
      { transaction },
    );

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

const actualizarProducto = async (id, datos, usuario) => {
  const idProducto = validarId(id);
  const datosPreparados = prepararDatosActualizacion(datos);
  const urlImagen = prepararUrlImagen(datos?.urlImagen);

  // Mismo motivo que en crearProducto (hallazgo real de Codex): un
  // vendedor independiente nunca queda con un idProveedor real, ni
  // siquiera al editar.
  if (esVendedorIndependiente(usuario?.rol)) {
    datosPreparados.idProveedor = null;
  }

  await sequelize.transaction(async (transaction) => {
    // Con bloqueo ANTES de la tienda (Etapa 9, revisión de diseño de Codex):
    // orden global producto → tienda, el mismo que ajustarStockProducto y
    // que una compra (disponibilidadTienda.js). Sin este lock, el orden
    // efectivo era tienda → producto y podía cruzarse con una compra.
    const producto = await Producto.findByPk(idProducto, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!producto) {
      throw new AppError('Producto no encontrado', 404);
    }

    verificarPropietarioProducto(producto, usuario);
    if (esVendedorIndependiente(usuario?.rol)) {
      await resolverTiendaPropiaActiva(usuario, transaction);
    }

    await comprobarRelaciones(datosPreparados, transaction);
    await producto.update(datosPreparados, { transaction });
    await sincronizarImagenProducto(idProducto, urlImagen, transaction);
  });

  return obtenerProductoPorId(idProducto);
};

const eliminarProducto = async (id, usuario) => {
  const idProducto = validarId(id);

  await sequelize.transaction(async (transaction) => {
    // Mismo orden producto → tienda que actualizarProducto (ver arriba).
    const producto = await Producto.findByPk(idProducto, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!producto) {
      throw new AppError('Producto no encontrado', 404);
    }

    verificarPropietarioProducto(producto, usuario);
    if (esVendedorIndependiente(usuario?.rol)) {
      await resolverTiendaPropiaActiva(usuario, transaction);
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
    await FacetaProducto.destroy({ where: { idProducto }, transaction });
    // Mismo motivo que ImagenProducto (hallazgo real de Codex, ronda 2,
    // Etapa 5): que un cliente haya marcado el producto como favorito no es
    // un dato de negocio que deba bloquear su borrado (a diferencia de
    // detalleventa, el historial real de ventas) — sin este borrado
    // explícito, eliminar un producto con favoritos fallaría con un error
    // de restricción de clave foránea en vez de completarse.
    await Favorito.destroy({ where: { idProducto }, transaction });
    await producto.destroy({ transaction });
  });
};

// Único camino habilitado para cambiar el stock de un producto ya existente.
// Bloquea la fila del producto (mismo mecanismo que usan registrarVenta y
// cancelarVenta) para que un movimiento manual y una venta concurrentes
// sobre el mismo producto se serialicen en vez de perder una de las dos
// actualizaciones.
const ajustarStockProducto = async (id, datos, usuario) => {
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

    verificarPropietarioProducto(producto, usuario);
    if (esVendedorIndependiente(usuario?.rol)) {
      await resolverTiendaPropiaActiva(usuario, transaction);
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
  // Exportada para que favorito.service.js pueda mostrar el producto
  // completo (imagen incluida) al listar favoritos, con exactamente el
  // mismo shape que el resto del catálogo — sin duplicar este arreglo.
  relaciones,
  obtenerProductos,
  obtenerCatalogo,
  obtenerMarcasCatalogo,
  obtenerSugerenciasBusqueda,
  obtenerProductosConStockBajo,
  obtenerProductoPorId,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  ajustarStockProducto,
};
