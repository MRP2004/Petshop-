import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { EstadoCarga, EstadoError, EstadoVacio } from '../../components/EstadosSolicitud.jsx';
import useCargaDatos from '../../hooks/useCargaDatos.js';
import ventasApi from '../../api/ventas.api.js';
import clientesApi from '../../api/clientes.api.js';
import proveedoresApi from '../../api/proveedores.api.js';
import './PanelVentas.css';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const formateadorFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' });

const pedirFiltros = () =>
  Promise.all([clientesApi.listar(), proveedoresApi.listar()]).then(([clientes, proveedores]) => ({
    clientes,
    proveedores,
  }));

// Listado de ventas filtrado por cliente o proveedor (requisito de la
// propuesta). El filtro por proveedor es una interpretación propuesta y
// pendiente de confirmación (ver docs/estado-proyecto.md): ventas que
// incluyen al menos un producto de ese proveedor, porque Venta no tiene una
// relación directa con Proveedor.
const PanelVentas = () => {
  const { datos: filtrosDisponibles } = useCargaDatos(useCallback(() => pedirFiltros(), []));

  const [idCliente, setIdCliente] = useState('');
  const [idProveedor, setIdProveedor] = useState('');

  const { datos: ventas, cargando, error, recargar } = useCargaDatos(
    useCallback(
      () => ventasApi.listar({ idCliente: idCliente || undefined, idProveedor: idProveedor || undefined }),
      [idCliente, idProveedor],
    ),
    [idCliente, idProveedor],
  );

  return (
    <div>
      <h2>Ventas</h2>

      <div className="panel-ventas__filtros">
        <div className="campo">
          <label htmlFor="filtroCliente">Cliente</label>
          <select id="filtroCliente" value={idCliente} onChange={(e) => setIdCliente(e.target.value)}>
            <option value="">Todos</option>
            {(filtrosDisponibles?.clientes || []).map((c) => (
              <option key={c.idCliente} value={c.idCliente}>{c.nombre} {c.apellido}</option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="filtroProveedor">Proveedor</label>
          <select id="filtroProveedor" value={idProveedor} onChange={(e) => setIdProveedor(e.target.value)}>
            <option value="">Todos</option>
            {(filtrosDisponibles?.proveedores || []).map((p) => (
              <option key={p.idProveedor} value={p.idProveedor}>{p.descripcion}</option>
            ))}
          </select>
        </div>
      </div>

      {cargando && <EstadoCarga />}
      {error && <EstadoError mensaje={error} onReintentar={recargar} />}
      {!cargando && !error && ventas?.length === 0 && <EstadoVacio mensaje="No hay ventas con ese filtro." />}

      {!cargando && !error && ventas?.length > 0 && (
        <div className="gestion-entidad__tabla-scroll">
          <table className="gestion-entidad__tabla">
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((venta) => (
                <tr key={venta.idVenta}>
                  <td><Link to={`/panel/ventas/${venta.idVenta}`}>#{venta.idVenta}</Link></td>
                  <td>{formateadorFecha.format(new Date(venta.fecha))}</td>
                  <td>{venta.cliente?.nombre} {venta.cliente?.apellido}</td>
                  <td>{venta.estado}</td>
                  <td>{formateador.format(Number(venta.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PanelVentas;
