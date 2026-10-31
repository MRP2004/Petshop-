import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import { EstadoCarga, EstadoError } from '../components/EstadosSolicitud.jsx';
import useCargaDatos from '../hooks/useCargaDatos.js';
import productosApi from '../api/productos.api.js';
import categoriasApi from '../api/categorias.api.js';
import tiposMascotaApi from '../api/tiposMascota.api.js';
import './Home.css';

// Los productos de prueba no aparecen entre los destacados de la portada.
const esPublicable = (producto) => !/prueba/i.test(producto.nombre);

const iconosMascota = {
  Perro: '🐶', Gato: '🐱', Ave: '🐦', 'Pequeños mamíferos': '🐹',
  Pez: '🐠', Reptil: '🐢',
};

const pedirInicio = () =>
  Promise.all([
    productosApi.buscarCatalogo({ pagina: 1 }),
    categoriasApi.listar(),
    tiposMascotaApi.jerarquia(),
  ]).then(
    ([resultado, categorias, mascotas]) => {
      const publicables = resultado.productos.filter(esPublicable);

      return {
        productos: publicables.slice(0, 4),
        categorias,
        mascotas,
      };
    },
  );

const Home = () => {
  const { datos, cargando, error, recargar } = useCargaDatos(
    useCallback(() => pedirInicio(), []),
  );

  return (
    <div className="home">
      <section className="home__hero">
        <div className="contenedor home__hero-fila">
          <div className="home__hero-texto">
            <p className="home__hero-etiqueta">
              Retirá en sucursal o recibí en tu domicilio
            </p>

            <h1>Todo lo que tu mascota necesita, en un solo lugar</h1>

            <p className="home__hero-descripcion">
              Alimento, higiene y accesorios para tus mascotas, con stock real
              y precios en pesos argentinos.
            </p>

            <div className="home__hero-acciones">
              <Link to="/catalogo" className="boton boton-primario">
                Ver catálogo
              </Link>
            </div>
          </div>

          <div className="home__hero-visual">
            <img
              className="home__hero-foto"
              src="/hero-mascotas.png"
              alt="Perro con camiseta número 10 junto a un gato"
            />
          </div>
        </div>
      </section>

      <section className="home__seccion contenedor">
        <h2>Comprá por mascota</h2>

        <div className="home__mascotas">
          {(datos?.mascotas || []).map((mascota) => (
            <Link
              key={mascota.idTipoMascota}
              to={`/catalogo?mascota=${mascota.idTipoMascota}`}
              className="home__mascota-tile"
            >
              <span aria-hidden="true">{iconosMascota[mascota.nombre] || '🐾'}</span> {mascota.nombre}
            </Link>
          ))}
        </div>

        {(datos?.categorias?.length || 0) > 0 && (
          <div className="home__categorias">
            {datos.categorias.map((categoria) => (
              <Link
                key={categoria.idCategoria}
                to={`/catalogo?idCategoria=${categoria.idCategoria}`}
                className="home__categoria-pildora"
              >
                {categoria.nombre}
              </Link>
            ))}
          </div>
        )}
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