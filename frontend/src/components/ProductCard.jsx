import { Link } from 'react-router-dom';
import { useCarrito } from '../hooks/useCarrito.js';
import ImagenProducto from './ImagenProducto.jsx';
import './ProductCard.css';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

// Reescrita a partir del boceto de InicioFront: mismo layout de tarjeta,
// ahora con datos reales del backend (nombre, precio, disponibilidad) y
// conectada al carrito en vez de un botón decorativo.
const ProductCard = ({ producto }) => {
  const { agregarProducto } = useCarrito();
  const sinStock = producto.stockActual <= 0;

  const manejarAgregar = (evento) => {
    evento.preventDefault();
    agregarProducto(producto, 1);
  };

  return (
    <Link to={`/productos/${producto.idProducto}`} className="product-card">
      <ImagenProducto
        producto={producto}
        claseContenedor="product-card__imagen"
        claseImagen="product-card__imagen-real"
      />

      <h3 className="product-card__nombre">{producto.nombre}</h3>
      <p className="product-card__precio">{formateador.format(Number(producto.precio))}</p>
      <p className={`product-card__stock ${sinStock ? 'product-card__stock--agotado' : ''}`}>
        {sinStock ? 'Sin stock' : `Disponible (${producto.stockActual})`}
      </p>

      <button
        type="button"
        className="boton boton-primario product-card__boton"
        onClick={manejarAgregar}
        disabled={sinStock}
      >
        Agregar al carrito 🛒
      </button>
    </Link>
  );
};

export default ProductCard;
