import { Link, useNavigate } from 'react-router-dom';
import { useCarrito } from '../hooks/useCarrito.js';
import { useAuth } from '../hooks/useAuth.js';
import { EstadoVacio } from '../components/EstadosSolicitud.jsx';
import './Carrito.css';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

// El total que se muestra acá es solo informativo: al confirmar, el backend
// vuelve a calcular precio/subtotal/total desde lo persistido (no confía en
// nada que mande el navegador), así que si un precio cambió entre agregar al
// carrito y confirmar, prevalece el valor real del servidor.
const Carrito = () => {
  const { carrito, actualizarCantidad, quitarProducto, vaciarCarrito } = useCarrito();
  const { estaAutenticado } = useAuth();
  const navegar = useNavigate();

  const irACheckout = () => {
    if (!estaAutenticado) {
      navegar('/iniciar-sesion', { state: { desde: { pathname: '/carrito' } } });
      return;
    }
    navegar('/checkout');
  };

  if (carrito.estaVacio) {
    return (
      <div className="pagina contenedor">
        <h1 className="titulo-pagina">Tu carrito</h1>
        <EstadoVacio mensaje="Todavía no agregaste productos." />
        <Link to="/catalogo" className="boton boton-primario">
          Ir al catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="pagina contenedor">
      <h1 className="titulo-pagina">Tu carrito</h1>

      <ul className="carrito__lista">
        {carrito.items.map((item) => (
          <li key={item.producto.idProducto} className="carrito__item">
            <div className="carrito__item-info">
              <p className="carrito__item-nombre">{item.producto.nombre}</p>
              <p className="carrito__item-precio">{formateador.format(Number(item.producto.precio))}</p>
            </div>

            <input
              type="number"
              min="1"
              max={item.producto.stockActual}
              value={item.cantidad}
              onChange={(evento) =>
                actualizarCantidad(item.producto.idProducto, Number(evento.target.value) || 1)
              }
              aria-label={`Cantidad de ${item.producto.nombre}`}
            />

            <p className="carrito__item-subtotal">{formateador.format(item.subtotal)}</p>

            <button
              type="button"
              className="boton-enlace"
              onClick={() => quitarProducto(item.producto.idProducto)}
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <div className="carrito__resumen">
        <button type="button" className="boton boton-secundario" onClick={vaciarCarrito}>
          Vaciar carrito
        </button>

        <div className="carrito__total">
          <span>Total</span>
          <strong>{formateador.format(carrito.total)}</strong>
        </div>

        <button type="button" className="boton boton-primario" onClick={irACheckout}>
          Confirmar compra
        </button>
      </div>
    </div>
  );
};

export default Carrito;
