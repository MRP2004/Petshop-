import { createContext } from 'react';

// Ver context/authContextBase.js: misma separación de archivos para que
// react-refresh/only-export-components no se queje (Provider, hook y
// contexto en tres archivos separados, cada uno exportando un único tipo).
const ContextoCarrito = createContext(null);

export default ContextoCarrito;
