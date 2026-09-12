import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import CategoryItem from '../components/CategoryItem.jsx';
import { EstadoCarga, EstadoError } from '../components/EstadosSolicitud.jsx';
import useCargaDatos from '../hooks/useCargaDatos.js';
import productosApi from '../api/productos.api.js';
import categoriasApi from '../api/categorias.api.js';
import './Home.css';

const pedirInicio = () =>
  Promise.all([productosApi.listar(), categoriasApi.listar()]).then(([productos, categorias]) => ({
    productos: productos.slice(0, 4),
    categorias,
  }));

// Misma estructura que el boceto de InicioFront (hero + categorías rápidas +
// destacados), ahora con datos reales del backend en vez de hardcodeados.
const Home = () => {
  const { datos, cargando, error, recargar } = useCargaDatos(useCallback(() => pedirInicio(), []));

  return (
    <div className="home">
      <section className="home__hero">
        <div className="contenedor">
          <h1>Todo lo que tu mejor amigo necesita</h1>
          <p>Alimento, juguetes e higiene para perros y gatos, con envío a todo el país.</p>
          <Link to="/catalogo" className="boton boton-primario">
            Ver catálogo
          </Link>
        </div>
      </section>

      <section className="home__seccion contenedor">
        <h2>Comprar por categoría</h2>
        <div className="home__categorias">
          {(datos?.categorias || []).map((categoria) => (
            <Link key={categoria.idCategoria} to={`/catalogo?idCategoria=${categoria.idCategoria}`}>
              <CategoryItem etiqueta={categoria.nombre} />
            </Link>
          ))}
        </div>
      </section>

      <section className="home__seccion contenedor">
        <h2>Productos destacados</h2>

        {cargando && <EstadoCarga mensaje="Cargando productos destacados…" />}
        {error && <EstadoError mensaje={error} onReintentar={recargar} />}

        {!cargando && !error && (
          <div className="home__grilla">
            {(datos?.productos || []).map((producto) => (
              <ProductCard key={producto.idProducto} producto={producto} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;
