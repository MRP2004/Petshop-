import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { CarritoProvider } from './context/CarritoContext.jsx';
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
import NoEncontrada from './pages/NoEncontrada.jsx';

import PanelLayout from './pages/panel/PanelLayout.jsx';
import PanelInicio from './pages/panel/PanelInicio.jsx';
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

// PromocionesPublico reutiliza la misma API de solo lectura; el listado
// público de promociones (sin gestión) vive directamente acá porque es
// mínimo, no amerita un archivo aparte.
import Promociones from './pages/Promociones.jsx';

const ROLES_PERSONAL = ['vendedor', 'administrador'];

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CarritoProvider>
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
                <RutaProtegida roles={['cliente']}>
                  <Checkout />
                </RutaProtegida>
              }
            />
            <Route
              path="/mi-cuenta"
              element={
                <RutaProtegida roles={['cliente']}>
                  <MiCuenta />
                </RutaProtegida>
              }
            />
            <Route
              path="/mis-compras/:id"
              element={
                <RutaProtegida roles={['cliente']}>
                  <VentaDetalle />
                </RutaProtegida>
              }
            />

            <Route
              path="/panel"
              element={
                <RutaProtegida roles={ROLES_PERSONAL}>
                  <PanelLayout />
                </RutaProtegida>
              }
            >
              <Route index element={<PanelInicio />} />
              <Route path="ventas" element={<PanelVentas />} />
              <Route path="ventas/nueva" element={<PanelNuevaVenta />} />
              <Route path="ventas/:id" element={<VentaDetalle />} />
              <Route path="productos" element={<PanelProductos />} />
              <Route path="categorias" element={<PanelCategorias />} />
              <Route path="tipos-mascota" element={<PanelTiposMascota />} />
              <Route path="proveedores" element={<PanelProveedores />} />
              <Route path="clientes" element={<PanelClientes />} />
              <Route path="medios-pago" element={<PanelMediosPago />} />
              <Route path="promociones" element={<PanelPromociones />} />
              <Route
                path="usuarios"
                element={
                  <RutaProtegida roles={['administrador']}>
                    <PanelUsuarios />
                  </RutaProtegida>
                }
              />
            </Route>

            <Route path="*" element={<NoEncontrada />} />
          </Routes>

          <Footer />
        </CarritoProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
