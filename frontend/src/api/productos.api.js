import { solicitar } from './httpClient.js';
import crearServicioCrud from './crudGenerico.js';

const base = crearServicioCrud('/productos');

// Filtros del catálogo (listado + filtro de la propuesta): por categoría y/o
// tipo de mascota. Query armada acá, no en cada pantalla que filtra.
const listarFiltrado = ({ idCategoria, idTipoMascota } = {}) => {
  const parametros = new URLSearchParams();
  if (idCategoria) parametros.set('idCategoria', idCategoria);
  if (idTipoMascota) parametros.set('idTipoMascota', idTipoMascota);
  const query = parametros.toString();
  return base.listar(query ? `?${query}` : '');
};

const buscarCatalogo = (filtros = {}) => {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') parametros.set(clave, valor);
  }
  return solicitar(`/productos/catalogo?${parametros.toString()}`);
};

const listarMarcas = () => solicitar('/productos/marcas');

const listarStockBajo = () => solicitar('/productos/stock-bajo');

const ajustarStock = (id, cantidad) =>
  solicitar(`/productos/${id}/stock`, { metodo: 'PATCH', cuerpo: { cantidad } });

// Buscador predictivo del encabezado (ronda 2): endpoint público y liviano,
// separado del listado general (ver producto.routes.js).
const sugerencias = (termino) => solicitar(`/productos/sugerencias?q=${encodeURIComponent(termino)}`);

export default {
  ...base,
  listarFiltrado,
  buscarCatalogo,
  listarMarcas,
  listarStockBajo,
  ajustarStock,
  sugerencias,
};
