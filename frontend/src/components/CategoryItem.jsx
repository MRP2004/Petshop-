import './CategoryItem.css';

// Estaba vacío en el boceto de InicioFront (categoryItem.jsx sin contenido):
// se implementa acá como un botón de filtro reutilizable, usado tanto en la
// navegación rápida de Home como en la barra de filtros del catálogo.
const CategoryItem = ({ etiqueta, activo = false, onClick }) => (
  <button
    type="button"
    className={`category-item ${activo ? 'category-item--activo' : ''}`}
    onClick={onClick}
  >
    {etiqueta}
  </button>
);

export default CategoryItem;
