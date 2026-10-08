import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAvisos } from '../hooks/useAvisos.js';
import './Campana.css';

const formateadorFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });

// Campana de notificaciones in-app (ronda 2, Etapa 6): mismo patrón de
// apertura por mouse/teclado que CuentaMenu.jsx (hover abre, clic abre —no
// alterna—, Escape cierra y devuelve el foco, blur afuera cierra).
const Campana = () => {
  const { avisos, noLeidos, marcarLeido, marcarTodosLeidos } = useAvisos();
  const [abierto, setAbierto] = useState(false);
  const referenciaContenedor = useRef(null);
  const referenciaBoton = useRef(null);

  const cerrar = () => setAbierto(false);

  const manejarBlur = (evento) => {
    if (!referenciaContenedor.current?.contains(evento.relatedTarget)) {
      cerrar();
    }
  };

  const manejarTeclaBoton = (evento) => {
    if (evento.key === 'Enter' || evento.key === ' ' || evento.key === 'ArrowDown') {
      evento.preventDefault();
      setAbierto(true);
    }
  };

  // En el CONTENEDOR (no solo en el botón), porque Escape debe cerrar el
  // panel sin importar qué elemento interno tenga el foco en ese momento
  // (un aviso, "Marcar todas como leídas") — hallazgo real de Codex: antes
  // Escape solo se manejaba en el botón de la campana, así que tabular
  // hacia adentro del panel y presionar Escape no cerraba nada. El evento
  // burbujea desde cualquier hijo hasta acá, así que un único manejador
  // alcanza para los dos casos.
  const manejarTeclaContenedor = (evento) => {
    if (evento.key === 'Escape') {
      cerrar();
      referenciaBoton.current?.focus();
    }
  };

  const alHacerClicItem = (aviso) => {
    if (!aviso.leido) marcarLeido(aviso.idAviso);
    cerrar();
  };

  return (
    <div
      ref={referenciaContenedor}
      className="campana"
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={cerrar}
      onBlur={manejarBlur}
      onKeyDown={manejarTeclaContenedor}
    >
      <button
        ref={referenciaBoton}
        type="button"
        className="campana__boton navbar__accion"
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-label={noLeidos > 0 ? `Notificaciones, ${noLeidos} sin leer` : 'Notificaciones'}
        onClick={() => setAbierto(true)}
        onKeyDown={manejarTeclaBoton}
      >
        <span aria-hidden="true">🔔</span>
        {noLeidos > 0 && (
          <span className="campana__contador" aria-hidden="true">
            {noLeidos > 9 ? '9+' : noLeidos}
          </span>
        )}
      </button>

      {abierto && (
        <div className="campana__panel" role="region" aria-label="Notificaciones">
          <div className="campana__encabezado">
            <strong>Notificaciones</strong>
            {noLeidos > 0 && (
              <button type="button" className="boton-enlace" onClick={marcarTodosLeidos}>
                Marcar todas como leídas
              </button>
            )}
          </div>

          {avisos.length === 0 && <p className="campana__vacio">No tenés notificaciones todavía.</p>}

          <ul className="campana__lista">
            {avisos.map((aviso) => {
              const contenido = (
                <>
                  <p className="campana__mensaje">{aviso.mensaje}</p>
                  <time className="campana__fecha" dateTime={aviso.creadoEn}>
                    {formateadorFecha.format(new Date(aviso.creadoEn))}
                  </time>
                </>
              );

              return (
                <li key={aviso.idAviso} className={`campana__item ${aviso.leido ? '' : 'campana__item--no-leido'}`}>
                  {aviso.enlace ? (
                    <Link to={aviso.enlace} className="campana__item-enlace" onClick={() => alHacerClicItem(aviso)}>
                      {contenido}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="campana__item-enlace"
                      onClick={() => alHacerClicItem(aviso)}
                    >
                      {contenido}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default Campana;
