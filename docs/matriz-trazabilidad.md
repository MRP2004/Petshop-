# Matriz de trazabilidad: requisito → implementación → prueba → estado real

Cubre el pedido de la **ronda 2** (rediseño integral) y el cierre de la
**Etapa 9**. Última actualización: 2026-09-27.

## Cómo leer el estado

- **Completo**: implementado y demostrado por al menos una prueba automática
  que se ejecutó en esta ronda.
- **Completo (visual)**: implementado. Solo se verificó mirando la
  interfaz o las capturas, sin prueba automática que lo afirme.
- **Parcial**: una parte está hecha y probada, y otra no. La columna de
  notas dice cuál.
- **Pendiente**: no está implementado. Puede ser por decisión de alcance o
  porque le corresponde a otra persona.

"Ejecutada en esta ronda" quiere decir: la suite que la contiene pasó
completa el 2026-09-27. Números en
[estado-proyecto.md](estado-proyecto.md), "Decimonovena corrección". Nada
de esta tabla se da por verificado solo porque está documentado.

Abreviaturas de rutas: `test/` y `test-integracion/` son de `backend/`
(unitarias sin base y de integración contra MySQL real `petshop_test`);
`*.test.jsx` son de `frontend/src/` (Vitest); `e2e/` es `frontend/e2e/`
(Playwright contra `petshop_e2e`, en 3 viewports).

## 1. Identidad visual y honestidad

| Requisito | Implementación | Prueba que lo demuestra | Estado |
|---|---|---|---|
| Paleta v2 (verde) con contraste AA | Tokens en `frontend/src/index.css` | Contraste calculado y revisado por Codex (Etapa 1). Capturas en 3 viewports. | Completo (visual) |
| Footer sin domicilio, teléfono ni correo inventados | `Footer.jsx` | Capturas | Completo (visual) |
| Hero sin "envío a todo el país" | `Home.jsx` | Capturas | Completo (visual) |
| "Ofertas del mes" solo si la promoción está vigente y se descuenta al pagar | Se quitó el botón: hoy ninguna promoción se descuenta al pagar | — | **Pendiente**: lo resuelve el compañero a cargo de promociones. No se implementó acá. |

## 2. Buscador predictivo

| Requisito | Implementación | Prueba que lo demuestra | Estado |
|---|---|---|---|
| Sugerencias con imagen, nombre y precio | `GET /api/productos/sugerencias`, `BuscadorPredictivo.jsx` | `test-integracion/productoSugerencias.integracion.js`, `BuscadorPredictivo.test.jsx` | Completo |
| Teclado, respuestas viejas descartadas, `%` y `_` literales | Idem | Idem. `e2e/recorrido-completo.spec.js` busca por el encabezado. | Completo |
| No sugerir productos de tiendas suspendidas | Filtro `SOLO_TIENDAS_NO_SUSPENDIDAS` | `productoSugerencias.integracion.js` (tienda suspendida) | Completo |

## 3. Cuenta, diálogos y dirección

| Requisito | Implementación | Prueba que lo demuestra | Estado |
|---|---|---|---|
| Nombre real en la barra, sin guardarlo en el JWT | `GET /api/usuarios/perfil` con consulta fresca | `AuthContext.test.jsx`, `test/sesionYCsrf.test.js` | Completo |
| Menú de cuenta accesible (mouse y teclado) | `CuentaMenu.jsx` | `CuentaMenu.test.jsx` | Completo |
| Confirmaciones reutilizables (cancelar, aprobar, eliminar, salir) y ajuste de stock sin `window.prompt` | `ConfirmDialog.jsx`, `AjustarStockDialog.jsx` | `ConfirmDialog.test.jsx`, `AjustarStockDialog.test.jsx`, `e2e/recorrido-completo.spec.js` (cancelación con confirmación) | Completo |
| "Nueva venta" mostró $0 una vez | Se revisó `PanelNuevaVenta.jsx` | — | No reproducido: no hay evidencia de un defecto (ver Etapa 3). |
| Dirección argentina estructurada con Georef, provincia y localidad validadas por id | `direccioncliente`, `georef.service.js`, `DireccionForm.jsx` | `test-integracion/direccionCliente.integracion.js` (Georef real), `test/georef.test.js`, `DireccionForm.test.jsx`, `Registro.test.jsx`, `MiCuenta.test.jsx` | Completo |
| Dirección precargada en el checkout | `Checkout.jsx` | `Checkout.test.jsx` | Completo |
| Dirección **estructurada** guardada en cada venta | La venta guarda un texto libre (`direccionentrega`), no los campos | — | **Parcial**: se decidió en la Etapa 4 no tocar `direccionentrega`. |

## 4. Favoritos y avisos

| Requisito | Implementación | Prueba que lo demuestra | Estado |
|---|---|---|---|
| Favoritos propios, sin duplicados y sin acceso a los de otro | Tabla `favorito` (único `idCliente`+`idProducto`) | `test-integracion/favorito.integracion.js`, `test/favoritoEntradasInvalidas.test.js`, `BotonFavorito.test.jsx`, `Favoritos.test.jsx`, `FavoritosContext.test.jsx` | Completo |
| Avisos in-app: compra confirmada, cambios de estado, cancelación, solicitud nueva al personal | `aviso.service.js`, `Campana.jsx` | `test-integracion/aviso.integracion.js`, `Campana.test.jsx`, `AvisosContext.test.jsx` | Completo. Se actualizan cada 30 s (no hay notificación en tiempo real). |
| **Etapa 9**: aviso al dueño de cada tienda que participa de una venta, sin montos ni líneas ajenas, sin duplicados | `notificarTiendasParticipantes` en el checkout y en la venta manual | `test-integracion/marketplaceCompra.integracion.js` (compra mixta, reintento idempotente, venta manual), `e2e/vendedor-independiente.spec.js` | Completo |

## 5. Estados de pedido

| Requisito | Implementación | Prueba que lo demuestra | Estado |
|---|---|---|---|
| Retiro: registrada → lista para retirar → entregada. Envío: registrada → enviada → entregada. | ENUM `venta.estado` ampliado (migración Etapa 7) y transiciones en `venta.service.js` | `test-integracion/aviso.integracion.js` (transiciones reales), `VentaDetalle.test.jsx`, `e2e/recorrido-completo.spec.js` (retiro hasta entregada) | Completo |
| Ventas históricas sin reinterpretar | Migración solo aditiva | `scripts/verificarMigracionRonda2Etapa7.js`, ensayo de actualización | Completo en `petshop_test`. `petshop_db`: pendiente de Mauro. |

## 6. Marketplace de vendedores independientes

| Requisito | Implementación | Prueba que lo demuestra | Estado |
|---|---|---|---|
| "Quiero ser vendedor" con CUIL/CUIT (formato y dígito verificador) | `solicitudvendedor`, `validacionFiscal.js`, `SolicitudVendedor.jsx` | `test/validacionFiscal.test.js`, `test-integracion/tienda.integracion.js`, `SolicitudVendedor.test.jsx`, `e2e/vendedor-independiente.spec.js` | Completo. **No** consulta AFIP: solo valida el formato. |
| Aprobación por un administrador (crea la tienda y cambia el rol, todo o nada) | `resolverSolicitudVendedor` | `tienda.integracion.js`, `e2e/vendedor-independiente.spec.js` | Completo |
| El vendedor sigue pudiendo comprar | Conserva su `idCliente` | `tienda.integracion.js` | Completo |
| Productos propios: crear, editar, borrar y ajustar stock solo de la tienda propia | `producto.service.js` (`verificarPropietarioProducto`, `resolverTiendaPropiaActiva`) | `test-integracion/permisosCruzados.integracion.js` (HTTP, login real), `tienda.integracion.js`, `e2e/vendedor-independiente.spec.js` | Completo |
| "Vendido por" en el catálogo | `ProductCard.jsx`, `ProductoDetalle.jsx` | `ProductCard.test.jsx`, `e2e/vendedor-independiente.spec.js` | Completo |
| "Mis ventas" solo con las líneas y el subtotal propios | DTO armado a mano en `tienda.service.js` | `tienda.integracion.js`, `permisosCruzados.integracion.js`, `marketplaceCompra.integracion.js`, `e2e/vendedor-independiente.spec.js` | Completo |
| Tienda suspendida fuera del catálogo, del detalle y de las sugerencias | Filtro `SOLO_TIENDAS_NO_SUSPENDIDAS` | `tienda.integracion.js`, `productoSugerencias.integracion.js` | Completo |
| **Etapa 9**: tienda suspendida sin cotización, compra ni venta manual, también ante suspensión simultánea | `disponibilidadTienda.js` (FOR SHARE después de los productos) | `marketplaceCompra.integracion.js` (bloqueos reales en ambos órdenes), `Checkout.test.jsx` (mensaje y volver al carrito) | Completo. El carrito no se limpia solo: el cliente ve el motivo y vuelve a quitarlo. |
| **Etapa 9**: orden de bloqueos producto → tienda también al editar o borrar | `actualizarProducto` y `eliminarProducto` bloquean el producto primero | `marketplaceCompra.integracion.js` (sonda `NOWAIT`; se comprobó que falla sin el cambio) | Completo |
| **Etapa 9**: compra mixta (PetShop y dos tiendas): precio, stock, avisos, vista de cada vendedor | Checkout existente más lo de arriba | `marketplaceCompra.integracion.js` | Completo en cobro, stock, avisos y vistas |
| Preparación o entrega separada por tienda en una compra mixta | No existe: la compra tiene un solo estado | — | **Pendiente**: decisión de alcance. Hay que acordarlo con Mauro antes de rediseñar estados o logística. |
| El vendedor independiente gestiona el estado de sus pedidos | No: solo los consulta | `permisosCruzados.integracion.js` confirma el 403 en enviar, entregar y cancelar | **Pendiente**: decisión de alcance. Los estados los gestiona el personal interno. Se aclara en "Mis ventas". |
| Panel separado de la navegación pública (sin buscador ni carrito dentro de `/panel`) | `Navbar.jsx` (`dentroDelPanel`) | Capturas | Completo (visual) |
| Administración de solicitudes y tiendas | `PanelSolicitudesVendedor.jsx`, `PanelTiendas.jsx` | `permisosCruzados.integracion.js` (solo administrador), `e2e/vendedor-independiente.spec.js` (aprobación) | Completo. Suspender desde la interfaz: solo probado por API y servicio, sin E2E. |

## 7. Seguridad, permisos y datos

| Requisito | Implementación | Prueba que lo demuestra | Estado |
|---|---|---|---|
| **Etapa 9**: permisos cruzados por HTTP (cliente, vendedor interno, vendedores A y B, administrador, sin sesión) | Rutas y servicios | `permisosCruzados.integracion.js`: 11 pruebas con login real, cookie y CSRF | Completo |
| **Etapa 9**: acceso por URL directa en el frontend | `RutaProtegida` | `e2e/vendedor-independiente.spec.js` (vendedor a `/panel/ventas`, cliente a `/panel/mis-ventas`, aspirante al panel), `e2e/recorrido-completo.spec.js` | Completo |
| **Etapa 9**: mensaje honesto ante una migración que falla a mitad, con reanudación documentada | `scripts/utilMigracion.js` y los 3 runners | Ensayo real de fallo y reanudación en `petshop_test`, `test/utilMigracion.test.js` | Completo |
| **Etapa 9**: migración de la Etapa 8 idempotente también con una FK de otro nombre y columnas incompatibles | `migracionRonda2Etapa8.js` | `scripts/verificarMigracionRonda2Etapa8.js` (3 casos nuevos) | Completo |
| **Etapa 9**: guía para actualizar una base existente (respaldo, orden, verificación, recuperación) | [actualizacion-base-existente.md](actualizacion-base-existente.md), `crearTablasNuevas.js`, `verificarEsquemaActual.js` | Ensayo completo en `petshop_test`, incluida la restauración del respaldo | Completo en `petshop_test`. **Aplicarlo a `petshop_db`: pendiente de Mauro.** |
| Checkout idempotente, pago simulado y comprobante (CU-04) | `compra.service.js` y otros | `test-integracion/compra.integracion.js`, `ventaConcurrencia.integracion.js`, 6 casos de CU-04 en `e2e/recorrido-completo.spec.js` | Completo |
| Deploy | — | — | **Pendiente** |
| Reglas de promociones aplicadas al total | — | — | **Pendiente**: corresponde a un compañero. |
| Filtros de catálogo | Los mantienen los compañeros | — | Fuera de alcance de esta ronda. No se modificaron. |

## Límites de cobertura conocidos

- `e2e/vendedor-independiente.spec.js` compra **solo** el producto del
  vendedor nuevo. La compra mixta con tres orígenes está probada en
  integración contra MySQL real, no de punta a punta en el navegador.
- La suspensión de una tienda desde `PanelTiendas.jsx` no tiene E2E. El
  efecto se prueba por servicio y por HTTP.
- La concurrencia se prueba con bloqueos reales retenidos por una conexión
  controlada (determinista). No es una prueba de carga.
- No hay pruebas automáticas de contraste ni de diseño: se revisaron por
  cálculo y con capturas.
- Georef real se usa en `direccionCliente.integracion.js`. Si la API
  oficial no responde, esa prueba depende de la red.
