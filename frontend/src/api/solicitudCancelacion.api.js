import { solicitar } from './httpClient.js';

// Solicitud de cancelación (CU-04, corrección): recurso propio, no anidado
// bajo /ventas (mismo criterio que compras.api.js) — ver
// backend/src/routes/solicitudCancelacion.routes.js.
const crear = (idVenta) => solicitar('/solicitudes-cancelacion', { metodo: 'POST', cuerpo: { idVenta } });

const aprobar = (idSolicitud) =>
  solicitar(`/solicitudes-cancelacion/${idSolicitud}/aprobar`, { metodo: 'PATCH' });

const rechazar = (idSolicitud, motivoRechazo) =>
  solicitar(`/solicitudes-cancelacion/${idSolicitud}/rechazar`, {
    metodo: 'PATCH',
    cuerpo: motivoRechazo ? { motivoRechazo } : {},
  });

export default { crear, aprobar, rechazar };
