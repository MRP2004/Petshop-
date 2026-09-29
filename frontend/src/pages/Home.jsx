import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import ImagenProducto from '../components/ImagenProducto.jsx';
import { EstadoCarga, EstadoError } from '../components/EstadosSolicitud.jsx';
import useCargaDatos from '../hooks/useCargaDatos.js';
import productosApi from '../api/productos.api.js';
import categoriasApi from '../api/categorias.api.js';
import './Home.css';

const formateador = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
});

// Los productos de prueba no aparecen entre los destacados de la portada.
const esPublicable = (producto) => !/prueba/i.test(producto.nombre);

// Se priorizan los productos que ya tienen foto para las tarjetas del hero.
const tieneImagen = (producto) => Boolean(producto.imagen?.url);

const pedirInicio = () =>
  Promise.all([productosApi.listar(), categoriasApi.listar()]).then(
    ([productos, categorias]) => {
      const publicables = productos.filter(esPublicable);
      const conFoto = publicables.filter(tieneImagen);
      const sinFoto = publicables.filter((producto) => !tieneImagen(producto));

      return {
        productos: publicables.slice(0, 4),
        productosHero: [...conFoto, ...sinFoto].slice(0, 2),
        categorias,
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
              Alimento, higiene y juguetes para perros y gatos, con stock real
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

            {(datos?.productosHero || []).map((producto, indice) => (
              <Link
                key={producto.idProducto}
                to={`/productos/${producto.idProducto}`}
                className={`home__hero-tarjeta home__hero-tarjeta--${indice}`}
              >
                <ImagenProducto
                  producto={producto}
                  claseContenedor="home__hero-tarjeta-imagen"
                  claseImagen="home__hero-tarjeta-imagen-real"
                />

                <div>
                  <p className="home__hero-tarjeta-nombre">
                    {producto.nombre}
                  </p>
                  <p className="home__hero-tarjeta-precio">
                    {formateador.format(Number(producto.precio))}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="home__seccion contenedor">
        <h2>Comprá por mascota</h2>

        <div className="home__mascotas">
          <Link
            to="/catalogo?mascota=perro"
            className="home__mascota-tile home__mascota-tile--perro"
          >
            <span aria-hidden="true">🐶</span> Perros
          </Link>

          <Link
            to="/catalogo?mascota=gato"
            className="home__mascota-tile home__mascota-tile--gato"
          >
            <span aria-hidden="true">🐱</span> Gatos
          </Link>
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