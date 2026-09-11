import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCarrito } from '../hooks/useCarrito.js';
import { EstadoCarga, EstadoError } from '../components/EstadosSolicitud.jsx';
import ventasApi from '../api/ventas.api.js';
import medioPagoApi from '../api/medioPago.api.js';
import './Checkout.css';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const LONGITUD_MINIMA_DIRECCION = 8;

// Confirmación de compra: revalida precio/stock en el servidor (no en esta
// pantalla) al registrar la venta, y el botón se deshabilita apenas se
// envía la solicitud para no poder mandar un clic doble mientras se espera
// la respuesta (evita registrar la misma compra dos veces).
const Checkout = () => {
  const { carrito, vaciarCarrito } = useCarrito();
  const navegar = useNavigate();

  const [mediosPago, setMediosPago] = useState([]);
  const [idMedioPago, setIdMedioPago] = useState('');
  const [metodoEntrega, setMetodoEntrega] = useState('retiro en sucursal');
  const [direccionEntrega, setDireccionEntrega] = useState('');
  const [cargandoMedios, setCargandoMedios] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);

  useEffect(() => {
    if (carrito.estaVacio) {
      navegar('/carrito', { replace: true });
      return;
    }

    medioPagoApi
      .listar()
      .then((lista) => {
        const habilitados = lista.filter((medio) => medio.habilitado);
        setMediosPago(habilitados);
        if (habilitados.length > 0) setIdMedioPago(String(habilitados[0].idMedioPago));
      })
      .catch((err) => setErrorCarga(err.message))
      .finally(() => setCargandoMedios(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const esEnvioADomicilio = metodoEntrega === 'envío a domicilio';
  const direccionInvalida = esEnvioADomicilio && direccionEntrega.trim().length < LONGITUD_MINIMA_DIRECCION;

  const confirmarCompra = async (evento) => {
    evento.preventDefault();
    // No se puede confirmar un envío a domicilio sin una dirección real:
    // el backend también lo exige (venta.service.js#prepararEntrega), pero
    // acá se corta antes de mandar la solicitud para dar el error al lado
    // del campo, no como un cartel genérico después de esperar la respuesta.
    if (enviando || direccionInvalida) return;

    setEnviando(true);
    setErrorEnvio(null);

    try {
      const venta = await ventasApi.registrar({
        idMedioPago: Number(idMedioPago),
        metodoEntrega,
        direccionEntrega: esEnvioADomicilio ? direccionEntrega.trim() : undefined,
        detalles: carrito.aDetallesVenta(),
      });

      vaciarCarrito();
      navegar(`/mis-compras/${venta.idVenta}`, { replace: true, state: { reciénConfirmada: true } });
    } catch (error) {
      // Errores esperables acá: stock insuficiente (cambió desde que se
      // agregó al carrito) o medio de pago deshabilitado; se muestran tal
      // cual los devuelve el backend, que es la fuente de verdad.
      setErrorEnvio(error.message);
      setEnviando(false);
    }
  };

  if (cargandoMedios) return <div className="pagina contenedor"><EstadoCarga /></div>;
  if (errorCarga) return <div className="pagina contenedor"><EstadoError mensaje={errorCarga} /></div>;

  return (
    <div className="pagina contenedor checkout">
      <h1 className="titulo-pagina">Confirmar compra</h1>

      <div className="checkout__resumen">
        <h2>Resumen</h2>
        <ul>
          {carrito.items.map((item) => (
            <li key={item.producto.idProducto}>
              {item.cantidad} × {item.producto.nombre} — {formateador.format(item.subtotal)}
            </li>
          ))}
        </ul>
        <p className="checkout__total">Total: {formateador.format(carrito.total)}</p>
      </div>

      <form className="checkout__formulario" onSubmit={confirmarCompra}>
        <div className="campo">
          <label htmlFor="medioPago">Medio de pago</label>
          <select
            id="medioPago"
            value={idMedioPago}
            onChange={(evento) => setIdMedioPago(evento.target.value)}
            required
          >
            {mediosPago.map((medio) => (
              <option key={medio.idMedioPago} value={medio.idMedioPago}>
                {medio.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="entrega">Entrega</label>
          <select id="entrega" value={metodoEntrega} onChange={(evento) => setMetodoEntrega(evento.target.value)}>
            <option value="retiro en sucursal">Retiro en sucursal</option>
            <option value="envío a domicilio">Envío a domicilio</option>
          </select>
        </div>

        {esEnvioADomicilio && (
          <div className="campo">
            <label htmlFor="direccionEntrega">Dirección de entrega</label>
            <input
              id="direccionEntrega"
              type="text"
              placeholder="Calle, número, ciudad"
              value={direccionEntrega}
              onChange={(evento) => setDireccionEntrega(evento.target.value)}
              required
              minLength={LONGITUD_MINIMA_DIRECCION}
            />
            {direccionInvalida && direccionEntrega.length > 0 && (
              <span className="checkout__ayuda-campo">
                Ingresá una dirección completa (mínimo {LONGITUD_MINIMA_DIRECCION} caracteres).
              </span>
            )}
          </div>
        )}

        {errorEnvio && <EstadoError mensaje={errorEnvio} />}

        <button
          type="submit"
          className="boton boton-primario"
          disabled={enviando || !idMedioPago || direccionInvalida}
        >
          {enviando ? 'Confirmando…' : 'Confirmar compra'}
        </button>
      </form>
    </div>
  );
};

export default Checkout;
