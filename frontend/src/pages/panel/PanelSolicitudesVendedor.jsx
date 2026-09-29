import { useCallback, useState } from 'react';
import { EstadoCarga, EstadoError, EstadoVacio } from '../../components/EstadosSolicitud.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import useCargaDatos from '../../hooks/useCargaDatos.js';
import solicitudVendedorApi from '../../api/solicitudVendedor.api.js';

const formateadorFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' });

// Revisión de solicitudes "Quiero ser vendedor" (ronda 2, Etapa 8):
// exclusivo administrador — ver tienda.service.js#resolverSolicitudVendedor
// (una decisión de negocio de mayor alcance que resolver una solicitud de
// cancelación, que puede resolver cualquier personal interno).
const PanelSolicitudesVendedor = () => {
  const { datos: solicitudes, cargando, error, recargar } = useCargaDatos(
    useCallback(() => solicitudVendedorApi.listar(), []),
  );

  // Motivo de rechazo por solicitud: un campo de texto inline en la fila
  // (no dentro del ConfirmDialog — su `mensaje` es solo texto, meterle un
  // <input> ahí sería anidar HTML inválido, <div>/<input> dentro de un <p>).
  const [motivosRechazo, setMotivosRechazo] = useState({});
  const [confirmacion, setConfirmacion] = useState(null); // { idSolicitud, decision }
  const [enCurso, setEnCurso] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);

  const pedirAprobar = (idSolicitud) => {
    setErrorAccion(null);
    setConfirmacion({ idSolicitud, decision: 'aprobar' });
  };

  const pedirRechazar = (idSolicitud) => {
    setErrorAccion(null);
    setConfirmacion({ idSolicitud, decision: 'rechazar' });
  };

  const cerrarConfirmacion = () => {
    if (enCurso) return;
    setConfirmacion(null);
    setErrorAccion(null);
  };

  const confirmar = async () => {
    setEnCurso(true);
    setErrorAccion(null);
    try {
      if (confirmacion.decision === 'aprobar') {
        await solicitudVendedorApi.aprobar(confirmacion.idSolicitud);
      } else {
        await solicitudVendedorApi.rechazar(confirmacion.idSolicitud, motivosRechazo[confirmacion.idSolicitud] || undefined);
      }
      setConfirmacion(null);
      recargar();
    } catch (err) {
      setErrorAccion(err.message);
    } finally {
      setEnCurso(false);
    }
  };

  if (cargando) return <EstadoCarga />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;

  const pendientes = (solicitudes || []).filter((s) => s.estado === 'pendiente');
  const resueltas = (solicitudes || []).filter((s) => s.estado !== 'pendiente');

  return (
    <div>
      <h2>Solicitudes para vender en PetShop</h2>

      {pendientes.length === 0 && resueltas.length === 0 && <EstadoVacio mensaje="No hay solicitudes." />}

      {pendientes.length > 0 && (
        <>
          <h3>Pendientes</h3>
          <div className="gestion-entidad__tabla-scroll">
            <table className="gestion-entidad__tabla">
              <thead>
                <tr>
                  <th>Solicitante</th>
                  <th>Tienda</th>
                  <th>Documento</th>
                  <th>Fecha</th>
                  <th>Motivo si se rechaza (opcional)</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {pendientes.map((s) => (
                  <tr key={s.idSolicitud}>
                    <td>{s.usuario?.cliente?.nombre} {s.usuario?.cliente?.apellido} ({s.usuario?.email})</td>
                    <td>{s.nombreTienda}</td>
                    <td>{s.tipoDocumento} {s.numeroDocumento}{s.razonSocial ? ` — ${s.razonSocial}` : ''}</td>
                    <td>{formateadorFecha.format(new Date(s.creadoEn))}</td>
                    <td>
                      <input
                        type="text"
                        aria-label={`Motivo de rechazo para la solicitud de ${s.nombreTienda}`}
                        value={motivosRechazo[s.idSolicitud] || ''}
                        onChange={(e) => setMotivosRechazo((actual) => ({ ...actual, [s.idSolicitud]: e.target.value }))}
                      />
                    </td>
                    <td className="gestion-entidad__acciones">
                      <button type="button" className="boton-enlace" onClick={() => pedirAprobar(s.idSolicitud)}>
                        Aprobar
                      </button>
                      <button type="button" className="boton-enlace" onClick={() => pedirRechazar(s.idSolicitud)}>
                        Rechazar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {resueltas.length > 0 && (
        <>
          <h3>Resueltas</h3>
          <div className="gestion-entidad__tabla-scroll">
            <table className="gestion-entidad__tabla">
              <thead>
                <tr>
                  <th>Solicitante</th>
                  <th>Tienda</th>
                  <th>Estado</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {resueltas.map((s) => (
                  <tr key={s.idSolicitud}>
                    <td>{s.usuario?.cliente?.nombre} {s.usuario?.cliente?.apellido}</td>
                    <td>{s.nombreTienda}</td>
                    <td>{s.estado}</td>
                    <td>{s.motivoRechazo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        abierto={confirmacion?.decision === 'aprobar'}
        titulo="¿Aprobar esta solicitud?"
        mensaje="Se crea la tienda y la cuenta pasa a ser vendedor independiente."
        textoConfirmar="Aprobar"
        textoCancelar="Volver"
        cargando={enCurso}
        error={errorAccion}
        onConfirmar={confirmar}
        onCancelar={cerrarConfirmacion}
      />

      <ConfirmDialog
        abierto={confirmacion?.decision === 'rechazar'}
        titulo="¿Rechazar esta solicitud?"
        mensaje="La cuenta se queda como cliente y puede volver a solicitarlo más adelante."
        textoConfirmar="Rechazar"
        textoCancelar="Volver"
        peligro
        cargando={enCurso}
        error={errorAccion}
        onConfirmar={confirmar}
        onCancelar={cerrarConfirmacion}
      />
    </div>
  );
};

export default PanelSolicitudesVendedor;
