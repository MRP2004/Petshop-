import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCarrito } from '../hooks/useCarrito.js';
import { useAuth } from '../hooks/useAuth.js';
import useCargaDatos from '../hooks/useCargaDatos.js';
import productosApi from '../api/productos.api.js';
import PrecioProducto from '../components/PrecioProducto.jsx';
import { EstadoCarga, EstadoError, EstadoVacio } from '../components/EstadosSolicitud.jsx';
import './Carrito.css';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const formatearCentavos = (centavos) => formateador.format(centavos / 100);

// El total que se muestra acá es solo informativo: al confirmar, el backend
// vuelve a calcular precio/subtotal/total desde lo persistido (no confía en
// nada que mande el navegador), así que si un precio cambió entre agregar al
// carrito y confirmar, prevalece el valor real del servidor.
const Carrito = () => {
  const {
    carrito,
    actualizarCantidad,
    quitarProducto,
    vaciarCarrito,
    cargandoCarrito,
    estaListo,
    reintentarCarga,
    operacionesPendientes,
  } = useCarrito();
  const { estaAutenticado } = useAuth();
  const navegar = useNavigate();
  const idsProductos = carrito.items
    .map(({ producto }) => producto.idProducto)
    .sort((a, b) => a - b);
  const claveProductos = idsProductos.join(',');
  const {
    datos: precios,
    cargando: cargandoPrecios,
    error: errorPrecios,
    recargar: recargarPrecios,
  } = useCargaDatos(
    useCallback(
      () => (claveProductos
        ? productosApi.preciosVigentes(claveProductos.split(',').map(Number))
        : Promise.resolve([])),
      [claveProductos],
    ),
    [claveProductos],
  );

  const irACheckout = () => {
    if (!estaAutenticado) {
      navegar('/iniciar-sesion', { state: { desde: { pathname: '/carrito' } } });
      return;
    }
    navegar('/checkout');
  };

  if (cargandoCarrito) {
    return <div className="pagina contenedor"><EstadoCarga mensaje="Cargando tu carrito…" /></div>;
  }

  if (!estaListo) {
    return (
      <div className="pagina contenedor">
        <h1 className="titulo-pagina">Tu carrito</h1>
        <EstadoError mensaje="No se pudo preparar el carrito. Revisá el aviso y volvé a intentarlo." onReintentar={reintentarCarga} />
      </div>
    );
  }

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

  const preciosPorProducto = new Map(
    (precios || []).map(({ idProducto, precioVigente }) => [idProducto, precioVigente]),
  );
  const obtenerPrecioLinea = (item) => {
    const precioVigente = preciosPorProducto.get(item.producto.idProducto);
    return {
      precioVigente,
      precioUnitarioCentavos:
        precioVigente?.precioFinalCentavos ?? Math.round(Number(item.producto.precio) * 100),
    };
  };
  const totalCentavos = carrito.items.reduce((total, item) => {
    const { precioUnitarioCentavos } = obtenerPrecioLinea(item);
    return total + precioUnitarioCentavos * item.cantidad;
  }, 0);

  return (
    <div className="pagina contenedor">
      <h1 className="titulo-pagina">Tu carrito</h1>

      {cargandoPrecios && <p role="status">Actualizando precios vigentes…</p>}
      {errorPrecios && (
        <EstadoError
          mensaje={`No se pudieron actualizar los precios del carrito. ${errorPrecios}`}
          onReintentar={recargarPrecios}
        />
      )}

      <ul className="carrito__lista">
        {carrito.items.map((item) => (
          <li key={item.producto.idProducto} className="carrito__item">
            <div className="carrito__item-info">
              <p className="carrito__item-nombre">{item.producto.nombre}</p>
              <PrecioProducto
                className="carrito__item-precio"
                precioLista={item.producto.precio}
                precioVigente={preciosPorProducto.get(item.producto.idProducto)}
              />
            </div>

            <input
              type="number"
              min="1"
              max={item.producto.stockActual}
              value={item.cantidad}
              disabled={operacionesPendientes > 0}
              onChange={(evento) =>
                actualizarCantidad(item.producto.idProducto, Number(evento.target.value) || 1)
              }
              aria-label={`Cantidad de ${item.producto.nombre}`}
            />

            <p className="carrito__item-subtotal">
              {formatearCentavos(obtenerPrecioLinea(item).precioUnitarioCentavos * item.cantidad)}
            </p>

            <button
              type="button"
              className="boton-enlace"
              onClick={() => quitarProducto(item.producto.idProducto)}
              disabled={operacionesPendientes > 0}
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <div className="carrito__resumen">
        <button
          type="button"
          className="boton boton-secundario"
          onClick={vaciarCarrito}
          disabled={operacionesPendientes > 0}
        >
          Vaciar carrito
        </button>

        <div className="carrito__total">
          <span>Total</span>
          <strong>{formatearCentavos(totalCentavos)}</strong>
        </div>

        <p className="carrito__aviso-precios">
          El checkout vuelve a consultar los precios y promociones vigentes antes de confirmar la compra.
        </p>

        <button
          type="button"
          className="boton boton-primario"
          onClick={irACheckout}
          disabled={operacionesPendientes > 0}
        >
          Confirmar compra
        </button>
      </div>
    </div>
  );
};

export default Carrito;
