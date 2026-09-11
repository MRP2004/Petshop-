import { useCallback, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { EstadoCarga, EstadoError } from '../components/EstadosSolicitud.jsx';
import useCargaDatos from '../hooks/useCargaDatos.js';
import ventasApi from '../api/ventas.api.js';
import './VentaDetalle.css';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const formateadorFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' });

// Detalle de una venta: fecha, cliente, medio de pago, cada producto
// comprado con cantidad y precio (requisito de la propuesta: el detalle de
// un listado de ventas debe mostrar información de al menos 2 clases de
// negocio, acá son Venta + Cliente + Producto). Se usa tanto desde "Mis
// compras" (cliente) como desde el panel (personal); el backend decide en
// cada caso si el usuario puede verla (ownership check en venta.service.js).
// El wrapper de más abajo la monta con key={id} para que, al navegar entre
// ventas, el estado de "acción en curso" arranque limpio sin necesitar un
// efecto de reseteo.
const VentaDetalleContenido = ({ id }) => {
  const ubicacion = useLocation();
  const { esPersonal } = useAuth();
  const { datos: venta, setDatos: setVenta, cargando, error, recargar } = useCargaDatos(
    useCallback(() => ventasApi.obtener(id), [id]),
  );

  const [accionEnCurso, setAccionEnCurso] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);

  const cancelar = async () => {
    setAccionEnCurso(true);
    setErrorAccion(null);
    try {
      setVenta(await ventasApi.cancelar(id));
    } catch (err) {
      setErrorAccion(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  };

  const marcarComoEnviada = async () => {
    setAccionEnCurso(true);
    setErrorAccion(null);
    try {
      setVenta(await ventasApi.marcarComoEnviada(id));
    } catch (err) {
      setErrorAccion(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  };

  if (cargando) return <div className="pagina contenedor"><EstadoCarga /></div>;
  if (error) return <div className="pagina contenedor"><EstadoError mensaje={error} onReintentar={recargar} /></div>;
  if (!venta) return null;

  const volverA = esPersonal ? '/panel/ventas' : '/mi-cuenta';

  return (
    <div className="pagina contenedor venta-detalle">
      <Link to={volverA} className="boton-enlace">← Volver</Link>

      {ubicacion.state?.reciénConfirmada && (
        <p className="venta-detalle__confirmacion">
          ¡Compra confirmada! Número de operación: #{venta.idVenta}
        </p>
      )}

      <h1 className="titulo-pagina">Venta #{venta.idVenta}</h1>

      <div className="venta-detalle__resumen tarjeta">
        <p><strong>Fecha:</strong> {formateadorFecha.format(new Date(venta.fecha))}</p>
        <p><strong>Estado:</strong> {venta.estado}</p>
        <p><strong>Cliente:</strong> {venta.cliente?.nombre} {venta.cliente?.apellido}</p>
        <p><strong>Medio de pago:</strong> {venta.medioPago?.nombre}</p>
        {venta.metodoEntrega && <p><strong>Entrega:</strong> {venta.metodoEntrega}</p>}
        {venta.direccionEntrega?.direccion && (
          <p><strong>Dirección de entrega:</strong> {venta.direccionEntrega.direccion}</p>
        )}
        {venta.descuento && <p><strong>Descuento:</strong> {formateador.format(Number(venta.descuento))}</p>}
        <p className="venta-detalle__total"><strong>Total:</strong> {formateador.format(Number(venta.total))}</p>
      </div>

      <h2 className="venta-detalle__subtitulo">Productos</h2>
      <ul className="venta-detalle__detalles">
        {venta.detalles?.map((detalle) => (
          <li key={detalle.idDetalleVenta} className="tarjeta">
            <span>{detalle.cantidad} × {detalle.producto?.nombre}</span>
            <span>{formateador.format(Number(detalle.precioUnitario))} c/u</span>
            <strong>{formateador.format(Number(detalle.subtotal))}</strong>
          </li>
        ))}
      </ul>

      {errorAccion && <EstadoError mensaje={errorAccion} />}

      <div className="venta-detalle__acciones">
        {venta.estado === 'registrada' && (
          <button type="button" className="boton boton-peligro" onClick={cancelar} disabled={accionEnCurso}>
            {accionEnCurso ? 'Cancelando…' : 'Cancelar venta'}
          </button>
        )}

        {esPersonal && venta.estado === 'registrada' && (
          <button type="button" className="boton boton-primario" onClick={marcarComoEnviada} disabled={accionEnCurso}>
            {accionEnCurso ? 'Actualizando…' : 'Marcar como enviada'}
          </button>
        )}
      </div>
    </div>
  );
};

const VentaDetalle = () => {
  const { id } = useParams();
  return <VentaDetalleContenido key={id} id={id} />;
};

export default VentaDetalle;
