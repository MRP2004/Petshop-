import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { EstadoCarga, EstadoError, EstadoVacio } from '../components/EstadosSolicitud.jsx';
import useCargaDatos from '../hooks/useCargaDatos.js';
import promocionesApi from '../api/promociones.api.js';
import './Promociones.css';

const formateadorFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' });

// Listado público de promociones cargadas por el personal (solo lectura acá:
// la gestión vive en /panel/promociones).
//
// Importante (ver docs/estado-proyecto.md): las reglas de aplicación de
// PromocionProducto (si el descuento es porcentual, cómo se combina con el
// descuento manual, qué pasa ante promociones superpuestas) todavía no las
// confirmó Mauro. Por eso NINGÚN precio del catálogo ni del checkout
// descuenta nada por una promoción todavía: mostrar acá un precio "ya
// rebajado" sería anunciarle al comprador un descuento que en realidad no
// se aplica al pagar. El aviso de abajo es explícito a propósito, no un
// detalle menor.
const Promociones = () => {
  const { datos: promociones, cargando, error, recargar } = useCargaDatos(
    useCallback(() => promocionesApi.listar(), []),
  );

  return (
    <div className="pagina contenedor">
      <h1 className="titulo-pagina">Promociones</h1>

      <p className="promociones__aviso" role="note">
        Estas promociones todavía no se descuentan automáticamente al confirmar una
        compra: el precio que vas a pagar en el checkout es el precio de lista, sin
        este descuento aplicado.
      </p>

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
                Descuento propuesto: {promo.descuento} (no aplicado en el checkout) — Vigencia:{' '}
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
