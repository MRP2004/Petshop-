// Trampa de foco para diálogos modales (ronda 2, hallazgo real de la
// revisión de Codex: ConfirmDialog/AjustarStockDialog declaraban
// aria-modal="true" pero no impedían que Tab saliera del diálogo hacia
// controles del fondo mientras el overlay seguía abierto). Se usa como
// `onKeyDown` en el contenedor del diálogo: si Tab/Shift+Tab dejaría el
// foco fuera del primer/último elemento enfocable, lo envuelve de vuelta.
const obtenerFocosables = (contenedor) =>
  Array.from(
    contenedor.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ).filter((el) => !el.disabled);

const atraparTab = (evento, referenciaContenedor) => {
  if (evento.key !== 'Tab') return;

  const nodo = referenciaContenedor.current;
  if (!nodo) return;

  const focosables = obtenerFocosables(nodo);
  if (focosables.length === 0) return;

  const primero = focosables[0];
  const ultimo = focosables[focosables.length - 1];

  if (evento.shiftKey && document.activeElement === primero) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && document.activeElement === ultimo) {
    evento.preventDefault();
    primero.focus();
  }
};

export default atraparTab;
