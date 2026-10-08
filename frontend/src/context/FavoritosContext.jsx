import { useState, useCallback, useEffect } from 'react';
import favoritosApi from '../api/favoritos.api.js';
import { useAuth } from '../hooks/useAuth.js';
import ContextoFavoritos from './favoritosContextBase.js';

// A diferencia del carrito (localStorage, previo a la compra, sin dueño),
// los favoritos son datos propios del comprador (ver favorito.routes.js:
// rol 'cliente' o, desde la Etapa 8, 'vendedor_independiente' — sigue
// siendo comprador —, siempre el idCliente de la sesión) — se guardan en
// el backend, no en localStorage, para que persistan entre dispositivos y
// sobrevivan un "borrar datos del navegador".
const FavoritosProvider = ({ children }) => {
  const { esComprador, usuario } = useAuth();
  const [favoritos, setFavoritos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  // Operaciones en curso por producto (hallazgo real de Codex, ronda 2,
  // Etapa 5): agregar y quitar el MISMO producto en dos clics rápidos y
  // seguidos son dos pedidos HTTP independientes que pueden resolverse en
  // cualquier orden; si el más nuevo termina antes que el más viejo, la UI
  // queda mostrando lo contrario de lo que el servidor terminó guardando,
  // de forma persistente (no solo momentánea). Mientras haya una operación
  // pendiente para un producto, un nuevo toggle sobre ESE MISMO producto se
  // ignora (el botón queda deshabilitado, ver BotonFavorito.jsx) — sobre
  // otros productos, no bloquea nada.
  const [pendientes, setPendientes] = useState(() => new Set());

  // Se recarga cada vez que cambia de cliente (no solo esCliente: si el
  // cliente A cierra sesión y el cliente B inicia sesión SIN recargar la
  // página —la SPA nunca se desmonta—, `esCliente` sigue en `true` en los
  // dos casos, y sin `usuario?.idCliente` en las dependencias este efecto
  // no se volvía a disparar: B veía en pantalla los favoritos de A hasta la
  // primera acción que forzara una recarga. Hallazgo real de Codex.
  //
  // Al cerrar sesión (o si quien está logueado es personal, que no tiene
  // favoritos de compra), se vacía en vez de arrastrar los del cliente
  // anterior.
  useEffect(() => {
    let vigente = true;

    if (!esComprador) {
      setFavoritos([]); // eslint-disable-line react-hooks/set-state-in-effect
      setError(null);
      return undefined;
    }

    // Se limpia ANTES de pedir los nuevos (no solo al terminar): si no, al
    // cambiar de cliente A → B se ve un instante los favoritos de A todavía
    // en pantalla mientras se resuelve el pedido de los de B.
    setFavoritos([]);
    setCargando(true);
    favoritosApi
      .listar()
      .then((datos) => {
        if (vigente) setFavoritos(datos);
      })
      .catch((err) => {
        if (vigente) setError(err.message);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [esComprador, usuario?.idCliente]);

  const esFavorito = useCallback(
    (idProducto) => favoritos.some((producto) => producto.idProducto === idProducto),
    [favoritos],
  );

  const estaPendiente = useCallback((idProducto) => pendientes.has(idProducto), [pendientes]);

  // Optimista: refleja el cambio de inmediato y lo revierte si el backend
  // rechaza el pedido (sesión vencida, error de red), en vez de esperar la
  // respuesta para que el corazón/ícono responda al toque.
  const alternarFavorito = useCallback(
    async (producto) => {
      if (pendientes.has(producto.idProducto)) return; // ya hay un pedido en curso para este producto

      const yaEsFavorito = favoritos.some((item) => item.idProducto === producto.idProducto);
      setError(null);
      setPendientes((actual) => new Set(actual).add(producto.idProducto));

      const liberarPendiente = () =>
        setPendientes((actual) => {
          const copia = new Set(actual);
          copia.delete(producto.idProducto);
          return copia;
        });

      if (yaEsFavorito) {
        setFavoritos((actual) => actual.filter((item) => item.idProducto !== producto.idProducto));
        try {
          await favoritosApi.quitar(producto.idProducto);
        } catch (err) {
          setFavoritos((actual) => [...actual, producto]);
          setError(err.message);
        } finally {
          liberarPendiente();
        }
      } else {
        setFavoritos((actual) => [...actual, producto]);
        try {
          await favoritosApi.agregar(producto.idProducto);
        } catch (err) {
          setFavoritos((actual) => actual.filter((item) => item.idProducto !== producto.idProducto));
          setError(err.message);
        } finally {
          liberarPendiente();
        }
      }
    },
    [favoritos, pendientes],
  );

  const valor = { favoritos, cargando, error, esFavorito, estaPendiente, alternarFavorito };

  return <ContextoFavoritos.Provider value={valor}>{children}</ContextoFavoritos.Provider>;
};

export { FavoritosProvider };
