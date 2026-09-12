import { useContext } from 'react';
import ContextoAuth from '../context/authContextBase.js';

const useAuth = () => {
  const contexto = useContext(ContextoAuth);

  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }

  return contexto;
};

export { useAuth };
