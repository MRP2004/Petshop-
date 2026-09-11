import { Link } from 'react-router-dom';

const NoEncontrada = () => (
  <div className="pagina contenedor" style={{ textAlign: 'center' }}>
    <h1 className="titulo-pagina">Página no encontrada</h1>
    <Link to="/" className="boton boton-primario">Volver al inicio</Link>
  </div>
);

export default NoEncontrada;
