import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { CarritoProvider } from './context/CarritoContext.jsx';
import { FavoritosProvider } from './context/FavoritosContext.jsx';
import { AvisosProvider } from './context/AvisosContext.jsx';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import RutaProtegida from './components/RutaProtegida.jsx';

import Home from './pages/Home.jsx';
import Catalogo from './pages/Catalogo.jsx';
import ProductoDetalle from './pages/ProductoDetalle.jsx';
import Carrito from './pages/Carrito.jsx';
import Checkout from './pages/Checkout.jsx';
import Login from './pages/Login.jsx';
import Registro from './pages/Registro.jsx';
import MiCuenta from './pages/MiCuenta.jsx';
import VentaDetalle from './pages/VentaDetalle.jsx';
import Favoritos from './pages/Favoritos.jsx';
import SolicitudVendedor from './pages/SolicitudVendedor.jsx';
import NoEncontrada from './pages/NoEncontrada.jsx';

import PanelLayout from './pages/panel/PanelLayout.jsx';
import PanelIndice from './pages/panel/PanelIndice.jsx';
import PanelVentas from './pages/panel/PanelVentas.jsx';
import PanelNuevaVenta from './pages/panel/PanelNuevaVenta.jsx';
import PanelProductos from './pages/panel/PanelProductos.jsx';
import PanelCategorias from './pages/panel/PanelCategorias.jsx';
import PanelTiposMascota from './pages/panel/PanelTiposMascota.jsx';
import PanelProveedores from './pages/panel/PanelProveedores.jsx';
import PanelClientes from './pages/panel/PanelClientes.jsx';
import PanelMediosPago from './pages/panel/PanelMediosPago.jsx';
import PanelPromociones from './pages/panel/PanelPromociones.jsx';
import PanelUsuarios from './pages/panel/PanelUsuarios.jsx';
import PanelSolicitudesVendedor from './pages/panel/PanelSolicitudesVendedor.jsx';
import PanelTiendas from './pages/panel/PanelTiendas.jsx';
import PanelMisVentas from './pages/panel/PanelMisVentas.jsx';

// PromocionesPublico reutiliza la misma API de solo lectura; el listado
// público de promociones (sin gestión) vive directamente acá porque es
// mínimo, no amerita un archivo aparte.
import Promociones from './pages/Promociones.jsx';

const ROLES_PERSONAL = ['vendedor', 'administrador'];
// Ronda 2, Etapa 8: un vendedor independiente sigue siendo comprador
// (checkout, favoritos, mis compras) — ver docs/estado-proyecto.md.
const ROLES_COMPRADOR = ['cliente', 'vendedor_independiente'];
// `/panel` es compartido (personal interno Y vendedor independiente), pero
// cada sección interna adentro sigue exigiendo ROLES_PERSONAL de forma
// explícita (ver más abajo) — un vendedor independiente que entrara por URL
// directa a /panel/clientes, por ejemplo, igual queda afuera.
const ROLES_PANEL = ['vendedor', 'administrador', 'vendedor_independiente'];

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CarritoProvider>
          <FavoritosProvider>
            <AvisosProvider>
              <Navbar />

              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/catalogo" element={<Catalogo />} />
                <Route path="/productos/:id" element={<ProductoDetalle />} />
                <Route path="/promociones" element={<Promociones />} />
                <Route path="/carrito" element={<Carrito />} />
                <Route path="/iniciar-sesion" element={<Login />} />
                <Route path="/registro" element={<Registro />} />

                <Route
                  path="/checkout"
                  element={
                    <RutaProtegida roles={ROLES_COMPRADOR}>
                      <Checkout />
                    </RutaProtegida>
                  }
                />
                <Route
                  path="/mi-cuenta"
                  element={
                    <RutaProtegida roles={ROLES_COMPRADOR}>
                      <MiCuenta />
                    </RutaProtegida>
                  }
                />
                <Route
                  path="/mis-favoritos"
                  element={
                    <RutaProtegida roles={ROLES_COMPRADOR}>
                      <Favoritos />
                    </RutaProtegida>
                  }
                />
                <Route
                  path="/mis-compras/:id"
                  element={
                    <RutaProtegida roles={ROLES_COMPRADOR}>
                      <VentaDetalle />
                    </RutaProtegida>
                  }
                />
                <Route
                  path="/quiero-vender"
                  element={
                    <RutaProtegida roles={['cliente']}>
                      <SolicitudVendedor />
                    </RutaProtegida>
                  }
                />

                <Route
                  path="/panel"
                  element={
                    <RutaProtegida roles={ROLES_PANEL}>
                      <PanelLayout />
                    </RutaProtegida>
                  }
                >
                  <Route index element={<PanelIndice />} />
                  <Route
                    path="mis-ventas"
                    element={
                      <RutaProtegida roles={['vendedor_independiente']}>
                        <PanelMisVentas />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="ventas"
                    element={
                      <RutaProtegida roles={ROLES_PERSONAL}>
                        <PanelVentas />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="ventas/nueva"
                    element={
                      <RutaProtegida roles={ROLES_PERSONAL}>
                        <PanelNuevaVenta />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="ventas/:id"
                    element={
                      <RutaProtegida roles={ROLES_PERSONAL}>
                        <VentaDetalle />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="productos"
                    element={
                      <RutaProtegida roles={ROLES_PERSONAL}>
                        <PanelProductos />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="categorias"
                    element={
                      <RutaProtegida roles={ROLES_PERSONAL}>
                        <PanelCategorias />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="tipos-mascota"
                    element={
                      <RutaProtegida roles={ROLES_PERSONAL}>
                        <PanelTiposMascota />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="proveedores"
                    element={
                      <RutaProtegida roles={ROLES_PERSONAL}>
                        <PanelProveedores />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="clientes"
                    element={
                      <RutaProtegida roles={ROLES_PERSONAL}>
                        <PanelClientes />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="medios-pago"
                    element={
                      <RutaProtegida roles={ROLES_PERSONAL}>
                        <PanelMediosPago />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="promociones"
                    element={
                      <RutaProtegida roles={ROLES_PERSONAL}>
                        <PanelPromociones />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="usuarios"
                    element={
                      <RutaProtegida roles={['administrador']}>
                        <PanelUsuarios />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="solicitudes-vendedor"
                    element={
                      <RutaProtegida roles={['administrador']}>
                        <PanelSolicitudesVendedor />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="tiendas"
                    element={
                      <RutaProtegida roles={['administrador']}>
                        <PanelTiendas />
                      </RutaProtegida>
                    }
                  />
                </Route>

                <Route path="*" element={<NoEncontrada />} />
              </Routes>

              <Footer />
            </AvisosProvider>
          </FavoritosProvider>
        </CarritoProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
