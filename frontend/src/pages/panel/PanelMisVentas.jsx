import { useCallback } from 'react';
import { EstadoCarga, EstadoError, EstadoVacio } from '../../components/EstadosSolicitud.jsx';
import { etiquetaEstadoVenta } from '../../utils/estadosLegibles.js';
import useCargaDatos from '../../hooks/useCargaDatos.js';
import tiendaApi from '../../api/tienda.api.js';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const formateadorFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' });

// "Mis ventas" de un vendedor independiente (ronda 2, Etapa 8): a
// diferencia del panel interno (que ve la Venta completa), esto muestra un
// DTO sanitizado — solo las líneas y el subtotal de ESTA tienda, nunca el
// total real de la compra, el medio de pago, el comprobante ni la
// dirección completa (ver tienda.service.js#listarVentasDeTienda, revisión
// de diseño de Codex: "el filtrado de línea no alcanza si la respuesta
// conserva campos globales de la venta").
const PanelMisVentas = () => {
  const { datos: ventas, cargando, error, recargar } = useCargaDatos(useCallback(() => tiendaApi.misVentas(), []));

  if (cargando) return <EstadoCarga />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (ventas?.length === 0) return <EstadoVacio mensaje="Todavía no vendiste ningún producto." />;

  return (
    <div>
      <h2>Mis ventas</h2>
      <p style={{ color: 'var(--color-texto-suave)', maxWidth: 720 }}>
        Acá ves solo tus productos y tu subtotal. El estado de cada pedido (preparación, envío, retiro y
        entrega) lo gestiona el personal de PetShop para la compra completa.
      </p>
      <div className="gestion-entidad__tabla-scroll">
        <table className="gestion-entidad__tabla">
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Entrega</th>
              <th>Mis productos</th>
              <th>Mi subtotal</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((venta) => (
              <tr key={venta.idVenta}>
                <td>#{venta.idVenta}</td>
                <td>{formateadorFecha.format(new Date(venta.fecha))}</td>
                <td>{venta.cliente ? `${venta.cliente.nombre} ${venta.cliente.apellido}` : '—'}</td>
                <td>{etiquetaEstadoVenta(venta.estado)}</td>
                <td>{venta.metodoEntrega || '—'}</td>
                <td>
                  {venta.detallesPropios.map((d) => (
                    <div key={d.idDetalleVenta}>{d.cantidad} × {d.producto?.nombre}</div>
                  ))}
                </td>
                <td>{formateador.format(Number(venta.subtotalPropio))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PanelMisVentas;
