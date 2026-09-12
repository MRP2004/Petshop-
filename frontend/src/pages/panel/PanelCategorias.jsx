import GestionEntidad from '../../components/GestionEntidad.jsx';
import categoriasApi from '../../api/categorias.api.js';

const campos = [
  { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
  { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto' },
];

const columnas = [
  { clave: 'nombre', etiqueta: 'Nombre' },
  { clave: 'descripcion', etiqueta: 'Descripción' },
];

const PanelCategorias = () => (
  <GestionEntidad
    titulo="Categorías"
    servicio={categoriasApi}
    campos={campos}
    columnas={columnas}
    idCampo="idCategoria"
  />
);

export default PanelCategorias;
