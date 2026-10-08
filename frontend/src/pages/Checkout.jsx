import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCarrito } from '../hooks/useCarrito.js';
import { useAuth } from '../hooks/useAuth.js';
import { EstadoCarga, EstadoError } from '../components/EstadosSolicitud.jsx';
import comprasApi from '../api/compras.api.js';
import clientesApi from '../api/clientes.api.js';
import useCargaDatos from '../hooks/useCargaDatos.js';
import { obtenerOCrearClave, obtenerIntentoGuardado, limpiarClave } from '../utils/claveIdempotencia.js';
import { TARJETAS_DEBITO_SIMULADAS } from '../utils/tarjetasSimuladas.js';
import './Checkout.css';

// Dirección guardada -> un único string legible para pre-llenar el campo
// de texto libre del checkout (que sigue siendo texto libre, sin cambios
// de backend — ver docs/estado-proyecto.md, revisión de diseño de esta
// etapa): "permitir corregir o elegir otra" se resuelve dejando ese texto
// totalmente editable, no con una lista de direcciones para elegir.
const formatearDireccionGuardada = (direccion) => {
  if (!direccion) return '';
  const partes = [`${direccion.calle} ${direccion.numero}`.trim()];
  if (direccion.piso) partes.push(direccion.piso);
  partes.push(direccion.localidad, direccion.provincia);
  return partes.filter(Boolean).join(', ');
};

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const formatearCentavos = (centavos) => formateador.format(centavos / 100);
const LONGITUD_MINIMA_DIRECCION = 8;

// Formato MM/AA; la vigencia real (no vencida) la vuelve a comprobar el
// backend, acá solo se valida la forma para dar el error rápido al lado
// del campo.
const PATRON_VENCIMIENTO = /^(0[1-9]|1[0-2])\/\d{2}$/;

const validarCamposDebito = (datosDebito) => {
  const errores = {};

  if (!/^\d{16}$/.test(datosDebito.numero.replace(/\s+/g, ''))) {
    errores.numero = 'Debe tener 16 dígitos';
  }
  if (datosDebito.titular.trim().length < 2) {
    errores.titular = 'Ingresá el nombre del titular';
  }
  if (!PATRON_VENCIMIENTO.test(datosDebito.vencimiento.trim())) {
    errores.vencimiento = 'Formato MM/AA';
  }
  if (!/^\d{3,4}$/.test(datosDebito.codigoSeguridad.trim())) {
    errores.codigoSeguridad = '3 o 4 dígitos';
  }

  return errores;
};

// Checkout de cliente con pago simulado (CU-04): cotiza contra el backend
// (nunca confía en el precio mostrado en el carrito), pide transferencia o
// débito simulados, y reconfirma automáticamente si la cotización aceptada
// quedó desactualizada (precio o promoción cambiaron) antes de registrar
// nada.
//
// Recuperación tras perder la respuesta (CU-04, §1, ronda de correcciones):
// antes de exigir una cotización nueva, si hay un intento guardado para
// este usuario y este carrito (ver utils/claveIdempotencia.js), se consulta
// su resultado (GET /api/compras/intentos/:clave, de solo lectura — NUNCA
// reemplaza el camino atómico de la confirmación real):
//   - aprobado  → se navega directo al comprobante, sin volver a cotizar ni
//     pedir datos de pago (aunque el stock haya llegado a cero mientras
//     tanto: la compra ya existe).
//   - rechazado → se muestra el motivo y un botón EXPLÍCITO para iniciar un
//     intento nuevo (nunca automático).
//   - procesando / no encontrado (ambiguo: puede ser que la transacción
//     original todavía no comiteó) → se sigue el flujo normal,
//     REUTILIZANDO la misma clave, nunca generando una nueva a ciegas.
// `usuario` llega ya resuelto desde el wrapper Checkout, más abajo: nunca
// null acá adentro. Separarlo así (en vez de leer useAuth() directamente en
// este componente) permite que metodoEntrega/direccionEntrega se
// inicialicen leyendo el intento guardado DURANTE el primer render (con un
// inicializador perezoso de useState), en vez de en un efecto — evita el
// patrón "setState síncrono dentro de un efecto solo para sincronizar un
// valor inicial" (ver react-hooks/set-state-in-effect y
// https://react.dev/learn/you-might-not-need-an-effect).
const CheckoutInterno = ({ usuario, direccionGuardada }) => {
  const { carrito, vaciarCarrito } = useCarrito();
  const navegar = useNavigate();

  const [cotizacion, setCotizacion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [intentoRechazadoPrevio, setIntentoRechazadoPrevio] = useState(null);

  const [metodoEntrega, setMetodoEntrega] = useState(
    () => obtenerIntentoGuardado(usuario.idCliente, carrito.aDetallesVenta())?.entrega?.metodoEntrega
      || 'retiro en sucursal',
  );
  const [direccionEntrega, setDireccionEntrega] = useState(
    () =>
      obtenerIntentoGuardado(usuario.idCliente, carrito.aDetallesVenta())?.entrega?.direccionEntrega ||
      formatearDireccionGuardada(direccionGuardada),
  );
  const [tipoPago, setTipoPago] = useState('transferencia');
  const [datosDebito, setDatosDebito] = useState({
    numero: '',
    titular: '',
    vencimiento: '',
    codigoSeguridad: '',
  });
  const [erroresDebito, setErroresDebito] = useState({});

  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  const [avisoCotizacionActualizada, setAvisoCotizacionActualizada] = useState(false);
  const [resultadoRechazo, setResultadoRechazo] = useState(null);

  // No pone `cargando` en true acá adentro (a propósito: quien llama desde
  // DENTRO del efecto de montaje lo deja como está — ya empieza en `true`,
  // ver useState más arriba — para no disparar un setState síncrono extra
  // dentro del cuerpo del efecto; quien llama desde un manejador de evento,
  // como iniciarIntentoNuevo más abajo, sí lo hace explícitamente antes).
  const cargarCotizacion = (detalles) => {
    comprasApi
      .cotizar(detalles)
      .then(setCotizacion)
      .catch((err) => setErrorCarga(err.message))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    if (carrito.estaVacio) {
      navegar('/carrito', { replace: true });
      return;
    }

    const detalles = carrito.aDetallesVenta();
    const guardado = obtenerIntentoGuardado(usuario.idCliente, detalles);

    if (!guardado) {
      cargarCotizacion(detalles);
      return;
    }

    // La entrega ya se prellenó arriba, en el inicializador perezoso de
    // metodoEntrega/direccionEntrega — acá solo queda consultar el estado
    // del intento.
    let vigente = true;

    comprasApi
      .consultarIntento(guardado.clave)
      .then((resultado) => {
        if (!vigente) return;

        if (resultado.estado === 'aprobado') {
          limpiarClave();
          vaciarCarrito();
          navegar(`/mis-compras/${resultado.idVenta}`, { replace: true, state: { reciénConfirmada: true } });
          return;
        }

        if (resultado.estado === 'rechazado') {
          setIntentoRechazadoPrevio({ motivoRechazo: resultado.motivoRechazo });
          setCargando(false);
          return;
        }

        // 'procesando', o no encontrado (encontrado: false): resultado
        // ambiguo, no se interpreta como "no hay ningún conflicto posible".
        // Se sigue el flujo normal reutilizando la misma clave guardada.
        cargarCotizacion(detalles);
      })
      .catch(() => {
        // Sin poder confirmar el estado del intento previo (p. ej. sin
        // conexión): se sigue igual, reutilizando la misma clave guardada,
        // nunca generando una nueva a ciegas.
        if (vigente) cargarCotizacion(detalles);
      });

    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iniciarIntentoNuevo = () => {
    limpiarClave();
    setIntentoRechazadoPrevio(null);
    setCargando(true); // manejador de evento, no un efecto: seguro llamarlo acá.
    cargarCotizacion(carrito.aDetallesVenta());
  };

  const esEnvioADomicilio = metodoEntrega === 'envío a domicilio';
  const direccionInvalida = esEnvioADomicilio && direccionEntrega.trim().length < LONGITUD_MINIMA_DIRECCION;

  const confirmarCompra = async (evento) => {
    evento.preventDefault();
    if (enviando || direccionInvalida || !cotizacion) return;

    if (tipoPago === 'debito') {
      const errores = validarCamposDebito(datosDebito);
      setErroresDebito(errores);
      if (Object.keys(errores).length > 0) return;
    }

    setEnviando(true);
    setErrorEnvio(null);
    setAvisoCotizacionActualizada(false);
    setResultadoRechazo(null);

    const detalles = carrito.aDetallesVenta();
    const entrega = {
      metodoEntrega,
      direccionEntrega: esEnvioADomicilio ? direccionEntrega.trim() : undefined,
    };

    try {
      // Éxito (201): el cuerpo es directamente la Venta ya confirmada —
      // ver compra.controller.js. Un rechazo simulado (402) o un conflicto
      // (409) llegan como error, no como respuesta exitosa (manejados
      // abajo, en el catch).
      const venta = await comprasApi.confirmar({
        claveIdempotencia: obtenerOCrearClave(usuario.idCliente, detalles, entrega),
        detalles,
        ...entrega,
        tipoPagoSimulado: tipoPago,
        datosDebito: tipoPago === 'debito' ? datosDebito : undefined,
        cotizacionAceptada: cotizacion,
      });

      limpiarClave();
      vaciarCarrito();
      navegar(`/mis-compras/${venta.idVenta}`, { replace: true, state: { reciénConfirmada: true } });
    } catch (error) {
      if (error.status === 402) {
        // Rechazo simulado (compra.controller.js): no hay compra que
        // mostrar. Se limpia la clave — un reintento (con otra tarjeta,
        // seguramente) es un intento nuevo, no una repetición del mismo
        // (ver utils/claveIdempotencia.js).
        limpiarClave();
        setResultadoRechazo(error.datos?.motivoRechazo || error.message);
        setEnviando(false);
        return;
      }

      if (error.status === 409 && error.datos?.codigo === 'COTIZACION_DESACTUALIZADA') {
        // El backend ya revirtió todo: la MISMA clave sigue siendo válida
        // para reintentar con esta cotización nueva (ver
        // utils/claveIdempotencia.js).
        setCotizacion(error.datos.cotizacionVigente);
        setAvisoCotizacionActualizada(true);
        setEnviando(false);
        return;
      }

      // Errores esperables acá: stock insuficiente (cambió desde que se
      // cotizó) o la clave ya usada con otro contenido; se muestran tal
      // cual los devuelve el backend, que es la fuente de verdad.
      setErrorEnvio(error.message);
      setEnviando(false);
    }
  };

  if (cargando) return <div className="pagina contenedor"><EstadoCarga mensaje="Verificando tu compra…" /></div>;
  // P. ej. un producto que dejó de estar disponible (tienda suspendida): el
  // carrito no se toca solo, se ofrece volver para quitarlo.
  if (errorCarga) {
    return (
      <div className="pagina contenedor">
        <EstadoError mensaje={errorCarga} />
        <Link to="/carrito" className="boton boton-secundario">
          Volver al carrito
        </Link>
      </div>
    );
  }

  if (intentoRechazadoPrevio) {
    return (
      <div className="pagina contenedor checkout">
        <h1 className="titulo-pagina">Confirmar compra</h1>
        <EstadoError
          mensaje={`Un intento de compra anterior con este carrito fue rechazado (simulado): ${intentoRechazadoPrevio.motivoRechazo}.`}
        />
        <button type="button" className="boton boton-primario" onClick={iniciarIntentoNuevo}>
          Iniciar un nuevo intento
        </button>
      </div>
    );
  }

  if (!cotizacion) return null;

  return (
    <div className="pagina contenedor checkout">
      <h1 className="titulo-pagina">Confirmar compra</h1>

      <div className="checkout__resumen">
        <h2>Resumen</h2>
        {avisoCotizacionActualizada && (
          <p className="checkout__aviso">
            Los precios cambiaron desde que armaste el pedido. Revisá el resumen actualizado antes de confirmar de nuevo.
          </p>
        )}
        <ul>
          {cotizacion.lineas.map((linea) => (
            <li key={linea.idProducto}>
              <span>{linea.cantidad} × {linea.nombre} — {formatearCentavos(linea.subtotalCentavos)}</span>
              {linea.montoDescuentoCentavos > 0 && (
                <span className="checkout__descuento">
                  {' '}(promoción: -{formatearCentavos(linea.montoDescuentoCentavos * linea.cantidad)})
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="checkout__total" data-testid="checkout-total">
          Total: {formatearCentavos(cotizacion.totalCentavos)}
        </p>
      </div>

      <form className="checkout__formulario" onSubmit={confirmarCompra}>
        <div className="campo">
          <label htmlFor="entrega">Entrega</label>
          <select id="entrega" value={metodoEntrega} onChange={(evento) => setMetodoEntrega(evento.target.value)}>
            <option value="retiro en sucursal">Retiro en sucursal</option>
            <option value="envío a domicilio">Envío a domicilio</option>
          </select>
        </div>

        {esEnvioADomicilio && (
          <div className="campo">
            <label htmlFor="direccionEntrega">Dirección de entrega</label>
            <input
              id="direccionEntrega"
              type="text"
              placeholder="Calle, número, ciudad"
              value={direccionEntrega}
              onChange={(evento) => setDireccionEntrega(evento.target.value)}
              required
              minLength={LONGITUD_MINIMA_DIRECCION}
            />
            {direccionInvalida && direccionEntrega.length > 0 && (
              <span className="checkout__ayuda-campo">
                Ingresá una dirección completa (mínimo {LONGITUD_MINIMA_DIRECCION} caracteres).
              </span>
            )}
          </div>
        )}

        <fieldset className="checkout__pago">
          <legend>Pago simulado — sin validez fiscal, no se procesa ningún pago real</legend>

          <label className="checkout__opcion-pago">
            <input
              type="radio"
              name="tipoPago"
              value="transferencia"
              checked={tipoPago === 'transferencia'}
              onChange={() => setTipoPago('transferencia')}
            />
            Transferencia (simulada — se aprueba automáticamente)
          </label>

          <label className="checkout__opcion-pago">
            <input
              type="radio"
              name="tipoPago"
              value="debito"
              checked={tipoPago === 'debito'}
              onChange={() => setTipoPago('debito')}
            />
            Débito (simulado)
          </label>

          {tipoPago === 'debito' && (
            <div className="checkout__datos-debito">
              <p className="checkout__ayuda-campo checkout__ayuda-campo--info">
                Tarjetas de prueba: {TARJETAS_DEBITO_SIMULADAS.map((t) => `${t.numero} (${t.resultado})`).join(' · ')}
              </p>

              <div className="campo">
                <label htmlFor="numeroTarjeta">Número de tarjeta</label>
                <input
                  id="numeroTarjeta"
                  type="text"
                  inputMode="numeric"
                  maxLength={19}
                  value={datosDebito.numero}
                  onChange={(evento) => setDatosDebito((d) => ({ ...d, numero: evento.target.value }))}
                />
                {erroresDebito.numero && <span className="checkout__ayuda-campo">{erroresDebito.numero}</span>}
              </div>

              <div className="campo">
                <label htmlFor="titularTarjeta">Titular</label>
                <input
                  id="titularTarjeta"
                  type="text"
                  value={datosDebito.titular}
                  onChange={(evento) => setDatosDebito((d) => ({ ...d, titular: evento.target.value }))}
                />
                {erroresDebito.titular && <span className="checkout__ayuda-campo">{erroresDebito.titular}</span>}
              </div>

              <div className="campo campo--linea">
                <div>
                  <label htmlFor="vencimientoTarjeta">Vencimiento (MM/AA)</label>
                  <input
                    id="vencimientoTarjeta"
                    type="text"
                    placeholder="12/30"
                    maxLength={5}
                    value={datosDebito.vencimiento}
                    onChange={(evento) => setDatosDebito((d) => ({ ...d, vencimiento: evento.target.value }))}
                  />
                  {erroresDebito.vencimiento && <span className="checkout__ayuda-campo">{erroresDebito.vencimiento}</span>}
                </div>

                <div>
                  <label htmlFor="cvvTarjeta">Código de seguridad</label>
                  <input
                    id="cvvTarjeta"
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={datosDebito.codigoSeguridad}
                    onChange={(evento) => setDatosDebito((d) => ({ ...d, codigoSeguridad: evento.target.value }))}
                  />
                  {erroresDebito.codigoSeguridad && (
                    <span className="checkout__ayuda-campo">{erroresDebito.codigoSeguridad}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </fieldset>

        {resultadoRechazo && (
          <EstadoError mensaje={`Pago rechazado (simulado): ${resultadoRechazo}. Probá con otra tarjeta.`} />
        )}
        {errorEnvio && <EstadoError mensaje={errorEnvio} />}

        <button
          type="submit"
          className="boton boton-primario"
          disabled={enviando || direccionInvalida}
        >
          {enviando ? 'Confirmando…' : 'Confirmar y pagar'}
        </button>
      </form>
    </div>
  );
};

// Wrapper: espera a que la sesión Y la dirección guardada (si hay alguna)
// estén resueltas antes de montar CheckoutInterno, que asume ambas ya
// disponibles en el primer render (necesita usuario.idCliente y
// direccionGuardada YA resueltos para los inicializadores perezosos de
// metodoEntrega/direccionEntrega — ver el comentario grande más arriba
// sobre por qué esto se hace con un inicializador perezoso, no un efecto).
// Un fallo al pedir la dirección guardada (red, Georef caído, lo que sea)
// se trata igual que "no hay ninguna guardada": el checkout nunca debe
// quedar bloqueado por esto, el campo de texto libre sigue funcionando
// igual que siempre. En la app real, Checkout solo se monta dentro de
// RutaProtegida (roles=['cliente']), que ya espera la sesión — este
// wrapper no depende de ese orden implícito.
const Checkout = () => {
  const { usuario } = useAuth();
  const { datos: direccionGuardada, cargando: cargandoDireccion } = useCargaDatos(
    useCallback(() => clientesApi.obtenerDireccion().catch(() => null), []),
  );

  if (!usuario || cargandoDireccion) {
    return <div className="pagina contenedor"><EstadoCarga mensaje="Verificando sesión…" /></div>;
  }

  return <CheckoutInterno usuario={usuario} direccionGuardada={direccionGuardada} />;
};

export default Checkout;
