import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './CuentaMenu.css';

// Menú de cuenta accesible (ronda 2, ver docs/frontend-diseno.md): antes
// "Mi cuenta"/"Panel (rol)" eran enlaces sueltos junto al botón "Salir".
// Ahora un único desplegable muestra el nombre real de quien inició sesión
// (o "Panel (rol)" para el personal, que no tiene un Cliente asociado — ver
// usuario.service.js#construirPerfilPublico) y agrupa los destinos reales
// según el rol (uno o más, ver `enlaces`) más "Salir". Mismo patrón de
// mouse/teclado que NavDropdown.jsx (hover para abrir/cerrar, Enter/Espacio/
// flecha abajo para abrir con foco en el primer ítem, flechas para moverse,
// Escape cierra y devuelve el foco al botón).
//
// "Salir" NO cierra la sesión directamente: cierra el menú y delega a
// `onPedirSalir` (Navbar.jsx abre el ConfirmDialog "¿Querés cerrar sesión?"
// — ver el pedido de esta ronda: toda acción de cierre de sesión debe
// confirmarse antes de ejecutarse, no solo las que "explota" datos).
//
// `enlaces` reemplaza al `enlace` único original (favoritos, ronda 2,
// necesitaba un segundo destino real además de "Mi cuenta"/"Panel"): un
// arreglo de refs por índice, en vez de refs con nombre fijo, para navegar
// con flechas entre una cantidad variable de ítems + "Salir" al final.
const CuentaMenu = ({ etiqueta, enlaces, onPedirSalir }) => {
  const [abierto, setAbierto] = useState(false);
  const referenciaContenedor = useRef(null);
  const referenciaBoton = useRef(null);
  const referenciasItems = useRef([]);
  const cantidadItems = enlaces.length + 1; // + "Salir"

  const cerrar = () => setAbierto(false);

  const enfocarIndice = (indice) => {
    referenciasItems.current[indice]?.focus();
  };

  const manejarBlur = (evento) => {
    if (!referenciaContenedor.current?.contains(evento.relatedTarget)) {
      cerrar();
    }
  };

  const manejarTeclaBoton = (evento) => {
    if (evento.key === 'ArrowDown' || evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      setAbierto(true);
      requestAnimationFrame(() => enfocarIndice(0));
    } else if (evento.key === 'Escape') {
      cerrar();
    }
  };

  // No es una función currificada ((indice) => (evento) => ...) a propósito:
  // llamarla como manejarTeclaItem(indice) directamente en el JSX invocaría
  // la función factory EN EL RENDER (aunque el cuerpo que lee refs quede
  // diferido al cierre devuelto) — react-hooks/refs lo marca como lectura de
  // ref durante el render (hallazgo real de lint). Envuelta en una arrow
  // function inline en el onKeyDown de abajo, solo se define una closure
  // durante el render; nada se invoca hasta que el evento ocurre.
  const manejarTeclaItem = (evento, indice) => {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      enfocarIndice(Math.min(indice + 1, cantidadItems - 1));
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      if (indice === 0) {
        referenciaBoton.current?.focus();
      } else {
        enfocarIndice(indice - 1);
      }
    } else if (evento.key === 'Escape') {
      cerrar();
      referenciaBoton.current?.focus();
    }
  };

  const pedirSalir = () => {
    cerrar();
    onPedirSalir();
  };

  return (
    <div
      ref={referenciaContenedor}
      className="cuenta-menu"
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={cerrar}
      onBlur={manejarBlur}
    >
      <button
        ref={referenciaBoton}
        type="button"
        className="cuenta-menu__boton navbar__accion"
        aria-haspopup="true"
        aria-expanded={abierto}
        // Abre, no alterna: el mouse ya lo abrió por hover antes de que el
        // clic llegue a dispararse (mouseenter siempre precede a click en
        // la misma interacción), así que alternar acá lo cerraría de
        // inmediato después de abrirlo — hallazgo real al escribir la
        // prueba de clic de este componente. Cerrar sigue andando por
        // mouseleave, clic afuera (blur) y Escape.
        onClick={() => setAbierto(true)}
        onKeyDown={manejarTeclaBoton}
      >
        <span aria-hidden="true">👤</span> {etiqueta}
        <span aria-hidden="true" className="cuenta-menu__flecha">
          ▾
        </span>
      </button>

      {abierto && (
        <ul className="cuenta-menu__lista" role="menu">
          {enlaces.map((enlace, indice) => (
            <li role="none" key={enlace.to}>
              <Link
                to={enlace.to}
                role="menuitem"
                ref={(el) => {
                  referenciasItems.current[indice] = el;
                }}
                onKeyDown={(evento) => manejarTeclaItem(evento, indice)}
                onClick={cerrar}
                className="cuenta-menu__item"
              >
                {enlace.etiqueta}
              </Link>
            </li>
          ))}
          <li role="none">
            <button
              type="button"
              role="menuitem"
              ref={(el) => {
                referenciasItems.current[enlaces.length] = el;
              }}
              onKeyDown={(evento) => manejarTeclaItem(evento, enlaces.length)}
              onClick={pedirSalir}
              className="cuenta-menu__item cuenta-menu__item--boton"
            >
              Salir
            </button>
          </li>
        </ul>
      )}
    </div>
  );
};

export default CuentaMenu;
