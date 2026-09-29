import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import categoriasApi from '../api/categorias.api.js';
import useCargaDatos from '../hooks/useCargaDatos.js';
import './Footer.css';

// Reescrito para la ronda 1 de rediseño visual (ver docs/frontend-diseno.md):
// las columnas de categorías y de mascota son enlaces reales a filtros que
// funcionan (misma API que usa el catálogo), no texto suelto. No hay
// enlaces sociales ni newsletter: ninguno de los dos existe todavía, y
// mostrarlos sin destino real sería prometer algo que la app no ofrece.
//
// Ronda 2: se quitó la columna "Contacto" (domicilio/teléfono/correo eran
// datos de demostración inventados, no un local o canal real de PetShop —
// pedido explícito de esta ronda). No se inventa un reemplazo: la columna
// "Ayuda" ya cubre los canales reales (catálogo, promociones, cuenta).
const Footer = () => {
  const { datos: categorias } = useCargaDatos(useCallback(() => categoriasApi.listar(), []));

  return (
    <footer className="footer">
      <div className="footer__columnas contenedor">
        <div className="footer__marca">
          <h3>🐾 PetShop</h3>
          <p>Cuidamos a tus mejores amigos con la mejor calidad en alimentos y accesorios.</p>
        </div>

        <div>
          <h4>Comprar por mascota</h4>
          <ul>
            <li>
              <Link to="/catalogo?mascota=perro">Perros</Link>
            </li>
            <li>
              <Link to="/catalogo?mascota=gato">Gatos</Link>
            </li>
          </ul>
        </div>

        <div>
          <h4>Categorías</h4>
          <ul>
            {(categorias || []).map((categoria) => (
              <li key={categoria.idCategoria}>
                <Link to={`/catalogo?idCategoria=${categoria.idCategoria}`}>{categoria.nombre}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Ayuda</h4>
          <ul>
            <li>
              <Link to="/catalogo">Catálogo completo</Link>
            </li>
            <li>
              <Link to="/promociones">Promociones</Link>
            </li>
            <li>
              <Link to="/iniciar-sesion">Ingresar</Link>
            </li>
            <li>
              <Link to="/registro">Crear cuenta</Link>
            </li>
          </ul>
        </div>

      </div>

      <div className="footer__inferior">© 2026 PetShop — Trabajo práctico DSW, UTN FRRo.</div>
    </footer>
  );
};

export default Footer;
