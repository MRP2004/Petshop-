import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import './PanelLayout.css';

// Layout común del panel de gestión: navegación lateral con las secciones
// habilitadas para el rol actual. Es una ayuda de navegación, no la
// autorización real: cada ruta debajo sigue protegida por RutaProtegida y,
// sobre todo, por el backend (ver docs/backend-autenticacion.md — "ocultar
// botones no es autorización").
//
// Ronda 2, Etapa 8 (marketplace): un vendedor independiente comparte esta
// misma ruta `/panel` (y este mismo layout), pero ve un menú COMPLETAMENTE
// DISTINTO — solo su propia tienda, sus propios productos y sus propias
// ventas, nunca las secciones de gestión interna (clientes, proveedores,
// medios de pago, etc., que siguen siendo exclusivas de personal interno).
const PanelLayout = () => {
  const { esAdministrador, esVendedorIndependiente } = useAuth();

  const enlaceClase = ({ isActive }) => `panel-layout__enlace ${isActive ? 'panel-layout__enlace--activo' : ''}`;

  return (
    <div className="panel-layout contenedor">
      <nav className="panel-layout__menu" aria-label="Secciones del panel">
        {esVendedorIndependiente ? (
          <>
            <NavLink to="/panel" end className={enlaceClase}>Mi tienda</NavLink>
            <NavLink to="/panel/mis-ventas" className={enlaceClase}>Mis ventas</NavLink>
          </>
        ) : (
          <>
            <NavLink to="/panel" end className={enlaceClase}>Inicio</NavLink>
            <NavLink to="/panel/ventas" className={enlaceClase}>Ventas</NavLink>
            <NavLink to="/panel/ventas/nueva" className={enlaceClase}>Nueva venta</NavLink>
            <NavLink to="/panel/productos" className={enlaceClase}>Productos</NavLink>
            <NavLink to="/panel/categorias" className={enlaceClase}>Categorías</NavLink>
            <NavLink to="/panel/tipos-mascota" className={enlaceClase}>Tipos de mascota</NavLink>
            <NavLink to="/panel/proveedores" className={enlaceClase}>Proveedores</NavLink>
            <NavLink to="/panel/clientes" className={enlaceClase}>Clientes</NavLink>
            <NavLink to="/panel/medios-pago" className={enlaceClase}>Medios de pago</NavLink>
            <NavLink to="/panel/promociones" className={enlaceClase}>Promociones</NavLink>
            {esAdministrador && (
              <>
                <NavLink to="/panel/usuarios" className={enlaceClase}>Cuentas internas</NavLink>
                <NavLink to="/panel/solicitudes-vendedor" className={enlaceClase}>Solicitudes de vendedor</NavLink>
                <NavLink to="/panel/tiendas" className={enlaceClase}>Tiendas</NavLink>
              </>
            )}
          </>
        )}
      </nav>

      <div className="panel-layout__contenido">
        <Outlet />
      </div>
    </div>
  );
};

export default PanelLayout;
