import { useAuth } from '../hooks/useAuth.js';
import { useFavoritos } from '../hooks/useFavoritos.js';
import './BotonFavorito.css';

// Toggle de favorito (ronda 2): reutilizable desde ProductCard y el detalle
// de producto. Sin sesión de cliente, queda deshabilitado en vez de oculto
// (el pedido de esta etapa pide "estado deshabilitado si no hay sesión", no
// que desaparezca) — el personal tampoco tiene favoritos de compra propios
// (ver favorito.routes.js).
const BotonFavorito = ({ producto, tamano = 'normal' }) => {
  const { esCliente } = useAuth();
  const { esFavorito, estaPendiente, alternarFavorito } = useFavoritos();

  const favorito = esCliente && esFavorito(producto.idProducto);
  // Mientras haya un pedido en curso para ESTE producto, se deshabilita
  // (hallazgo real de Codex: dos clics rápidos sobre el mismo producto
  // podían dejar la UI desincronizada del servidor de forma persistente —
  // ver FavoritosContext.jsx).
  const pendiente = esCliente && estaPendiente(producto.idProducto);

  const manejarClic = (evento) => {
    evento.preventDefault();
    evento.stopPropagation();
    if (!esCliente) return;
    alternarFavorito(producto);
  };

  return (
    <button
      type="button"
      className={`boton-favorito boton-favorito--${tamano} ${favorito ? 'boton-favorito--activo' : ''}`}
      onClick={manejarClic}
      disabled={!esCliente || pendiente}
      aria-pressed={favorito}
      aria-label={
        esCliente
          ? favorito
            ? 'Quitar de favoritos'
            : 'Agregar a favoritos'
          : 'Iniciá sesión como cliente para guardar favoritos'
      }
      title={
        esCliente
          ? favorito
            ? 'Quitar de favoritos'
            : 'Agregar a favoritos'
          : 'Iniciá sesión como cliente para guardar favoritos'
      }
    >
      <span aria-hidden="true">{favorito ? '❤️' : '🤍'}</span>
    </button>
  );
};

export default BotonFavorito;
