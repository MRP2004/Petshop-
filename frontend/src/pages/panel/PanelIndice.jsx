import { useAuth } from '../../hooks/useAuth.js';
import PanelInicio from './PanelInicio.jsx';
import PanelMiTienda from './PanelMiTienda.jsx';

// Ronda 2, Etapa 8: la ruta índice de /panel muestra contenido distinto
// según quién esté logueado — personal interno ve el panel de gestión de
// siempre (PanelInicio); un vendedor independiente ve directamente su
// propia tienda (PanelMiTienda), no tendría sentido mostrarle la alerta de
// stock bajo de TODO el catálogo como pantalla principal.
const PanelIndice = () => {
  const { esVendedorIndependiente } = useAuth();
  return esVendedorIndependiente ? <PanelMiTienda /> : <PanelInicio />;
};

export default PanelIndice;
