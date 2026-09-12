import './EstadosSolicitud.css';

// Tres estados reutilizables para cualquier pantalla que dependa de datos de
// la API (catálogo, ventas, panel de gestión, etc.), en vez de que cada
// página reimplemente su propio "cargando..."/mensaje de error/lista vacía.
const EstadoCarga = ({ mensaje = 'Cargando…' }) => (
  <div className="estado-solicitud" role="status">
    <div className="estado-solicitud__spinner" aria-hidden="true" />
    <p>{mensaje}</p>
  </div>
);

const EstadoError = ({ mensaje = 'Ocurrió un error inesperado.', onReintentar }) => (
  <div className="estado-solicitud estado-solicitud--error" role="alert">
    <p>{mensaje}</p>
    {onReintentar && (
      <button type="button" className="boton boton-secundario" onClick={onReintentar}>
        Reintentar
      </button>
    )}
  </div>
);

const EstadoVacio = ({ mensaje = 'No hay nada para mostrar todavía.' }) => (
  <div className="estado-solicitud">
    <p>{mensaje}</p>
  </div>
);

export { EstadoCarga, EstadoError, EstadoVacio };
