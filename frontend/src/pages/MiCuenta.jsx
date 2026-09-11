import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { EstadoCarga, EstadoError, EstadoVacio } from '../components/EstadosSolicitud.jsx';
import useCargaDatos from '../hooks/useCargaDatos.js';
import ventasApi from '../api/ventas.api.js';
import './MiCuenta.css';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const formateadorFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' });

const ETIQUETAS_ESTADO = {
  registrada: 'Registrada',
  enviada: 'Enviada',
  cancelada: 'Cancelada',
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
        <p><strong>Rol:</strong> {usuario.rol}</p>
      </div>

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
                  {ETIQUETAS_ESTADO[venta.estado] || venta.estado}
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
