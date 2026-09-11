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

const listarStockBajo = () => solicitar('/productos/stock-bajo');

const ajustarStock = (id, cantidad) =>
  solicitar(`/productos/${id}/stock`, { metodo: 'PATCH', cuerpo: { cantidad } });

export default {
  ...base,
  listarFiltrado,
  listarStockBajo,
  ajustarStock,
};
