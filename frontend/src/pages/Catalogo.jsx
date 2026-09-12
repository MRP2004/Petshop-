import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import CategoryItem from '../components/CategoryItem.jsx';
import { EstadoCarga, EstadoError, EstadoVacio } from '../components/EstadosSolicitud.jsx';
import useCargaDatos from '../hooks/useCargaDatos.js';
import productosApi from '../api/productos.api.js';
import categoriasApi from '../api/categorias.api.js';
import tiposMascotaApi from '../api/tiposMascota.api.js';
import './Catalogo.css';

const pedirFiltrosDisponibles = () =>
  Promise.all([categoriasApi.listar(), tiposMascotaApi.listar()]).then(([categorias, tiposMascota]) => ({
    categorias,
    tiposMascota,
  }));

// Listado de productos filtrado por categoría o tipo de mascota (requisito
// de "listado + filtro" de la propuesta), con detalle al seleccionar un
// producto (ProductCard ya enlaza a /productos/:id). La búsqueda por texto
// es del lado del cliente sobre la página ya filtrada: el backend no expone
// un endpoint de búsqueda todavía (ver docs/estado-proyecto.md).
const Catalogo = () => {
  const [parametros, setParametros] = useSearchParams();

  const idCategoria = parametros.get('idCategoria') || '';
  const textoBusqueda = parametros.get('buscar') || '';
  const mascota = parametros.get('mascota') || '';

  const { datos: filtrosDisponibles } = useCargaDatos(useCallback(() => pedirFiltrosDisponibles(), []));
  const categorias = filtrosDisponibles?.categorias || [];

  // El enlace de "Perros"/"Gatos" de la navegación manda un slug legible
  // (?mascota=perro); acá se resuelve contra el nombre real del tipo de
  // mascota ya cargado, sin necesitar que la navegación conozca los IDs.
  // Si tiposMascota todavía no cargó, esto queda '' y el filtro por
  // categoría igual se aplica; en cuanto tiposMascota carga, idTipoMascota
  // pasa a tener el valor real y dispara automáticamente un nuevo pedido de
  // productos (está en las dependencias de abajo).
  const idTipoMascota = useMemo(() => {
    const tiposMascota = filtrosDisponibles?.tiposMascota || [];
    if (!mascota) return '';
    const encontrado = tiposMascota.find((tipo) => tipo.nombre.toLowerCase() === mascota.toLowerCase());
    return encontrado ? String(encontrado.idTipoMascota) : '';
  }, [mascota, filtrosDisponibles]);

  const { datos: productos, cargando, error, recargar } = useCargaDatos(
    useCallback(
      () => productosApi.listarFiltrado({ idCategoria: idCategoria || undefined, idTipoMascota: idTipoMascota || undefined }),
      [idCategoria, idTipoMascota],
    ),
    [idCategoria, idTipoMascota],
  );

  const productosFiltrados = useMemo(() => {
    if (!productos) return [];
    if (!textoBusqueda) return productos;
    const termino = textoBusqueda.toLowerCase();
    return productos.filter((producto) => producto.nombre.toLowerCase().includes(termino));
  }, [productos, textoBusqueda]);

  const seleccionarCategoria = (id) => {
    const nuevos = new URLSearchParams(parametros);
    if (id) nuevos.set('idCategoria', id);
    else nuevos.delete('idCategoria');
    setParametros(nuevos);
  };

  return (
    <div className="pagina contenedor">
      <h1 className="titulo-pagina">Catálogo</h1>

      <div className="catalogo__filtros">
        <CategoryItem etiqueta="Todas" activo={!idCategoria} onClick={() => seleccionarCategoria('')} />
        {categorias.map((categoria) => (
          <CategoryItem
            key={categoria.idCategoria}
            etiqueta={categoria.nombre}
            activo={idCategoria === String(categoria.idCategoria)}
            onClick={() => seleccionarCategoria(categoria.idCategoria)}
          />
        ))}
      </div>

      {textoBusqueda && (
        <p className="catalogo__busqueda-activa">
          Resultados para «{textoBusqueda}»
        </p>
      )}

      {cargando && <EstadoCarga mensaje="Cargando catálogo…" />}
      {error && <EstadoError mensaje={error} onReintentar={recargar} />}

      {!cargando && !error && productosFiltrados.length === 0 && (
        <EstadoVacio mensaje="No se encontraron productos con ese filtro." />
      )}

      {!cargando && !error && productosFiltrados.length > 0 && (
        <div className="catalogo__grilla">
          {productosFiltrados.map((producto) => (
            <ProductCard key={producto.idProducto} producto={producto} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Catalogo;
