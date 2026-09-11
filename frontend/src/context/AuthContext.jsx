import { useState, useCallback, useEffect } from 'react';
import * as authApi from '../api/auth.api.js';
import { registrarManejadorSesionInvalida } from '../api/httpClient.js';
import ContextoAuth from './authContextBase.js';

// La sesión vive en una cookie HttpOnly (ver docs/backend-autenticacion.md):
// este componente nunca lee ni guarda el token, solo sabe "quién está
// logueado" porque se lo pregunta al backend (GET /api/usuarios/perfil, que
// lee la cookie del lado del servidor). Es el mismo patrón que cualquier
// sesión de servidor tradicional, adaptado a una API JSON.
const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  // Mientras no se resuelve la comprobación inicial de sesión, RutaProtegida
  // no debe decidir todavía si redirige a "Iniciar sesión": si lo hiciera
  // antes de tener respuesta, un usuario con sesión válida vería un
  // parpadeo (o una redirección de más) en cada recarga de página.
  const [cargandoSesion, setCargandoSesion] = useState(true);

  useEffect(() => {
    let vigente = true;

    authApi
      .obtenerPerfil()
      .then((datos) => {
        if (vigente) setUsuario(datos);
      })
      .catch(() => {
        // Sin sesión válida (401) o el backend no responde: se trata igual,
        // como "no autenticado". No es un error que deba mostrarse.
        if (vigente) setUsuario(null);
      })
      .finally(() => {
        if (vigente) setCargandoSesion(false);
      });

    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    // La sesión puede volverse inválida en cualquier momento (expiró, se
    // cerró en otra pestaña, la cookie se borró a mano): cualquier pedido
    // que reciba 401 dispara esto, sin que cada pantalla tenga que
    // manejarlo por separado.
    registrarManejadorSesionInvalida(() => setUsuario(null));
  }, []);

  const iniciarSesion = useCallback(async (email, password) => {
    const { usuario: usuarioNuevo } = await authApi.iniciarSesion(email, password);
    setUsuario(usuarioNuevo);
  }, []);

  const registrarse = useCallback(async (datos) => {
    const { usuario: usuarioNuevo } = await authApi.registrarse(datos);
    setUsuario(usuarioNuevo);
  }, []);

  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [errorCierreSesion, setErrorCierreSesion] = useState(null);

  // Corrección de esta etapa: la versión anterior atrapaba el error de red
  // pero limpiaba el estado local de todas formas, mostrando a quien usa la
  // app como "desconectado" mientras su cookie seguía activa en el
  // servidor — un cierre de sesión que en los hechos no ocurrió, presentado
  // como si hubiera ocurrido. Ahora el estado local solo se limpia cuando
  // el servidor confirma el cierre (204) o cuando el servidor ya considera
  // inválida la sesión (401: no hay nada que cerrar). Cualquier otro fallo
  // (de red, o un error del servidor) deja la sesión como estaba y expone
  // un mensaje para que la interfaz lo muestre y permita reintentar
  // (ver Navbar.jsx). `cerrarSesion` nunca relanza el error: todo el
  // resultado queda en `errorCierreSesion`, así que no hay ningún rechazo
  // de promesa sin atrapar en quien la llama.
  const cerrarSesion = useCallback(async () => {
    setCerrandoSesion(true);
    setErrorCierreSesion(null);

    try {
      await authApi.cerrarSesion();
      setUsuario(null);
    } catch (error) {
      if (error.status === 401) {
        // El backend ya no reconoce la sesión (cookie vencida o borrada):
        // no hay nada que confirmar, se trata igual que un cierre exitoso.
        setUsuario(null);
      } else {
        setErrorCierreSesion(
          error.status === 0
            ? 'No se pudo confirmar el cierre de sesión: revisá tu conexión e intentá de nuevo.'
            : 'No se pudo cerrar la sesión. Intentá de nuevo.',
        );
      }
    } finally {
      setCerrandoSesion(false);
    }
  }, []);

  const valor = {
    usuario,
    cargandoSesion,
    estaAutenticado: Boolean(usuario),
    esCliente: usuario?.rol === 'cliente',
    esPersonal: usuario?.rol === 'vendedor' || usuario?.rol === 'administrador',
    esAdministrador: usuario?.rol === 'administrador',
    iniciarSesion,
    registrarse,
    cerrarSesion,
    cerrandoSesion,
    errorCierreSesion,
  };

  return <ContextoAuth.Provider value={valor}>{children}</ContextoAuth.Provider>;
};

export { AuthProvider };
