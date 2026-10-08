import { solicitar } from './httpClient.js';

// "Quiero ser vendedor" (ronda 2, Etapa 8): solo cuentas 'cliente' pueden
// crear (ver backend/src/routes/solicitudVendedor.routes.js); listar y
// resolver son exclusivos de administrador.
const crear = (datos) => solicitar('/solicitudes-vendedor', { metodo: 'POST', cuerpo: datos });
const listar = () => solicitar('/solicitudes-vendedor');
const aprobar = (idSolicitud) => solicitar(`/solicitudes-vendedor/${idSolicitud}/aprobar`, { metodo: 'PATCH' });
const rechazar = (idSolicitud, motivoRechazo) =>
  solicitar(`/solicitudes-vendedor/${idSolicitud}/rechazar`, { metodo: 'PATCH', cuerpo: { motivoRechazo } });

export default { crear, listar, aprobar, rechazar };
