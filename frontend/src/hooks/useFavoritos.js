import { useContext } from 'react';
import ContextoFavoritos from '../context/favoritosContextBase.js';

const useFavoritos = () => {
  const contexto = useContext(ContextoFavoritos);

  if (!contexto) {
    throw new Error('useFavoritos debe usarse dentro de FavoritosProvider');
  }

  return contexto;
};

export { useFavoritos };
