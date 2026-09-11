import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { EstadoCarga } from './EstadosSolicitud.jsx';

// Protección real de rutas del lado del cliente (evita parpadeos de UI para
// quien no tiene acceso), pero NO es la autorización real: eso lo hace el
// backend en cada endpoint (ver docs/backend-autenticacion.md). "Ocultar
// botones no es autorización" aplica también acá: esta ruta solo mejora la
// experiencia, no reemplaza los chequeos de rol del servidor.
const RutaProtegida = ({ roles, children }) => {
  const { usuario, estaAutenticado, cargandoSesion } = useAuth();
  const ubicacion = useLocation();

  // Mientras se resuelve si hay sesión (GET /api/usuarios/perfil al cargar
  // la página), no se puede decidir todavía si corresponde redirigir: un
  // usuario con sesión válida no debe ver un salto a "Iniciar sesión" solo
  // porque la respuesta tardó unos milisegundos.
  if (cargandoSesion) {
    return <EstadoCarga mensaje="Verificando sesión…" />;
  }

  if (!estaAutenticado) {
    return <Navigate to="/iniciar-sesion" state={{ desde: ubicacion }} replace />;
  }

  if (roles && !roles.includes(usuario.rol)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default RutaProtegida;
