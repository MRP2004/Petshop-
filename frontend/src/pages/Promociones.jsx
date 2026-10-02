import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { EstadoCarga, EstadoError, EstadoVacio } from '../components/EstadosSolicitud.jsx';
import useCargaDatos from '../hooks/useCargaDatos.js';
import promocionesApi from '../api/promociones.api.js';
import './Promociones.css';

const formateadorFecha = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

// Listado público limitado a promociones vigentes en la fecha de Argentina;
// la gestión completa vive en /panel/promociones.
const Promociones = () => {
  const { datos: promociones, cargando, error, recargar } = useCargaDatos(
    useCallback(() => promocionesApi.listar(), []),
  );

  return (
    <div className="pagina contenedor">
      <h1 className="titulo-pagina">Promociones</h1>

      {cargando && <EstadoCarga />}
      {error && <EstadoError mensaje={error} onReintentar={recargar} />}
      {!cargando && !error && promociones?.length === 0 && (
        <EstadoVacio mensaje="No hay promociones cargadas por el momento." />
      )}

      {!cargando && !error && promociones?.length > 0 && (
        <ul className="promociones__lista">
          {promociones.map((promo) => (
            <li key={promo.idPromocionProducto} className="tarjeta promociones__item">
              <Link to={`/productos/${promo.idProducto}`} className="promociones__producto">
                {promo.producto?.nombre}
              </Link>
              <p className="promociones__detalle">
                Descuento: {Number(promo.descuento).toFixed(2)}% — Vigencia:{' '}
                {formateadorFecha.format(new Date(promo.fechaInicio))} al{' '}
                {formateadorFecha.format(new Date(promo.fechaFin))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Promociones;
