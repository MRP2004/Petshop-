import { useContext } from 'react';
import ContextoCarrito from '../context/carritoContextBase.js';

const useCarrito = () => {
  const contexto = useContext(ContextoCarrito);

  if (!contexto) {
    throw new Error('useCarrito debe usarse dentro de CarritoProvider');
  }

  return contexto;
};

export { useCarrito };
