import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EstadoCarga, EstadoError } from '../../components/EstadosSolicitud.jsx';
import productosApi from '../../api/productos.api.js';

// Alcance adicional voluntario: alerta de productos con stock por debajo del
// mínimo definido (GET /api/productos/stock-bajo, solo personal).
const PanelInicio = () => {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    productosApi
      .listarStockBajo()
      .then(setProductos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  return (
    <div>
      <h1 className="titulo-pagina">Panel de gestión</h1>

      <h2>Alerta de stock bajo</h2>
      {cargando && <EstadoCarga />}
      {error && <EstadoError mensaje={error} />}

      {!cargando && !error && productos.length === 0 && (
        <p>Ningún producto está por debajo de su stock mínimo.</p>
      )}

      {!cargando && !error && productos.length > 0 && (
        <ul>
          {productos.map((producto) => (
            <li key={producto.idProducto}>
              <Link to="/panel/productos">
                {producto.nombre} — stock actual: {producto.stockActual} (mínimo: {producto.stockMinimo})
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PanelInicio;
