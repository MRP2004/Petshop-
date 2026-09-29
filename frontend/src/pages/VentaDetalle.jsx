import { useCallback, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { EstadoCarga, EstadoError } from '../components/EstadosSolicitud.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import useCargaDatos from '../hooks/useCargaDatos.js';
import ventasApi from '../api/ventas.api.js';
import solicitudCancelacionApi from '../api/solicitudCancelacion.api.js';
import { etiquetaEstadoPago, etiquetaEstadoVenta, etiquetaEstadoCorreo } from '../utils/estadosLegibles.js';
import './VentaDetalle.css';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
// hour12:false y timeZone explícitos (CU-04, ronda de correcciones — misma
// corrección que backend/src/utils/formato.js): no depender del reloj de
// 12 horas por defecto de la configuración regional, ni de la zona horaria
// del dispositivo, para que la hora coincida con la que muestra el PDF.
const formateadorFecha = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: false,
  timeZone: 'America/Argentina/Buenos_Aires',
});

// Detalle de una venta: fecha, cliente, medio de pago, cada producto
// comprado con cantidad y precio (requisito de la propuesta: el detalle de
// un listado de ventas debe mostrar información de al menos 2 clases de
// negocio, acá son Venta + Cliente + Producto). Se usa tanto desde "Mis
// compras" (cliente) como desde el panel (personal); el backend decide en
// cada caso si el usuario puede verla (ownership check en venta.service.js).
// El wrapper de más abajo la monta con key={id} para que, al navegar entre
// ventas, el estado de "acción en curso" arranque limpio sin necesitar un
// efecto de reseteo.
// "Terminada en" en vez del número completo: es lo único que persiste el
// backend del pago simulado (ver backend/src/models/pago.model.js) — nunca
// hay un número completo que mostrar acá, ni falta que hace.
// Mismo criterio que el PDF/correo (CU-04, ronda de correcciones — revisión
// independiente, Codex): si el cliente edita su nombre después de comprar,
// esta pantalla no debe mostrar un nombre distinto del que ya tiene
// impreso el comprobante de ESA MISMA venta — usa la instantánea histórica
// cuando existe (comprobantes emitidos por el checkout desde esta
// corrección en adelante), y el dato actual del cliente como respaldo para
// ventas sin comprobante o comprobantes anteriores a esta corrección.
const nombreComprador = (venta) => {
  const nombre = venta.comprobante?.nombreCompradorHistorico ?? venta.cliente?.nombre;
  const apellido = venta.comprobante?.apellidoCompradorHistorico ?? venta.cliente?.apellido;
  return { nombre, apellido };
};

const descripcionMedioPago = (venta) => {
  if (!venta.pago) return venta.medioPago?.nombre; // venta anterior o carga manual: sin pago simulado.
  if (venta.pago.tipo === 'debito') return `Débito simulado, terminada en ${venta.pago.ultimosCuatroDigitos}`;
  return 'Transferencia simulada';
};

// Solicitud de cancelación (CU-04, corrección — revisión de Mauro sobre la
// venta #20: "el cliente ya no puede ejecutar una cancelación directa"): la
// más reciente manda, tanto para saber si hay una pendiente (bloquea una
// solicitud nueva, ver backend/src/services/solicitudCancelacion.service.js)
// como para mostrarle al cliente el motivo si la última fue rechazada.
const ultimaSolicitud = (venta) => {
  const solicitudes = venta.solicitudesCancelacion || [];
  if (solicitudes.length === 0) return null;
  return [...solicitudes].sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn))[0];
};

const VentaDetalleContenido = ({ id }) => {
  const ubicacion = useLocation();
  const { esCliente, esPersonal } = useAuth();
  const { datos: venta, setDatos: setVenta, cargando, error, recargar } = useCargaDatos(
    useCallback(() => ventasApi.obtener(id), [id]),
  );

  const [accionEnCurso, setAccionEnCurso] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [reenviandoCorreo, setReenviandoCorreo] = useState(false);
  const [avisoCorreo, setAvisoCorreo] = useState(null);
  const [solicitandoCancelacion, setSolicitandoCancelacion] = useState(false);
  const [resolviendoSolicitud, setResolviendoSolicitud] = useState(false);
  // Ronda 2: reemplaza los window.confirm de cancelar/aprobar por
  // ConfirmDialog (ver docs/frontend-diseno.md). null = ningún diálogo
  // abierto; 'cancelar'/'aprobar' identifican cuál. El error de la acción
  // confirmada se muestra DENTRO del diálogo (no cierra solo si falla, así
  // se puede reintentar sin perder el contexto), separado de errorAccion
  // (que sigue siendo para las acciones sin confirmación: PDF, correo,
  // rechazar, marcar enviada).
  const [confirmacion, setConfirmacion] = useState(null);
  const [errorConfirmacion, setErrorConfirmacion] = useState(null);
  const [idSolicitudAAprobar, setIdSolicitudAAprobar] = useState(null);

  const descargarPdf = async () => {
    setDescargandoPdf(true);
    setErrorAccion(null);
    try {
      const { blob, nombreSugerido } = await ventasApi.descargarComprobantePdf(id);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombreSugerido || `comprobante-venta-${id}.pdf`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorAccion(err.message);
    } finally {
      setDescargandoPdf(false);
    }
  };

  const reenviarCorreo = async () => {
    setReenviandoCorreo(true);
    setErrorAccion(null);
    setAvisoCorreo(null);
    try {
      const { estadoCorreo } = await ventasApi.reenviarCorreoComprobante(id);
      setAvisoCorreo(
        estadoCorreo === 'aceptado' || estadoCorreo === 'simulado'
          ? `Comprobante reenviado (${etiquetaEstadoCorreo(estadoCorreo).toLowerCase()}).`
          : `No se pudo confirmar el reenvío del comprobante por correo (${etiquetaEstadoCorreo(estadoCorreo).toLowerCase()}); podés reintentar en unos minutos.`,
      );
      recargar();
    } catch (err) {
      setErrorAccion(err.message);
    } finally {
      setReenviandoCorreo(false);
    }
  };

  const cerrarConfirmacion = () => {
    if (accionEnCurso || resolviendoSolicitud) return; // acción ya en vuelo: no se puede abortar a mitad de camino
    setConfirmacion(null);
    setErrorConfirmacion(null);
  };

  // Cancelación DIRECTA: exclusiva del personal desde esta corrección (ver
  // backend/src/services/venta.service.js#cancelarVenta) — con confirmación
  // explícita antes de ejecutarla (CU-04, corrección: "agregá una
  // confirmación visible antes de ejecutar esa acción"), mismo patrón que
  // GestionEntidad.jsx#eliminar (ConfirmDialog, no window.confirm — ronda 2).
  const pedirCancelar = () => {
    setErrorConfirmacion(null);
    setConfirmacion('cancelar');
  };

  const confirmarCancelar = async () => {
    setAccionEnCurso(true);
    setErrorConfirmacion(null);
    try {
      setVenta(await ventasApi.cancelar(id));
      setConfirmacion(null);
    } catch (err) {
      setErrorConfirmacion(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  };

  const marcarComoEnviada = async () => {
    setAccionEnCurso(true);
    setErrorAccion(null);
    try {
      setVenta(await ventasApi.marcarComoEnviada(id));
    } catch (err) {
      setErrorAccion(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  };

  // Ronda 2, Etapa 7: confirma el hito operativo siguiente, ya sea que la
  // venta esté 'enviada' (envío a domicilio) o 'lista_para_retirar' (retiro
  // en sucursal) — el backend acepta las dos como origen válido (ver
  // venta.service.js#marcarVentaComoEntregada).
  const marcarComoEntregada = async () => {
    setAccionEnCurso(true);
    setErrorAccion(null);
    try {
      setVenta(await ventasApi.marcarComoEntregada(id));
    } catch (err) {
      setErrorAccion(err.message);
    } finally {
      setAccionEnCurso(false);
    }
  };

  // Solicitud de cancelación (cliente): NO cancela nada por sí sola — solo
  // deja la solicitud registrada para que el personal la apruebe o la
  // rechace (ver backend/src/services/solicitudCancelacion.service.js).
  const solicitarCancelacion = async () => {
    setSolicitandoCancelacion(true);
    setErrorAccion(null);
    try {
      setVenta(await solicitudCancelacionApi.crear(venta.idVenta));
    } catch (err) {
      setErrorAccion(err.message);
    } finally {
      setSolicitandoCancelacion(false);
    }
  };

  const pedirAprobar = (idSolicitud) => {
    setErrorConfirmacion(null);
    setIdSolicitudAAprobar(idSolicitud);
    setConfirmacion('aprobar');
  };

  const confirmarAprobar = async () => {
    setResolviendoSolicitud(true);
    setErrorConfirmacion(null);
    try {
      setVenta(await solicitudCancelacionApi.aprobar(idSolicitudAAprobar));
      setConfirmacion(null);
    } catch (err) {
      setErrorConfirmacion(err.message);
    } finally {
      setResolviendoSolicitud(false);
    }
  };

  const rechazarSolicitud = async (idSolicitud) => {
    setResolviendoSolicitud(true);
    setErrorAccion(null);
    try {
      setVenta(await solicitudCancelacionApi.rechazar(idSolicitud));
    } catch (err) {
      setErrorAccion(err.message);
    } finally {
      setResolviendoSolicitud(false);
    }
  };

  if (cargando) return <div className="pagina contenedor"><EstadoCarga /></div>;
  if (error) return <div className="pagina contenedor"><EstadoError mensaje={error} onReintentar={recargar} /></div>;
  if (!venta) return null;

  const volverA = esPersonal ? '/panel/ventas' : '/mi-cuenta';
  const solicitud = ultimaSolicitud(venta);
  const solicitudPendiente = solicitud?.estado === 'pendiente' ? solicitud : null;

  return (
    <div className="pagina contenedor venta-detalle">
      <Link to={volverA} className="boton-enlace">← Volver</Link>

      {ubicacion.state?.reciénConfirmada && (
        <p className="venta-detalle__confirmacion">
          ¡Compra confirmada! Número de operación: #{venta.idVenta}
        </p>
      )}

      <h1 className="titulo-pagina">Venta #{venta.idVenta}</h1>

      <div className="venta-detalle__resumen tarjeta">
        {venta.comprobante && <p><strong>Comprobante:</strong> {venta.comprobante.numero}</p>}
        <p><strong>Fecha:</strong> {formateadorFecha.format(new Date(venta.fecha))}</p>
        <p><strong>Estado del pedido:</strong> {etiquetaEstadoVenta(venta.estado)}</p>
        <p><strong>Cliente:</strong> {nombreComprador(venta).nombre} {nombreComprador(venta).apellido}</p>
        <p><strong>Medio de pago:</strong> {descripcionMedioPago(venta)}</p>
        {venta.pago && <p><strong>Estado del pago:</strong> {etiquetaEstadoPago(venta.pago.estado)}</p>}
        {venta.metodoEntrega && <p><strong>Entrega:</strong> {venta.metodoEntrega}</p>}
        {venta.direccionEntrega?.direccion && (
          <p><strong>Dirección de entrega:</strong> {venta.direccionEntrega.direccion}</p>
        )}
        {venta.descuento && <p><strong>Descuento:</strong> {formateador.format(Number(venta.descuento))}</p>}
        <p className="venta-detalle__total"><strong>Total:</strong> {formateador.format(Number(venta.total))}</p>
        {venta.comprobante && (
          <p className="venta-detalle__leyenda">Comprobante de demostración — sin validez fiscal</p>
        )}
      </div>

      <h2 className="venta-detalle__subtitulo">Productos</h2>
      <ul className="venta-detalle__detalles">
        {venta.detalles?.map((detalle) => {
          const historico = detalle.promocionAplicada;
          return (
            <li key={detalle.idDetalleVenta} className="tarjeta">
              <span>{detalle.cantidad} × {historico?.nombreProductoHistorico || detalle.producto?.nombre}</span>
              <span>{formateador.format(Number(detalle.precioUnitario))} c/u</span>
              <strong>{formateador.format(Number(detalle.subtotal))}</strong>
              {historico && Number(historico.montoDescuentoUnitario) > 0 && (
                <span className="venta-detalle__promocion">
                  Precio de lista {formateador.format(Number(historico.precioListaUnitario))} · promoción -{historico.porcentajeDescuento}%
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {errorAccion && <EstadoError mensaje={errorAccion} />}
      {avisoCorreo && <p className="venta-detalle__aviso-correo">{avisoCorreo}</p>}

      {/* Solicitud de cancelación (CU-04, corrección): visible para el
          cliente dueño (su propia solicitud) y para el personal (para
          poder resolverla, ver los botones más abajo). No es una
          devolución de un pedido ya entregado — ver
          docs/cu04-checkout-pago.md, "Solicitud de cancelación vs.
          devolución": esa es una acción distinta, que todavía no existe. */}
      {solicitudPendiente && (
        <p className="venta-detalle__aviso-solicitud">
          Solicitud de cancelación {esCliente ? 'enviada, pendiente de revisión' : 'pendiente de tu revisión'}
          {' '}({formateadorFecha.format(new Date(solicitudPendiente.creadoEn))}).
        </p>
      )}
      {esCliente && !solicitudPendiente && solicitud?.estado === 'rechazada' && (
        <p className="venta-detalle__aviso-solicitud">
          Tu solicitud de cancelación anterior fue rechazada
          {solicitud.motivoRechazo ? `: ${solicitud.motivoRechazo}` : '.'}
        </p>
      )}

      <div className="venta-detalle__acciones">
        {esPersonal && venta.estado === 'registrada' && (
          <button type="button" className="boton boton-peligro" onClick={pedirCancelar} disabled={accionEnCurso}>
            {accionEnCurso ? 'Cancelando…' : 'Cancelar venta'}
          </button>
        )}

        {esCliente && venta.estado === 'registrada' && !solicitudPendiente && (
          <button
            type="button"
            className="boton boton-peligro"
            onClick={solicitarCancelacion}
            disabled={solicitandoCancelacion}
          >
            {solicitandoCancelacion ? 'Enviando…' : 'Solicitar cancelación'}
          </button>
        )}

        {esPersonal && solicitudPendiente && (
          <>
            <button
              type="button"
              className="boton boton-peligro"
              onClick={() => pedirAprobar(solicitudPendiente.idSolicitud)}
              disabled={resolviendoSolicitud}
            >
              {resolviendoSolicitud ? 'Procesando…' : 'Aprobar solicitud de cancelación'}
            </button>
            <button
              type="button"
              className="boton boton-secundario"
              onClick={() => rechazarSolicitud(solicitudPendiente.idSolicitud)}
              disabled={resolviendoSolicitud}
            >
              {resolviendoSolicitud ? 'Procesando…' : 'Rechazar solicitud de cancelación'}
            </button>
          </>
        )}

        {esPersonal && venta.estado === 'registrada' && (
          <button type="button" className="boton boton-primario" onClick={marcarComoEnviada} disabled={accionEnCurso}>
            {accionEnCurso
              ? 'Actualizando…'
              : venta.metodoEntrega === 'retiro en sucursal'
                ? 'Marcar lista para retirar'
                : 'Marcar como enviada'}
          </button>
        )}

        {esPersonal && (venta.estado === 'enviada' || venta.estado === 'lista_para_retirar') && (
          <button type="button" className="boton boton-primario" onClick={marcarComoEntregada} disabled={accionEnCurso}>
            {accionEnCurso ? 'Actualizando…' : 'Marcar como entregada'}
          </button>
        )}

        {venta.comprobante && (
          <>
            <button type="button" className="boton" onClick={descargarPdf} disabled={descargandoPdf}>
              {descargandoPdf ? 'Descargando…' : 'Descargar comprobante (PDF)'}
            </button>

            {venta.comprobante.estadoCorreo !== 'no_aplica' && (
              <button type="button" className="boton" onClick={reenviarCorreo} disabled={reenviandoCorreo}>
                {reenviandoCorreo
                  ? 'Reenviando…'
                  : `Reenviar por correo (${etiquetaEstadoCorreo(venta.comprobante.estadoCorreo)})`}
              </button>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        abierto={confirmacion === 'cancelar'}
        titulo={`¿Cancelar la venta #${venta.idVenta}?`}
        mensaje="Se restituye el stock vendido y no se puede deshacer."
        textoConfirmar="Cancelar venta"
        textoCancelar="Volver"
        peligro
        cargando={accionEnCurso}
        error={errorConfirmacion}
        onConfirmar={confirmarCancelar}
        onCancelar={cerrarConfirmacion}
      />

      <ConfirmDialog
        abierto={confirmacion === 'aprobar'}
        titulo="¿Aprobar la solicitud de cancelación?"
        mensaje="Se cancela la venta, se restituye el stock y se revierte el pago simulado."
        textoConfirmar="Aprobar solicitud de cancelación"
        textoCancelar="Volver"
        peligro
        cargando={resolviendoSolicitud}
        error={errorConfirmacion}
        onConfirmar={confirmarAprobar}
        onCancelar={cerrarConfirmacion}
      />
    </div>
  );
};

const VentaDetalle = () => {
  const { id } = useParams();
  return <VentaDetalleContenido key={id} id={id} />;
};

export default VentaDetalle;
