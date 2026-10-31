import './PrecioProducto.css';

const formateador = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
});

const PrecioProducto = ({ precioLista, precioVigente, className = '' }) => {
  const precioListaCentavos =
    precioVigente?.precioListaCentavos ?? Math.round(Number(precioLista) * 100);
  const precioFinalCentavos =
    precioVigente?.precioFinalCentavos ?? precioListaCentavos;
  const promocionActiva = precioVigente?.idPromocionProducto != null;

  return (
    <div className={`precio-producto ${className}`.trim()}>
      {promocionActiva && (
        <>
          <span className="precio-producto__etiqueta">
            {Number(precioVigente.porcentajeDescuento)}% OFF
          </span>
          <del className="precio-producto__anterior">
            {formateador.format(precioListaCentavos / 100)}
          </del>
        </>
      )}
      <span className="precio-producto__actual">
        {formateador.format(precioFinalCentavos / 100)}
      </span>
    </div>
  );
};

export default PrecioProducto;
