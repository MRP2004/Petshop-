import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EstadoCarga, EstadoError } from '../../components/EstadosSolicitud.jsx';
import ventasApi from '../../api/ventas.api.js';
import clientesApi from '../../api/clientes.api.js';
import medioPagoApi from '../../api/medioPago.api.js';
import productosApi from '../../api/productos.api.js';
import './PanelNuevaVenta.css';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const LONGITUD_MINIMA_DIRECCION = 8;

// Venta cargada por personal para un cliente elegido (a diferencia de la
// compra pública, que deriva el cliente de la sesión). Reutiliza el mismo
// endpoint y las mismas reglas de negocio que la compra pública
// (POST /api/ventas -> registrarVenta): la única diferencia la decide el
// backend según el rol del token, acá no se duplica ninguna regla de
// precio/stock/descuento.
const PanelNuevaVenta = () => {
  const navegar = useNavigate();
  const [clientes, setClientes] = useState([]);
  const [mediosPago, setMediosPago] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);

  const [idCliente, setIdCliente] = useState('');
  const [idMedioPago, setIdMedioPago] = useState('');
  const [metodoEntrega, setMetodoEntrega] = useState('retiro en sucursal');
  const [direccionEntrega, setDireccionEntrega] = useState('');
  const [idProductoSeleccionado, setIdProductoSeleccionado] = useState('');
  const [cantidadSeleccionada, setCantidadSeleccionada] = useState(1);
  const [lineas, setLineas] = useState([]); // [{producto, cantidad}]
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([clientesApi.listar(), medioPagoApi.listar(), productosApi.listar()])
      .then(([listaClientes, listaMedios, listaProductos]) => {
        setClientes(listaClientes);
        setMediosPago(listaMedios.filter((m) => m.habilitado));
        setProductos(listaProductos);
      })
      .catch((err) => setErrorCarga(err.message))
      .finally(() => setCargando(false));
  }, []);

  const agregarLinea = () => {
    if (!idProductoSeleccionado || cantidadSeleccionada <= 0) return;
    const producto = productos.find((p) => p.idProducto === Number(idProductoSeleccionado));
    if (!producto) return;

    setLineas((actual) => {
      const sinRepetir = actual.filter((l) => l.producto.idProducto !== producto.idProducto);
      return [...sinRepetir, { producto, cantidad: cantidadSeleccionada }];
    });
  };

  const quitarLinea = (idProducto) => {
    setLineas((actual) => actual.filter((l) => l.producto.idProducto !== idProducto));
  };

  const total = lineas.reduce((acc, l) => acc + Number(l.producto.precio) * l.cantidad, 0);
  const esEnvioADomicilio = metodoEntrega === 'envío a domicilio';
  const direccionInvalida = esEnvioADomicilio && direccionEntrega.trim().length < LONGITUD_MINIMA_DIRECCION;

  const confirmar = async (evento) => {
    evento.preventDefault();
    if (enviando || lineas.length === 0 || !idCliente || !idMedioPago || direccionInvalida) return;

    setEnviando(true);
    setError(null);

    try {
      const venta = await ventasApi.registrar({
        idCliente: Number(idCliente),
        idMedioPago: Number(idMedioPago),
        metodoEntrega,
        direccionEntrega: esEnvioADomicilio ? direccionEntrega.trim() : undefined,
        detalles: lineas.map((l) => ({ idProducto: l.producto.idProducto, cantidad: l.cantidad })),
      });
      navegar(`/panel/ventas/${venta.idVenta}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <EstadoCarga />;
  if (errorCarga) return <EstadoError mensaje={errorCarga} />;

  return (
    <div className="panel-nueva-venta">
      <h2>Nueva venta</h2>

      <form onSubmit={confirmar}>
        <div className="panel-nueva-venta__cabecera">
          <div className="campo">
            <label htmlFor="cliente">Cliente</label>
            <select id="cliente" value={idCliente} onChange={(e) => setIdCliente(e.target.value)} required>
              <option value="">Seleccionar…</option>
              {clientes.map((c) => (
                <option key={c.idCliente} value={c.idCliente}>{c.nombre} {c.apellido}</option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="medioPago">Medio de pago</label>
            <select id="medioPago" value={idMedioPago} onChange={(e) => setIdMedioPago(e.target.value)} required>
              <option value="">Seleccionar…</option>
              {mediosPago.map((m) => (
                <option key={m.idMedioPago} value={m.idMedioPago}>{m.nombre}</option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="entrega">Entrega</label>
            <select id="entrega" value={metodoEntrega} onChange={(e) => setMetodoEntrega(e.target.value)}>
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
                onChange={(e) => setDireccionEntrega(e.target.value)}
                required
                minLength={LONGITUD_MINIMA_DIRECCION}
              />
            </div>
          )}
        </div>

        <h3>Productos</h3>
        <div className="panel-nueva-venta__agregar">
          <select value={idProductoSeleccionado} onChange={(e) => setIdProductoSeleccionado(e.target.value)}>
            <option value="">Seleccionar producto…</option>
            {productos.map((p) => (
              <option key={p.idProducto} value={p.idProducto}>
                {p.nombre} (stock: {p.stockActual})
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={cantidadSeleccionada}
            onChange={(e) => setCantidadSeleccionada(Number(e.target.value) || 1)}
          />
          <button type="button" className="boton boton-secundario" onClick={agregarLinea}>
            Agregar
          </button>
        </div>

        {lineas.length > 0 && (
          <ul className="panel-nueva-venta__lineas">
            {lineas.map((l) => (
              <li key={l.producto.idProducto}>
                <span>{l.cantidad} × {l.producto.nombre}</span>
                <strong>{formateador.format(Number(l.producto.precio) * l.cantidad)}</strong>
                <button type="button" className="boton-enlace" onClick={() => quitarLinea(l.producto.idProducto)}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="panel-nueva-venta__total">Total: {formateador.format(total)}</p>

        {error && <EstadoError mensaje={error} />}

        <button
          type="submit"
          className="boton boton-primario"
          disabled={enviando || lineas.length === 0 || !idCliente || !idMedioPago || direccionInvalida}
        >
          {enviando ? 'Registrando…' : 'Registrar venta'}
        </button>
      </form>
    </div>
  );
};

export default PanelNuevaVenta;
