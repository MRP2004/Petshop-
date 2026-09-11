import { useState, useEffect, useCallback } from 'react';
import { Carrito } from '../models/Carrito.js';
import ContextoCarrito from './carritoContextBase.js';

const CLAVE_ALMACENAMIENTO = 'petshop_carrito';

const cargarCarritoGuardado = () => {
  try {
    const guardado = localStorage.getItem(CLAVE_ALMACENAMIENTO);
    return guardado ? Carrito.desdeAlmacenamiento(JSON.parse(guardado)) : new Carrito();
  } catch {
    return new Carrito();
  }
};

const CarritoProvider = ({ children }) => {
  const [carrito, setCarrito] = useState(cargarCarritoGuardado);

  // Persistencia por navegador (ver models/Carrito.js): conveniencia de UI,
  // no reemplaza la revalidación de precio/stock que hace el backend al
  // confirmar la compra.
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_ALMACENAMIENTO, JSON.stringify(carrito.items));
    } catch {
      // Si no se puede persistir, el carrito sigue funcionando en memoria
      // durante esta sesión de pestaña.
    }
  }, [carrito]);

  const agregarProducto = useCallback((producto, cantidad = 1) => {
    setCarrito((actual) => actual.agregar(producto, cantidad));
  }, []);

  const actualizarCantidad = useCallback((idProducto, cantidad) => {
    setCarrito((actual) => actual.actualizarCantidad(idProducto, cantidad));
  }, []);

  const quitarProducto = useCallback((idProducto) => {
    setCarrito((actual) => actual.quitar(idProducto));
  }, []);

  const vaciarCarrito = useCallback(() => {
    setCarrito((actual) => actual.vaciar());
  }, []);

  const valor = {
    carrito,
    agregarProducto,
    actualizarCantidad,
    quitarProducto,
    vaciarCarrito,
  };

  return <ContextoCarrito.Provider value={valor}>{children}</ContextoCarrito.Provider>;
};

export { CarritoProvider };
