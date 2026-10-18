import { useState, useEffect, useCallback, useRef } from 'react';
import { Carrito } from '../models/Carrito.js';
import ContextoCarrito from './carritoContextBase.js';
import { useAuth } from '../hooks/useAuth.js';
import carritoApi from '../api/carrito.api.js';
import { EstadoError } from '../components/EstadosSolicitud.jsx';

const CLAVE_ALMACENAMIENTO = 'petshop_carrito';

const cargarCarritoAnonimo = () => {
  const guardado = localStorage.getItem(CLAVE_ALMACENAMIENTO);
  return guardado ? Carrito.desdeAlmacenamiento(JSON.parse(guardado)) : new Carrito();
};

const limpiarCarritoAnonimo = () =>
  localStorage.removeItem(CLAVE_ALMACENAMIENTO);

const guardarCarritoAnonimo = (carrito) => {
  if (carrito.estaVacio) {
    localStorage.removeItem(CLAVE_ALMACENAMIENTO);
    return;
  }
  localStorage.setItem(CLAVE_ALMACENAMIENTO, JSON.stringify(carrito.items));
};

const desdeItemsServidor = (items) =>
  Carrito.desdeAlmacenamiento(
    items.map(({ producto, cantidad }) => ({ producto, cantidad })),
  );

const CarritoProvider = ({ children }) => {
  const { usuario, cargandoSesion } = useAuth();
  const idUsuario = usuario?.idUsuario ?? null;
  const [carrito, setCarrito] = useState(new Carrito());
  const [propietarioCarrito, setPropietarioCarrito] = useState(undefined);
  const [cargandoCarrito, setCargandoCarrito] = useState(true);
  const [errorCarrito, setErrorCarrito] = useState(null);
  const [falloCarga, setFalloCarga] = useState(false);
  const [operacionesPendientes, setOperacionesPendientes] = useState(0);
  const [numeroReintento, setNumeroReintento] = useState(0);
  const usuarioAnterior = useRef(undefined);
  const usuarioActualRef = useRef(idUsuario);
  const colasPorUsuario = useRef(new Map());

  useEffect(() => {
    usuarioActualRef.current = idUsuario;
  }, [idUsuario]);

  useEffect(() => {
    if (
      !cargandoSesion &&
      idUsuario === null &&
      propietarioCarrito === null
    ) {
      let vigente = true;
      const persistirCarritoAnonimo = async () => {
        await Promise.resolve();
        if (!vigente) return;

        try {
          guardarCarritoAnonimo(carrito);
          setErrorCarrito(null);
        } catch {
          setErrorCarrito(
            'No se pudo guardar el carrito en este navegador. Podrías perderlo al cerrar esta pestaña.',
          );
        }
      };

      persistirCarritoAnonimo();
      return () => {
        vigente = false;
      };
    }
    return undefined;
  }, [carrito, cargandoSesion, idUsuario, propietarioCarrito]);

  useEffect(() => {
    if (cargandoSesion) return undefined;

    let vigente = true;

    const sincronizar = async () => {
      await Promise.resolve();
      if (!vigente) return;

      setErrorCarrito(null);
      setFalloCarga(false);
      setCarrito(new Carrito());

      if (idUsuario === null) {
        const habiaUnaCuentaActiva = usuarioAnterior.current != null;
        usuarioAnterior.current = null;
        if (!habiaUnaCuentaActiva) {
          try {
            setCarrito(cargarCarritoAnonimo());
          } catch {
            setErrorCarrito(
              'No se pudo recuperar el carrito guardado en este navegador.',
            );
          }
        } else {
          try {
            limpiarCarritoAnonimo();
          } catch {
            setErrorCarrito(
              'No se pudo borrar la copia local del carrito al cerrar sesión. Revisá el navegador antes de compartirlo.',
            );
          }
        }
        setPropietarioCarrito(null);
        setCargandoCarrito(false);
        return;
      }

      usuarioAnterior.current = idUsuario;
      let carritoAnonimo = new Carrito();
      let errorAlmacenamiento = null;
      try {
        carritoAnonimo = cargarCarritoAnonimo();
      } catch {
        errorAlmacenamiento = new Error(
          'No se pudo recuperar el carrito anónimo de este navegador.',
        );
      }

      try {
        const respuesta = await carritoApi.listar();
        let items = respuesta.items;

        if (
          !errorAlmacenamiento &&
          items.length === 0 &&
          !carritoAnonimo.estaVacio
        ) {
          const resultadoImportacion = await carritoApi.importar(
            carritoAnonimo.aDetallesVenta(),
          );
          items = resultadoImportacion.items;
        }

        if (!vigente) return;

        try {
          limpiarCarritoAnonimo();
        } catch {
          errorAlmacenamiento = new Error(
            'No se pudo borrar la copia local del carrito de este navegador.',
          );
        }
        setCarrito(desdeItemsServidor(items));
        setPropietarioCarrito(idUsuario);
        if (errorAlmacenamiento) {
          setErrorCarrito(
            `${errorAlmacenamiento.message} El carrito de tu cuenta sí está disponible.`,
          );
        }
      } catch (error) {
        if (vigente) {
          setErrorCarrito(error.message);
          setFalloCarga(true);
          setPropietarioCarrito(idUsuario);
        }
      } finally {
        if (vigente) setCargandoCarrito(false);
      }
    };

    sincronizar();

    return () => {
      vigente = false;
    };
  }, [cargandoSesion, idUsuario, numeroReintento]);

  const modificarCarritoDeCuenta = useCallback(async (operacion) => {
    if (
      idUsuario === null ||
      propietarioCarrito !== idUsuario ||
      cargandoCarrito ||
      falloCarga
    ) {
      return false;
    }

    const previa = colasPorUsuario.current.get(idUsuario) || Promise.resolve();
    const actual = previa
      .catch(() => {})
      .then(async () => {
        if (usuarioActualRef.current !== idUsuario) return null;
        const respuesta = await operacion();
        if (usuarioActualRef.current === idUsuario) {
          setCarrito(desdeItemsServidor(respuesta.items));
        }
        return respuesta;
      });

    colasPorUsuario.current.set(idUsuario, actual);
    setOperacionesPendientes((cantidad) => cantidad + 1);
    setErrorCarrito(null);

    try {
      const resultado = await actual;
      return resultado !== null;
    } catch (error) {
      if (usuarioActualRef.current === idUsuario) {
        setErrorCarrito(error.message);
      }
      return false;
    } finally {
      if (colasPorUsuario.current.get(idUsuario) === actual) {
        colasPorUsuario.current.delete(idUsuario);
      }
      setOperacionesPendientes((cantidad) => Math.max(0, cantidad - 1));
    }
  }, [cargandoCarrito, falloCarga, idUsuario, propietarioCarrito]);

  const agregarProducto = useCallback((producto, cantidad = 1) => {
    if (idUsuario === null) {
      setCarrito((actual) => {
        return actual.agregar(producto, cantidad);
      });
      return Promise.resolve(true);
    }

    return modificarCarritoDeCuenta(() =>
      carritoApi.agregar(producto.idProducto, cantidad),
    );
  }, [idUsuario, modificarCarritoDeCuenta]);

  const actualizarCantidad = useCallback((idProducto, cantidad) => {
    if (idUsuario === null) {
      setCarrito((actual) => {
        return actual.actualizarCantidad(idProducto, cantidad);
      });
      return Promise.resolve(true);
    }

    return modificarCarritoDeCuenta(() =>
      carritoApi.actualizarCantidad(idProducto, cantidad),
    );
  }, [idUsuario, modificarCarritoDeCuenta]);

  const quitarProducto = useCallback((idProducto) => {
    if (idUsuario === null) {
      setCarrito((actual) => {
        return actual.quitar(idProducto);
      });
      return Promise.resolve(true);
    }

    return modificarCarritoDeCuenta(() => carritoApi.quitar(idProducto));
  }, [idUsuario, modificarCarritoDeCuenta]);

  const vaciarCarrito = useCallback(() => {
    if (idUsuario === null) {
      const vacio = new Carrito();
      setCarrito(vacio);
      return Promise.resolve(true);
    }

    return modificarCarritoDeCuenta(async () => {
      await carritoApi.vaciar();
      return { items: [] };
    });
  }, [idUsuario, modificarCarritoDeCuenta]);

  const reintentarCarga = useCallback(() => {
    setCargandoCarrito(true);
    setNumeroReintento((actual) => actual + 1);
  }, []);

  const sincronizandoCarrito =
    cargandoSesion ||
    cargandoCarrito ||
    propietarioCarrito !== idUsuario;
  const carritoVisible =
    propietarioCarrito === idUsuario ? carrito : new Carrito();
  const estaListo =
    !cargandoSesion &&
    !cargandoCarrito &&
    propietarioCarrito === idUsuario &&
    !falloCarga;

  const valor = {
    carrito: carritoVisible,
    agregarProducto,
    actualizarCantidad,
    quitarProducto,
    vaciarCarrito,
    cargandoCarrito: sincronizandoCarrito,
    errorCarrito,
    reintentarCarga,
    operacionesPendientes,
    estaListo,
  };

  return (
    <ContextoCarrito.Provider value={valor}>
      {errorCarrito && (
        <div className="contenedor">
          <EstadoError mensaje={errorCarrito} onReintentar={reintentarCarga} />
        </div>
      )}
      {children}
    </ContextoCarrito.Provider>
  );
};

export { CarritoProvider };
