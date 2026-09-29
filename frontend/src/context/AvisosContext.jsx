import { useState, useCallback, useEffect } from 'react';
import avisosApi from '../api/avisos.api.js';
import { useAuth } from '../hooks/useAuth.js';
import ContextoAvisos from './avisosContextBase.js';

const INTERVALO_ACTUALIZACION_MS = 30000;

// A diferencia de favoritos (solo cliente), los avisos son de CUALQUIER rol
// autenticado (cliente: compras y solicitudes propias; personal: solicitudes
// nuevas — ver aviso.service.js). Se recargan cada vez que cambia de cuenta
// (dependencia en `usuario?.idUsuario`, no solo en `estaAutenticado`: mismo
// hallazgo real de Codex que en FavoritosContext — cambiar de cuenta sin
// recargar la SPA no debía dejar viendo los avisos de la cuenta anterior).
// Sin WebSocket todavía: un polling simple cada 30s mientras hay sesión es
// "in-app" real (no hace falta abrir el panel para que el contador se
// actualice), sin la complejidad de una conexión persistente.
const AvisosProvider = ({ children }) => {
  const { estaAutenticado, usuario } = useAuth();
  const [avisos, setAvisos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => {
    if (!estaAutenticado) return Promise.resolve();
    return avisosApi
      .listar()
      .then((datos) => setAvisos(datos))
      .catch((err) => setError(err.message));
  }, [estaAutenticado]);

  useEffect(() => {
    let vigente = true;

    if (!estaAutenticado) {
      setAvisos([]); // eslint-disable-line react-hooks/set-state-in-effect
      setError(null);
      return undefined;
    }

    setAvisos([]);
    setCargando(true);
    avisosApi
      .listar()
      .then((datos) => {
        if (vigente) setAvisos(datos);
      })
      .catch((err) => {
        if (vigente) setError(err.message);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    const intervalo = setInterval(() => {
      avisosApi
        .listar()
        .then((datos) => {
          if (vigente) setAvisos(datos);
        })
        .catch(() => {
          // Un fallo puntual del polling periódico no debe reemplazar el
          // mensaje de error de la carga inicial ni interrumpir nada: el
          // próximo intervalo simplemente vuelve a intentar.
        });
    }, INTERVALO_ACTUALIZACION_MS);

    return () => {
      vigente = false;
      clearInterval(intervalo);
    };
  }, [estaAutenticado, usuario?.idUsuario]);

  const noLeidos = avisos.filter((aviso) => !aviso.leido).length;

  // Optimista, como favoritos: refleja el cambio de inmediato; si el
  // backend rechaza el pedido, se recarga la lista real en vez de adivinar
  // cómo revertir (a diferencia de favoritos, acá no hay ambigüedad posible
  // de qué mostrar mientras tanto: solo se puede pasar de no-leído a
  // leído, nunca al revés).
  const marcarLeido = useCallback(
    async (idAviso) => {
      setAvisos((actual) => actual.map((a) => (a.idAviso === idAviso ? { ...a, leido: true } : a)));
      try {
        await avisosApi.marcarLeido(idAviso);
      } catch {
        cargar();
      }
    },
    [cargar],
  );

  const marcarTodosLeidos = useCallback(async () => {
    setAvisos((actual) => actual.map((a) => ({ ...a, leido: true })));
    try {
      await avisosApi.marcarTodosLeidos();
    } catch {
      cargar();
    }
  }, [cargar]);

  const valor = { avisos, noLeidos, cargando, error, marcarLeido, marcarTodosLeidos };

  return <ContextoAvisos.Provider value={valor}>{children}</ContextoAvisos.Provider>;
};

export { AvisosProvider };
