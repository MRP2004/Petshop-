import { useContext } from 'react';
import ContextoAvisos from '../context/avisosContextBase.js';

const useAvisos = () => {
  const contexto = useContext(ContextoAvisos);

  if (!contexto) {
    throw new Error('useAvisos debe usarse dentro de AvisosProvider');
  }

  return contexto;
};

export { useAvisos };
