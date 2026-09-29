import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './NavDropdown.css';

// Desplegable de navegación (Perros/Gatos, ver Navbar.jsx): solo se muestra
// en escritorio/tablet (el equivalente táctil en móvil es el acordeón de
// NavPanelMovil). `items` siempre viene armado con datos reales (categorías
// cargadas de la API + el tipo de mascota fijo del propio menú); si `items`
// queda vacío no se renderiza nada por fuera del enlace "Ver todo" (ver
// Navbar.jsx: nunca se arma un desplegable vacío de contenido).
//
// Soporta mouse (hover) y teclado (Enter/Espacio para abrir, flechas para
// moverse entre opciones, Escape para cerrar y devolver el foco al botón que
// abrió el menú) sin ninguna librería adicional.
const NavDropdown = ({ etiqueta, enlaceVerTodo, items }) => {
  const [abierto, setAbierto] = useState(false);
  const referenciaContenedor = useRef(null);
  const referenciaBoton = useRef(null);
  const referenciasItems = useRef([]);

  const cerrar = () => setAbierto(false);

  const manejarBlur = (evento) => {
    if (!referenciaContenedor.current?.contains(evento.relatedTarget)) {
      cerrar();
    }
  };

  const manejarTeclaBoton = (evento) => {
    if (evento.key === 'ArrowDown' || evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      setAbierto(true);
      requestAnimationFrame(() => referenciasItems.current[0]?.focus());
    } else if (evento.key === 'Escape') {
      cerrar();
    }
  };

  const manejarTeclaItem = (indice) => (evento) => {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      referenciasItems.current[indice + 1]?.focus();
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      if (indice === 0) referenciaBoton.current?.focus();
      else referenciasItems.current[indice - 1]?.focus();
    } else if (evento.key === 'Escape') {
      cerrar();
      referenciaBoton.current?.focus();
    }
  };

  return (
    <div
      ref={referenciaContenedor}
      className="nav-dropdown"
      data-abierto={abierto}
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={cerrar}
      onBlur={manejarBlur}
    >
      <button
        ref={referenciaBoton}
        type="button"
        className="nav-dropdown__boton"
        aria-haspopup="true"
        aria-expanded={abierto}
        // Abre, no alterna (hallazgo real de la ronda 2, ver
        // CuentaMenu.jsx): con mouse, "mouseenter" siempre dispara antes
        // que "click" en la misma interacción — el mouseenter de arriba ya
        // abrió el menú por hover antes de que este clic llegara a
        // ejecutarse, así que alternar (!valor) lo cerraba de inmediato en
        // vez de dejarlo abierto. Cerrar sigue andando por mouseleave,
        // clic afuera (blur) y Escape.
        onClick={() => setAbierto(true)}
        onKeyDown={manejarTeclaBoton}
      >
        {etiqueta}
        <span aria-hidden="true" className="nav-dropdown__flecha">
          ▾
        </span>
      </button>

      {abierto && (
        <ul className="nav-dropdown__menu" role="menu">
          <li role="none">
            <Link
              to={enlaceVerTodo}
              role="menuitem"
              ref={(el) => {
                referenciasItems.current[0] = el;
              }}
              onKeyDown={manejarTeclaItem(0)}
              onClick={cerrar}
              className="nav-dropdown__item nav-dropdown__item--todo"
            >
              Ver todo {etiqueta.toLowerCase()}
            </Link>
          </li>
          {items.map((item, indice) => (
            <li key={item.to} role="none">
              <Link
                to={item.to}
                role="menuitem"
                ref={(el) => {
                  referenciasItems.current[indice + 1] = el;
                }}
                onKeyDown={manejarTeclaItem(indice + 1)}
                onClick={cerrar}
                className="nav-dropdown__item"
              >
                {item.etiqueta}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default NavDropdown;
