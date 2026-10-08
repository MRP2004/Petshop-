import { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useCarrito } from '../hooks/useCarrito.js';
import useCargaDatos from '../hooks/useCargaDatos.js';
import categoriasApi from '../api/categorias.api.js';
import tiposMascotaApi from '../api/tiposMascota.api.js';
import NavDropdown from './NavDropdown.jsx';
import BuscadorPredictivo from './BuscadorPredictivo.jsx';
import CuentaMenu from './CuentaMenu.jsx';
import Campana from './Campana.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import './Navbar.css';

const RUTAS_ENCABEZADO_REDUCIDO = ['/iniciar-sesion', '/registro'];

// Identidad, buscador, acceso a cuenta y carrito, más navegación por
// mascota/categoría (ronda 1 de rediseño visual, ver docs/frontend-diseno.md).
// Los grupos adicionales se muestran únicamente cuando existen en la API.
// Las marcas se consultan como filtro en Catálogo, a partir de los productos
// publicados; no se anuncia un menú de marcas sin datos detrás.
const Navbar = () => {
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  // Ronda 2: "Salir" ya no cierra la sesión directamente al hacer clic —
  // primero pide confirmación (ver docs/frontend-diseno.md, "Menú de
  // cuenta"). null-safe: solo importa mientras estaAutenticado es true.
  const [mostrarConfirmacionSalir, setMostrarConfirmacionSalir] = useState(false);
  const ubicacion = useLocation();
  const { usuario, estaAutenticado, esPersonal, esVendedorIndependiente, cerrarSesion, cerrandoSesion, errorCierreSesion } = useAuth();
  const { carrito } = useCarrito();

  const { datos: categorias } = useCargaDatos(useCallback(() => categoriasApi.listar(), []));
  const { datos: mascotas } = useCargaDatos(useCallback(() => tiposMascotaApi.jerarquia(), []));
  const otrasMascotas = (mascotas || []).filter((tipo) => !['perro', 'gato'].includes(tipo.nombre.toLowerCase()));
  const itemsOtrasMascotas = otrasMascotas.flatMap((tipo) => [
    { to: `/catalogo?mascota=${tipo.idTipoMascota}`, etiqueta: tipo.nombre },
    ...tipo.subtipos.map((subtipo) => ({
      to: `/catalogo?mascota=${tipo.idTipoMascota}&idSubtipoMascota=${subtipo.idTipoMascota}`,
      etiqueta: `${tipo.nombre} · ${subtipo.nombre}`,
    })),
  ]);

  const encabezadoReducido = RUTAS_ENCABEZADO_REDUCIDO.includes(ubicacion.pathname);
  // Ronda 2, Etapa 8: dentro del panel (personal interno O vendedor
  // independiente administrando su tienda), ni el buscador de catálogo ni
  // el carrito tienen sentido — antes se compartían sin distinción con el
  // sitio público (confirmado al releer App.jsx/PanelLayout.jsx para esta
  // etapa), algo que el pedido original ya señalaba como pendiente.
  const dentroDelPanel = ubicacion.pathname.startsWith('/panel');

  const itemsPorMascota = (mascota) =>
    (categorias || []).map((categoria) => ({
      to: `/catalogo?mascota=${mascota}&idCategoria=${categoria.idCategoria}`,
      etiqueta: categoria.nombre,
    }));

  const confirmarSalir = () => {
    // No hace falta cerrar el diálogo a mano en el caso exitoso: al salir,
    // estaAutenticado pasa a false y todo este subárbol (incluido el
    // diálogo) deja de renderizarse. Si falla, errorCierreSesion queda
    // seteado y el diálogo sigue abierto mostrando el motivo (ver más abajo).
    cerrarSesion();
  };

  const cerrarConfirmacionSalir = () => {
    if (cerrandoSesion) return; // no se puede abortar un cierre ya en vuelo
    setMostrarConfirmacionSalir(false);
  };

  if (encabezadoReducido) {
    return (
      <header className="navbar navbar--reducido">
        <div className="navbar__principal contenedor">
          <Link to="/" className="navbar__marca">
            <span aria-hidden="true">🐾</span> PetShop
          </Link>
          <Link to="/" className="navbar__volver">
            ← Volver a la tienda
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="navbar">
      <div className="navbar__topbar">
        <p className="contenedor">
          🚚 Envío a domicilio o retiro en sucursal, sin cargo adicional
        </p>
      </div>

      <div className="navbar__principal contenedor">
        <button
          type="button"
          className="navbar__hamburguesa"
          aria-label={menuMovilAbierto ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuMovilAbierto}
          onClick={() => setMenuMovilAbierto((valor) => !valor)}
        >
          <span aria-hidden="true">{menuMovilAbierto ? '✕' : '☰'}</span>
        </button>

        <Link to="/" className="navbar__marca">
          <span aria-hidden="true">🐾</span> PetShop
        </Link>

        {!dentroDelPanel && <BuscadorPredictivo />}

        <div className="navbar__acciones">
          {estaAutenticado && <Campana />}

          {estaAutenticado ? (
            <CuentaMenu
              etiqueta={
                esPersonal
                  ? `Panel (${usuario.rol})`
                  : usuario.nombre || 'Mi cuenta' // nombre ausente: cuenta legacy sin Cliente cargado (no debería pasar, pero no se inventa un nombre)
              }
              enlaces={
                esPersonal
                  ? [{ to: '/panel', etiqueta: 'Ir al panel' }]
                  : esVendedorIndependiente
                    ? [
                        { to: '/mi-cuenta', etiqueta: 'Mi cuenta' },
                        { to: '/mis-favoritos', etiqueta: 'Mis favoritos' },
                        { to: '/panel', etiqueta: 'Mi tienda' },
                      ]
                    : [
                        { to: '/mi-cuenta', etiqueta: 'Mi cuenta' },
                        { to: '/mis-favoritos', etiqueta: 'Mis favoritos' },
                      ]
              }
              onPedirSalir={() => setMostrarConfirmacionSalir(true)}
            />
          ) : (
            <Link to="/iniciar-sesion" className="navbar__accion">
              <span aria-hidden="true">👤</span> Ingresar
            </Link>
          )}

          {!dentroDelPanel && (
            <Link to="/carrito" className="navbar__accion navbar__carrito">
              <span aria-hidden="true">🛒</span> Carrito
              <span className="navbar__contador">{carrito.cantidadTotal}</span>
            </Link>
          )}
        </div>
      </div>

      {!dentroDelPanel && (
        <nav className="navbar__nav contenedor" aria-label="Categorías">
          <Link to="/catalogo" className="navbar__nav-enlace">
            Todo el catálogo
          </Link>
          <NavDropdown etiqueta="Perros" enlaceVerTodo="/catalogo?mascota=perro" items={itemsPorMascota('perro')} />
          <NavDropdown etiqueta="Gatos" enlaceVerTodo="/catalogo?mascota=gato" items={itemsPorMascota('gato')} />
          {otrasMascotas.length > 0 && (
            <NavDropdown etiqueta="Otras mascotas" enlaceVerTodo="/catalogo" items={itemsOtrasMascotas} />
          )}
          <Link to="/promociones" className="navbar__nav-enlace navbar__nav-enlace--promo">
            Promociones
          </Link>
        </nav>
      )}

      {!dentroDelPanel && menuMovilAbierto && (
        <div className="navbar__panel-movil">
          <Link to="/catalogo" onClick={() => setMenuMovilAbierto(false)}>
            Todo el catálogo
          </Link>

          <details className="navbar__acordeon">
            <summary>Perros</summary>
            <Link to="/catalogo?mascota=perro" onClick={() => setMenuMovilAbierto(false)}>
              Ver todo perros
            </Link>
            {itemsPorMascota('perro').map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setMenuMovilAbierto(false)}>
                {item.etiqueta}
              </Link>
            ))}
          </details>

          <details className="navbar__acordeon">
            <summary>Gatos</summary>
            <Link to="/catalogo?mascota=gato" onClick={() => setMenuMovilAbierto(false)}>
              Ver todo gatos
            </Link>
            {itemsPorMascota('gato').map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setMenuMovilAbierto(false)}>
                {item.etiqueta}
              </Link>
            ))}
          </details>

          {otrasMascotas.map((tipo) => (
            <details key={tipo.idTipoMascota} className="navbar__acordeon">
              <summary>{tipo.nombre}</summary>
              <Link to={`/catalogo?mascota=${tipo.idTipoMascota}`} onClick={() => setMenuMovilAbierto(false)}>
                Ver todo {tipo.nombre.toLowerCase()}
              </Link>
              {tipo.subtipos.map((subtipo) => (
                <Link
                  key={subtipo.idTipoMascota}
                  to={`/catalogo?mascota=${tipo.idTipoMascota}&idSubtipoMascota=${subtipo.idTipoMascota}`}
                  onClick={() => setMenuMovilAbierto(false)}
                >
                  {subtipo.nombre}
                </Link>
              ))}
            </details>
          ))}

          <Link to="/promociones" onClick={() => setMenuMovilAbierto(false)}>
            Promociones
          </Link>
        </div>
      )}

      {estaAutenticado && (
        <ConfirmDialog
          abierto={mostrarConfirmacionSalir}
          titulo="¿Querés cerrar sesión?"
          mensaje="Vas a salir de tu cuenta en este dispositivo."
          textoConfirmar="Salir"
          textoCancelar="Volver"
          cargando={cerrandoSesion}
          error={errorCierreSesion}
          onConfirmar={confirmarSalir}
          onCancelar={cerrarConfirmacionSalir}
        />
      )}
    </header>
  );
};

export default Navbar;
