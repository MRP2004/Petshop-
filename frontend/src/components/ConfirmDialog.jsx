import { useEffect, useId, useRef } from 'react';
import atraparTab from '../utils/atraparTab.js';
import './ConfirmDialog.css';

// Diálogo de confirmación reutilizable (ronda 2, ver docs/frontend-diseno.md):
// reemplaza los `window.confirm` que había en GestionEntidad.jsx (borrar un
// registro) y VentaDetalle.jsx (cancelar venta, aprobar solicitud de
// cancelación) — un `window.confirm` no puede mostrar el detalle de la
// operación (qué venta, qué consecuencias) ni queda deshabilitado mientras
// la acción está en curso.
//
// `role="alertdialog"` (no "dialog" — el modal de alta/edición de
// GestionEntidad.jsx sí usa "dialog"): esto SIEMPRE pide confirmar antes de
// una acción con consecuencias reales, es exactamente el caso de uso de
// alertdialog. `aria-describedby` apunta al mensaje (la consecuencia real:
// "se restituye el stock", "no se puede deshacer") — sin esto, un lector de
// pantalla podía anunciar solo el título y los botones, salteando la parte
// que en un alertdialog es la más importante (hallazgo real de la revisión
// de Codex de esta ronda). El foco por defecto va al botón NO destructivo
// (Cancelar/Volver), no al de confirmar: así un Enter apenas se abre el
// diálogo (el usuario todavía con el dedo en la tecla que abrió la acción)
// no confirma de una la operación destructiva. Tab/Shift+Tab quedan
// atrapados dentro del diálogo (atraparTab.js) — sin esto, se podía tabular
// hacia controles del fondo con el overlay todavía abierto (mismo hallazgo).
const ConfirmDialog = ({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  peligro = false,
  cargando = false,
  error = null,
  onConfirmar,
  onCancelar,
}) => {
  const idTitulo = useId();
  const idMensaje = useId();
  const referenciaCancelar = useRef(null);
  const referenciaDialogo = useRef(null);

  useEffect(() => {
    if (abierto) {
      referenciaCancelar.current?.focus();
    }
  }, [abierto]);

  if (!abierto) return null;

  const manejarTeclaDialogo = (evento) => {
    // Mientras `cargando` (la acción ya se disparó y está en vuelo), no se
    // puede cerrar con Escape: cerrar acá no cancela el pedido ya en curso,
    // solo ocultaría el diálogo dejando a quien lo usa sin saber si terminó.
    if (evento.key === 'Escape' && !cargando) {
      onCancelar();
      return;
    }
    atraparTab(evento, referenciaDialogo);
  };

  return (
    <div
      className="confirm-dialog__fondo"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && !cargando) onCancelar();
      }}
    >
      <div
        ref={referenciaDialogo}
        className="confirm-dialog tarjeta"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idMensaje}
        onKeyDown={manejarTeclaDialogo}
      >
        <h3 id={idTitulo}>{titulo}</h3>
        <p id={idMensaje}>{mensaje}</p>
        {error && (
          <p className="confirm-dialog__error" role="alert">
            {error}
          </p>
        )}
        <div className="confirm-dialog__acciones">
          <button
            type="button"
            ref={referenciaCancelar}
            className="boton boton-secundario"
            onClick={onCancelar}
            disabled={cargando}
          >
            {textoCancelar}
          </button>
          <button
            type="button"
            className={`boton ${peligro ? 'boton-peligro' : 'boton-primario'}`}
            onClick={onConfirmar}
            disabled={cargando}
          >
            {cargando ? 'Procesando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
