import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useCarrito } from '../hooks/useCarrito.js';
import './Navbar.css';

// Identidad, buscador, acceso a cuenta y carrito: los cuatro elementos que
// pide la navegación tipo Chewy (ver docs/frontend-diseno.md). Reescrito a
// partir del boceto de la rama InicioFront (mismo logo/paleta), pero con
// clases CSS mobile-first en vez de estilos inline (así se puede adaptar por
// breakpoint) y conectado a datos reales (sesión, carrito) en vez de
// hardcodeados.
const Navbar = () => {
  const [busqueda, setBusqueda] = useState('');
  const navegar = useNavigate();
  const { usuario, estaAutenticado, esPersonal, cerrarSesion, cerrandoSesion, errorCierreSesion } = useAuth();
  const { carrito } = useCarrito();

  const manejarBusqueda = (evento) => {
    evento.preventDefault();
    const termino = busqueda.trim();
    navegar(termino ? `/catalogo?buscar=${encodeURIComponent(termino)}` : '/catalogo');
  };

  return (
    <header className="navbar">
      <div className="navbar__fila contenedor">
        <Link to="/" className="navbar__marca">
          🐾 PetShop
        </Link>

        <form className="navbar__buscador" onSubmit={manejarBusqueda} role="search">
          <input
            type="search"
            placeholder="Buscar alimentos, juguetes, accesorios…"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            aria-label="Buscar productos"
          />
          <button type="submit" className="navbar__boton-buscar" aria-label="Buscar">
            🔍
          </button>
        </form>

        <div className="navbar__acciones">
          {estaAutenticado ? (
            <>
              {esPersonal ? (
                <Link to="/panel" className="navbar__accion">
                  👤 Panel ({usuario.rol})
                </Link>
              ) : (
                <Link to="/mi-cuenta" className="navbar__accion">
                  👤 Mi cuenta
                </Link>
              )}
              <button
                type="button"
                className="navbar__accion navbar__accion--boton"
                onClick={cerrarSesion}
                disabled={cerrandoSesion}
              >
                {cerrandoSesion ? 'Cerrando…' : 'Salir'}
              </button>
              {errorCierreSesion && (
                // No se oculta el error ni se presenta la sesión como
                // cerrada: sigue activa (ver AuthContext.jsx#cerrarSesion).
                // El mismo botón de arriba reintenta al volver a hacer clic.
                <span className="navbar__error-logout" role="alert">
                  {errorCierreSesion}
                </span>
              )}
            </>
          ) : (
            <Link to="/iniciar-sesion" className="navbar__accion">
              👤 Ingresar
            </Link>
          )}

          <Link to="/carrito" className="navbar__accion navbar__carrito">
            🛒 Carrito
            <span className="navbar__contador">{carrito.cantidadTotal}</span>
          </Link>
        </div>
      </div>

      <nav className="navbar__categorias contenedor" aria-label="Categorías">
        <Link to="/catalogo">Todo el catálogo</Link>
        <Link to="/catalogo?mascota=perro">🐶 Perros</Link>
        <Link to="/catalogo?mascota=gato">🐱 Gatos</Link>
        <Link to="/promociones">Promociones</Link>
      </nav>
    </header>
  );
};

export default Navbar;
