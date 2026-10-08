import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { EstadoCarga, EstadoError, EstadoVacio } from '../components/EstadosSolicitud.jsx';
import DireccionForm from '../components/DireccionForm.jsx';
import useCargaDatos from '../hooks/useCargaDatos.js';
import ventasApi from '../api/ventas.api.js';
import clientesApi from '../api/clientes.api.js';
import { etiquetaEstadoVenta } from '../utils/estadosLegibles.js';
import './MiCuenta.css';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const formateadorFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' });

// Dirección guardada (ronda 2, ver docs/frontend-diseno.md): "los clientes
// existentes deben poder completar la dirección posteriormente" — esta es
// esa vía. Muestra un resumen si ya hay una guardada (con "Editar"), o el
// formulario directo si todavía no hay ninguna.
const SeccionDireccion = () => {
  const { datos: direccion, cargando, error, recargar } = useCargaDatos(
    useCallback(() => clientesApi.obtenerDireccion(), []),
  );
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(null);

  const guardar = async (datos) => {
    setGuardando(true);
    setErrorGuardado(null);
    try {
      await clientesApi.guardarDireccion(datos);
      setEditando(false);
      recargar();
    } catch (err) {
      setErrorGuardado(err.message);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <EstadoCarga mensaje="Cargando dirección…" />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;

  if (editando || !direccion) {
    return (
      <div className="tarjeta mi-cuenta__direccion">
        <DireccionForm
          valorInicial={direccion}
          onGuardar={guardar}
          guardando={guardando}
          error={errorGuardado}
          textoConfirmar="Guardar dirección"
        />
        {direccion && (
          <button type="button" className="boton-enlace" onClick={() => setEditando(false)}>
            Cancelar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="tarjeta mi-cuenta__direccion">
      <p>
        {direccion.calle} {direccion.numero}
        {direccion.piso ? `, ${direccion.piso}` : ''}
      </p>
      <p>{direccion.localidad}, {direccion.provincia}</p>
      {direccion.indicaciones && <p className="mi-cuenta__direccion-indicaciones">{direccion.indicaciones}</p>}
      <button type="button" className="boton-enlace" onClick={() => setEditando(true)}>
        Editar dirección
      </button>
    </div>
  );
};

// Consulta de las propias compras (el backend ya filtra por el cliente de
// la sesión: ver GET /api/ventas en venta.service.js). Cancelar desde acá
// reutiliza exactamente el mismo endpoint que usa el panel de personal
// (PATCH /:id/cancelar); la única diferencia es que el backend valida que
// la venta sea del propio cliente.
const MiCuenta = () => {
  const { usuario } = useAuth();
  const { datos: ventas, cargando, error, recargar } = useCargaDatos(useCallback(() => ventasApi.listar(), []));

  return (
    <div className="pagina contenedor">
      <h1 className="titulo-pagina">Mi cuenta</h1>

      <div className="mi-cuenta__perfil tarjeta">
        {usuario.nombre && (
          <p><strong>Nombre:</strong> {usuario.nombre} {usuario.apellido}</p>
        )}
        <p><strong>Correo:</strong> {usuario.email}</p>
        <p><strong>Rol:</strong> {usuario.rol}</p>
        <Link to="/mis-favoritos" className="boton-enlace">
          Ver mis favoritos
        </Link>
        {usuario.rol === 'vendedor_independiente' && (
          <Link to="/panel" className="boton-enlace">
            Ir a mi tienda
          </Link>
        )}
        {usuario.rol === 'cliente' && (
          <Link to="/quiero-vender" className="boton-enlace">
            Quiero ser vendedor
          </Link>
        )}
      </div>

      <h2 className="mi-cuenta__subtitulo">Mi dirección</h2>
      <SeccionDireccion />

      <h2 className="mi-cuenta__subtitulo">Mis compras</h2>

      {cargando && <EstadoCarga />}
      {error && <EstadoError mensaje={error} onReintentar={recargar} />}
      {!cargando && !error && ventas?.length === 0 && <EstadoVacio mensaje="Todavía no tenés compras." />}

      {!cargando && !error && ventas?.length > 0 && (
        <ul className="mi-cuenta__lista">
          {ventas.map((venta) => (
            <li key={venta.idVenta} className="mi-cuenta__item tarjeta">
              <Link to={`/mis-compras/${venta.idVenta}`}>
                <span>#{venta.idVenta} — {formateadorFecha.format(new Date(venta.fecha))}</span>
                <span className={`mi-cuenta__estado mi-cuenta__estado--${venta.estado}`}>
                  {etiquetaEstadoVenta(venta.estado)}
                </span>
                <strong>{formateador.format(Number(venta.total))}</strong>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MiCuenta;
