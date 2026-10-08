import AppError from '../errors/AppError.js';
import {
  MAXIMO_ENTERO_POSITIVO,
  prepararEnteroOpcional,
  prepararImporteOpcional,
  validarEnteroEnRango,
} from './validacion.js';

const PRODUCTOS_POR_PAGINA = 24;
const ORDENES = new Set(['nombre', 'precio-asc', 'precio-desc', 'nuevos']);
const FACETAS = {
  etapaVida: ['cachorro', 'gatito', 'adulto', 'senior'],
  tamano: ['pequeno', 'mediano', 'grande'],
  condicion: ['interior', 'esterilizado', 'activo'],
  formato: ['seco', 'humedo', 'snack', 'semillas', 'pellets'],
  tipoAgua: ['fria', 'tropical', 'marina'],
  tipoArena: ['aglomerante', 'silice', 'ecologica'],
};

const prepararFiltrosCatalogo = (query = {}) => {
  const pagina = query.pagina === undefined
    ? 1
    : validarEnteroEnRango(query.pagina, 1, 10000, 'La página no es válida');
  const idCategoria = prepararEnteroOpcional(
    query.idCategoria, 1, MAXIMO_ENTERO_POSITIVO, 'La categoría no es válida',
  );
  const idTipoMascota = prepararEnteroOpcional(
    query.idTipoMascota, 1, MAXIMO_ENTERO_POSITIVO, 'El tipo de mascota no es válido',
  );
  const idSubtipoMascota = prepararEnteroOpcional(
    query.idSubtipoMascota, 1, MAXIMO_ENTERO_POSITIVO, 'El subtipo no es válido',
  );

  const buscar = query.buscar === undefined ? '' : query.buscar;
  if (typeof buscar !== 'string' || buscar.trim().length > 80) {
    throw new AppError('La búsqueda no es válida', 400);
  }
  const precioMin = prepararImporteOpcional(query.precioMin, 'El precio mínimo');
  const precioMax = prepararImporteOpcional(query.precioMax, 'El precio máximo');
  if (precioMin !== null && precioMax !== null && precioMin > precioMax) {
    throw new AppError('El precio mínimo no puede superar el máximo', 400);
  }
  const orden = query.orden || 'nombre';
  if (typeof orden !== 'string' || !ORDENES.has(orden)) {
    throw new AppError('El orden del catálogo no es válido', 400);
  }
  const disponibles = query.disponibles === 'si';
  if (query.disponibles !== undefined && query.disponibles !== 'si') {
    throw new AppError('El filtro de disponibilidad no es válido', 400);
  }
  const facetas = {};
  if (query.marca !== undefined && query.marca !== '') {
    if (typeof query.marca !== 'string' || !/^[\p{L}\p{N} .'-]{2,50}$/u.test(query.marca)) {
      throw new AppError('La marca no es válida', 400);
    }
    facetas.marca = query.marca;
  }
  for (const [nombre, opciones] of Object.entries(FACETAS)) {
    const valor = query[nombre];
    if (valor === undefined || valor === '') continue;
    if (typeof valor !== 'string' || !opciones.includes(valor)) {
      throw new AppError(`El filtro ${nombre} no es válido`, 400);
    }
    facetas[nombre] = valor;
  }

  return {
    pagina, limite: PRODUCTOS_POR_PAGINA, idCategoria, idTipoMascota,
    idSubtipoMascota, buscar: buscar.trim(), precioMin, precioMax,
    disponibles, orden, facetas,
  };
};

export { prepararFiltrosCatalogo, PRODUCTOS_POR_PAGINA };
