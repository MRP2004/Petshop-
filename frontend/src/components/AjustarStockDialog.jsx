import { useId, useRef, useState } from 'react';
import atraparTab from '../utils/atraparTab.js';
import './AjustarStockDialog.css';

// Reemplaza el window.prompt/window.alert que tenía "Ajustar stock" (ronda
// 2, ver docs/frontend-diseno.md): un prompt no puede mostrar el stock
// actual ni el resultado antes de guardar, y un valor inválido solo se
// avisaba después de escribirlo. Acá se ve todo antes de confirmar. La
// validación real (que el resultado no sea negativo, entre otras) sigue
// siendo del backend (ver producto.service.js#ajustarStockProducto,
// transaccional con bloqueo de fila) — esto es solo una vista previa para
// quien carga el movimiento, no una segunda fuente de verdad.
//
// No resetea el campo "adentro" con un efecto ni con la comparación de ref
// contra la prop anterior (el lint de este proyecto rechaza ambos: "Calling
// setState() directly within an effect" y "Cannot access refs during
// render"): en cambio, quien lo usa lo monta condicionalmente con una
// `key` que cambia en cada apertura (ver PanelProductos.jsx), así cada
// apertura es una instancia de componente nueva de verdad, con su
// `useState('')` ya limpio, sin necesitar ningún reseteo manual.
//
// Tab/Shift+Tab quedan atrapados dentro del diálogo y Escape cierra (salvo
// mientras `cargando`) — mismo hallazgo real de la revisión de Codex que
// ConfirmDialog.jsx: sin esto, se podía tabular hacia controles del fondo
// con el overlay todavía abierto, y este diálogo en particular ni siquiera
// tenía Escape.
const AjustarStockDialog = ({ producto, cargando = false, error = null, onConfirmar, onCancelar }) => {
  const idTitulo = useId();
  const idCantidad = useId();
  const [cantidadTexto, setCantidadTexto] = useState('');
  const referenciaDialogo = useRef(null);

  if (!producto) return null;

  const cantidad = Number(cantidadTexto);
  const esValida = cantidadTexto.trim() !== '' && Number.isInteger(cantidad) && cantidad !== 0;
  const resultado = esValida ? producto.stockActual + cantidad : null;
  const resultadoInvalido = resultado !== null && resultado < 0;

  const manejarEnviar = (evento) => {
    evento.preventDefault();
    if (!esValida || resultadoInvalido || cargando) return;
    onConfirmar(cantidad);
  };

  const manejarTeclaDialogo = (evento) => {
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
      <form
        ref={referenciaDialogo}
        className="confirm-dialog tarjeta ajustar-stock-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onSubmit={manejarEnviar}
        onKeyDown={manejarTeclaDialogo}
      >
        <h3 id={idTitulo}>Ajustar stock — {producto.nombre}</h3>

        <p className="ajustar-stock-dialog__actual">
          Stock actual: <strong>{producto.stockActual}</strong>
        </p>

        <div className="campo">
          <label htmlFor={idCantidad}>Movimiento (positivo suma, negativo resta)</label>
          <input
            id={idCantidad}
            type="number"
            step="1"
            autoFocus
            value={cantidadTexto}
            onChange={(evento) => setCantidadTexto(evento.target.value)}
            disabled={cargando}
          />
        </div>

        {resultado !== null && (
          <p className={`ajustar-stock-dialog__resultado${resultadoInvalido ? ' ajustar-stock-dialog__resultado--invalido' : ''}`}>
            Resultado: <strong>{resultado}</strong>
            {resultadoInvalido && ' — no puede quedar negativo'}
          </p>
        )}

        {error && (
          <p className="confirm-dialog__error" role="alert">
            {error}
          </p>
        )}

        <div className="confirm-dialog__acciones">
          <button type="button" className="boton boton-secundario" onClick={onCancelar} disabled={cargando}>
            Cancelar
          </button>
          <button type="submit" className="boton boton-primario" disabled={!esValida || resultadoInvalido || cargando}>
            {cargando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AjustarStockDialog;
