import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import { EstadoCarga, EstadoError, EstadoVacio } from '../components/EstadosSolicitud.jsx';
import { useFavoritos } from '../hooks/useFavoritos.js';
import '../pages/Catalogo.css';

// Listado de favoritos del cliente (ronda 2): reutiliza ProductCard (con su
// propio BotonFavorito) y la misma grilla del catálogo — no es una vista
// nueva, es el mismo listado de productos filtrado por lo que el cliente
// marcó, persistido en el backend (ver context/FavoritosContext.jsx).
const Favoritos = () => {
  const { favoritos, cargando, error } = useFavoritos();

  return (
    <div className="pagina contenedor">
      <h1 className="titulo-pagina">Mis favoritos</h1>

      {cargando && <EstadoCarga mensaje="Cargando tus favoritos…" />}
      {error && <EstadoError mensaje={error} />}

      {!cargando && !error && favoritos.length === 0 && (
        <>
          <EstadoVacio mensaje="Todavía no marcaste ningún producto como favorito." />
          <Link to="/catalogo" className="boton boton-primario">
            Ir al catálogo
          </Link>
        </>
      )}

      {!cargando && !error && favoritos.length > 0 && (
        <div className="catalogo__grilla">
          {favoritos.map((producto) => (
            <ProductCard key={producto.idProducto} producto={producto} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Favoritos;
