import { Link } from 'react-router-dom';
import { useCarrito } from '../hooks/useCarrito.js';
import ImagenProducto from './ImagenProducto.jsx';
import BotonFavorito from './BotonFavorito.jsx';
import './ProductCard.css';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

// Reescrita a partir del boceto de InicioFront: mismo layout de tarjeta,
// ahora con datos reales del backend (nombre, precio, disponibilidad) y
// conectada al carrito en vez de un botón decorativo.
//
// "Poco stock" (ronda 1 de rediseño visual) reutiliza stockMinimo, un campo
// que el backend ya devuelve en el listado público (no es un dato nuevo ni
// inventado del lado del frontend): el mismo umbral que el personal usa para
// reponer (ver producto.service.js#obtenerProductosConStockBajo) le sirve al
// comprador para saber que le queda poco tiempo para decidirse.
//
// La tarjeta ya NO es un único <Link> que envuelve botones interactivos
// (hallazgo real de Codex, ronda 2, Etapa 5: un botón dentro de un enlace es
// HTML inválido — controles interactivos anidados, problemático para
// lectores de pantalla y navegación por teclado). El contenedor es un
// <article>; el <Link> envuelve solo la parte navegable (imagen, nombre,
// precio, stock); "Agregar al carrito" y el favorito quedan como hermanos
// del enlace, no anidados adentro.
const ProductCard = ({ producto }) => {
  const { agregarProducto } = useCarrito();
  const sinStock = producto.stockActual <= 0;
  const pocoStock = !sinStock && producto.stockMinimo != null && producto.stockActual <= producto.stockMinimo;

  const manejarAgregar = () => {
    agregarProducto(producto, 1);
  };

  return (
    <article className="product-card">
      <Link to={`/productos/${producto.idProducto}`} className="product-card__enlace">
        <div className="product-card__imagen-envoltorio">
          <ImagenProducto
            producto={producto}
            claseContenedor="product-card__imagen"
            claseImagen="product-card__imagen-real"
          />
          {pocoStock && <span className="product-card__chip product-card__chip--poco-stock">Poco stock</span>}
        </div>

        <h3 className="product-card__nombre">{producto.nombre}</h3>
        <p className="product-card__precio">{formateador.format(Number(producto.precio))}</p>
        <p className={`product-card__stock ${sinStock ? 'product-card__stock--agotado' : ''}`}>
          {sinStock ? 'Sin stock' : `Disponible (${producto.stockActual})`}
        </p>
        {producto.tienda && (
          <p className="product-card__vendedor">Vendido por: {producto.tienda.nombre}</p>
        )}
      </Link>

      <div className="product-card__favorito">
        <BotonFavorito producto={producto} />
      </div>

      <button
        type="button"
        className="boton boton-primario product-card__boton"
        onClick={manejarAgregar}
        disabled={sinStock}
      >
        Agregar al carrito 🛒
      </button>
    </article>
  );
};

export default ProductCard;
