import { createContext } from 'react';

// Instancia del contexto separada de AuthContext.jsx (el Provider) y de
// hooks/useAuth.js (el hook): así cada archivo exporta un único tipo de
// cosa (componente / hook / valor), que es lo que pide la regla de lint
// react-refresh/only-export-components para que el hot-reload funcione bien.
const ContextoAuth = createContext(null);

export default ContextoAuth;
