# Mapa del sistema

Pantalla (frontend) → ruta de la API → controlador → servicio → modelo/tabla.

| Pantalla | Ruta API | Controlador | Servicio | Modelo(s) / tabla(s) |
|---|---|---|---|---|
| Inicio (`Home.jsx`) | `GET /api/productos`, `GET /api/categorias` | `producto.controller.js`, `categoria.controller.js` | `producto.service.js`, `categoria.service.js` | `producto`, `categoria` |
| Catálogo (`Catalogo.jsx`) | `GET /api/productos?idCategoria=&idTipoMascota=`, `GET /api/categorias`, `GET /api/tipos-mascota` | `producto.controller.js` | `producto.service.js` (`obtenerProductos` con filtros) | `producto`, `categoria`, `tipomascota` |
| Detalle de producto (`ProductoDetalle.jsx`) | `GET /api/productos/:id` | `producto.controller.js` | `producto.service.js` | `producto` + relaciones |
| Promociones (`Promociones.jsx`) | `GET /api/promociones` | `promocionProducto.controller.js` | `promocionProducto.service.js` | `promocionproducto`, `producto` |
| Carrito (`Carrito.jsx`) | — (estado local, `models/Carrito.js`) | — | — | — |
| Checkout (`Checkout.jsx`) | `GET /api/medios-pago`, `POST /api/ventas` | `medioPago.controller.js`, `venta.controller.js` | `medioPago.service.js`, `venta.service.js` (`registrarVenta`) | `mediopago`, `venta`, `detalleventa`, `producto` |
| Iniciar sesión / Registro (`Login.jsx`, `Registro.jsx`) | `POST /api/usuarios/login`, `POST /api/usuarios/registro` | `usuario.controller.js` | `usuario.service.js` | `usuario`, `cliente` |
| Mi cuenta (`MiCuenta.jsx`) | `GET /api/ventas` (filtrado por sesión) | `venta.controller.js` | `venta.service.js` (`obtenerVentas`) | `venta` + relaciones |
| Detalle de venta (`VentaDetalle.jsx`) | `GET /api/ventas/:id`, `PATCH /:id/cancelar`, `PATCH /:id/enviar` | `venta.controller.js` | `venta.service.js` | `venta`, `detalleventa`, `producto`, `cliente`, `mediopago` |
| Panel → Ventas (`PanelVentas.jsx`) | `GET /api/ventas?idCliente=&idProveedor=` | `venta.controller.js` | `venta.service.js` (incluye `obtenerIdsVentaPorProveedor`) | `venta`, `detalleventa`, `producto`, `cliente` |
| Panel → Nueva venta (`PanelNuevaVenta.jsx`) | `POST /api/ventas` (con `idCliente` explícito) | `venta.controller.js` | `venta.service.js` (`registrarVenta`) | igual que checkout |
| Panel → Productos (`PanelProductos.jsx`) | `GET/POST/PUT/DELETE /api/productos`, `PATCH /:id/stock` | `producto.controller.js` | `producto.service.js` | `producto` |
| Panel → Categorías / Tipos de mascota / Medios de pago / Proveedores / Clientes | CRUD de cada uno | `*.controller.js` respectivo | `*.service.js` respectivo | tabla respectiva |
| Panel → Promociones (`PanelPromociones.jsx`) | CRUD `/api/promociones` | `promocionProducto.controller.js` | `promocionProducto.service.js` | `promocionproducto` |
| Panel → Cuentas internas (`PanelUsuarios.jsx`) | `POST /api/usuarios` | `usuario.controller.js` | `usuario.service.js` (`crearUsuarioInterno`) | `usuario` |

Todas las rutas pasan por `src/middlewares/autenticacion.middleware.js`
(cuando corresponde) y `src/middlewares/error.middleware.js` (siempre, al
final de la cadena) — ver [backend-autenticacion.md](backend-autenticacion.md)
y [backend-api.md](backend-api.md).
