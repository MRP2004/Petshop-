# Estado del proyecto

Última actualización: quinta corrección — aislamiento E2E verificado de
punta a punta (frontend realmente servido, no solo su configuración
declarada) sobre la primera versión funcional completa (backend +
frontend + MySQL conectados, autenticación, panel de gestión). Ver
"Cuarta corrección" y "Quinta corrección" más abajo para el detalle.

## Niveles usados en esta tabla

1. **Implementada**: el código existe y compila/corre, pero no tiene una
   prueba automatizada que la ejercite.
2. **Probada sin base**: tiene una prueba automatizada, pero esa prueba no
   toca MySQL (lógica pura o falla antes de la base).
3. **Verificada** (con MySQL real, o extremo a extremo con backend+frontend
   reales): se ejecutó de verdad y la prueba pasó. Se indica explícitamente
   **cuándo** se ejecutó por última vez: una verificación de una entrega
   anterior no se re-declara automáticamente vigente si el código relevante
   cambió después.
4. **Pendiente**: no implementada, o implementada pero sin ninguna prueba.

**Nota sobre esta tabla (actualizada en la quinta corrección)**: en
entregas anteriores, varias filas decían "E2E real ejecutado y pasando"
refiriéndose a una corrida contra `petshop_db` (desarrollo) previa al
cambio de estrategia de sesión (cookies HttpOnly), sin re-confirmar
después. **Eso ya no aplica**: la suite E2E (`npx playwright test`) se
ejecutó de verdad contra el backend/frontend aislados (`petshop_e2e`, no
`petshop_db`) en la cuarta y la quinta corrección, con resultado real
**18/18**. Importante para no sobrestimar lo que eso cubre: son **6 casos
de prueba distintos** (`recorrido-completo.spec.js`: 5;
`capturas.spec.js`: 1), cada uno corrido en 3 viewports (mobile/tablet/
desktop) — 6 × 3 = 18 ejecuciones, **no 18 funcionalidades distintas
probadas**, y de ninguna manera una cobertura completa de todos los CRUD
o casos de uso del proyecto (ver el detalle de qué cubre cada caso en
[frontend-pruebas.md](frontend-pruebas.md)). La integración real
(`npm run test:integracion`) también se ejecutó, **30/30** contra
`petshop_test`. Cada fila de las tablas de abajo cita, cuando corresponde,
cuál de estas dos suites la cubre — y cuando no la cubre ninguna, lo dice
explícitamente en vez de heredar el nivel de una fila relacionada.

## Regularidad (mínimo obligatorio)

| Requisito | Nivel | Evidencia |
|---|---|---|
| CRUD Cliente, Proveedor, Producto, TipoMascota (simples/dependientes) | 3. Verificada | CRUD completo + pruebas sin base (`test/crudEntradasInvalidas.test.js`, dentro de los 177/177 actuales) + panel de gestión (`PanelClientes.jsx`, etc.) + integración real (`test-integracion/crudBasico.integracion.js`, dentro de los 30/30, contra `petshop_test`). El recorrido de cliente en el catálogo, no el CRUD de personal, está cubierto además por E2E real (`recorrido-completo.spec.js`). |
| CRUD Producto {depende de} Categoría y TipoMascota | 3. Verificada | `producto.service.js` valida las relaciones; `PanelProductos.jsx` las gestiona con selects cargados de la API real; `test-integracion/stockYProducto.integracion.js` (dentro de los 30/30). |
| CRUD PromocionProducto {depende de} Producto y "TipoCategoria" | 3. Verificada (CRUD + validación de calendario), 4. Pendiente (reglas de aplicación) | Ver sección "PromocionProducto" más abajo. |
| Listado de productos filtrado por categoría o tipo de mascota, con detalle | 2. Probada sin base + 3. Verificada por E2E real | `GET /api/productos?idCategoria=&idTipoMascota=`, `Catalogo.jsx` + `ProductoDetalle.jsx`; recorrido de búsqueda cubierto por `recorrido-completo.spec.js` (18/18 real); capturas de los tres viewports en `capturas.spec.js`. |
| Listado de ventas filtrado por cliente o proveedor, con detalle | 2. Probada sin base | `GET /api/ventas?idCliente=&idProveedor=`, `PanelVentas.jsx` + `VentaDetalle.jsx`. El filtro por proveedor es una interpretación propuesta (ver más abajo), sin caso de prueba E2E propio — el filtro no forma parte de ningún caso cubierto por `recorrido-completo.spec.js`. |
| CUU: Registrar una venta | 3. Verificada, E2E real | `recorrido-completo.spec.js` ("iniciar sesión, buscar un producto, agregar al carrito, confirmar la compra y cancelarla" y "un vendedor puede cargar una venta... y marcarla como enviada"), dentro de los 18/18 reales contra `petshop_e2e`. También `test-integracion/ventaConcurrencia.integracion.js` (dentro de los 30/30). Ver [casos-de-uso.md](casos-de-uso.md). |
| CUU: Cancelar una venta | 3. Verificada, E2E real | Mismo caso de arriba (confirma y cancela en el mismo recorrido); `test-integracion/*.integracion.js` cubre además el rollback real de stock. |

## Aprobación Directa / Examen

| Requisito | Nivel | Evidencia |
|---|---|---|
| Todos los CRUD de regularidad + Categoría, MedioPago, Venta, DetalleVenta | 3. Verificada | Los 6 CRUD simples/dependientes completos; Venta/DetalleVenta se gestionan como unidad (registrar/cancelar/enviar), con integración real (30/30) y el recorrido de venta cubierto por E2E real (18/18). |
| CUU: Cambiar el estado del pedido una vez enviado (marcar como enviada) | 3. Verificada, E2E real | `recorrido-completo.spec.js` ("un vendedor puede cargar una venta para un cliente y marcarla como enviada"), dentro de los 18/18. Ver [casos-de-uso.md](casos-de-uso.md). |
| Cuarto caso de uso (necesario para 4 integrantes) | 4. Pendiente | Ver "Pendientes de alcance" más abajo — no se inventó uno para completar el casillero. |
| 1 test automatizado por integrante (4) | 3. Verificada (de sobra) | **177** pruebas backend sin base + **27** pruebas frontend unitarias (Vitest) + **30** de integración real (MySQL, `petshop_test`) + **18** E2E real (Playwright, `petshop_e2e`, 6 casos × 3 viewports) — las cuatro suites ejecutadas y pasando, ver "Cuarta corrección"/"Quinta corrección". |
| 1 test de integración | 3. Verificada | `test-integracion/*.integracion.js`, **30/30, real contra MySQL** (`petshop_test`) — el bloqueo de privilegios que lo impedía está resuelto desde la tercera corrección; la contraseña se completó y se ejecutó de verdad en la cuarta corrección. |
| Login con autenticación propia y al menos 2 niveles de acceso | 3. Verificada | Ver [backend-autenticacion.md](backend-autenticacion.md): 3 roles, sesión por cookies HttpOnly + CSRF, probado sin base (`test/usuarioEntradasInvalidas.test.js`, `test/sesionYCsrf.test.js`) y por E2E real (login de cliente y de vendedor, credenciales incorrectas, dentro de los 18/18). |
| Proteger rutas según nivel de acceso | 3. Verificada | Middlewares `requiereAutenticacion`/`requiereRol`/`permitirPropioClienteOStaff` (backend); `RutaProtegida` (frontend, UX). Acceso a compras ajenas probado sin base (`test/ventaAccesoAjeno.test.js`); acceso denegado al panel para un cliente autenticado probado por E2E real (`recorrido-completo.spec.js`, dentro de los 18/18). |
| Definir ambientes (.env) | 3. Verificada | `.env`/`.env.example` en backend y frontend; `.env.test.example`/`.env.test` (integración) y `.env.e2e.example`/`.env.e2e` (E2E), los cuatro con sus propias bases, usuarios y puertos — los dos últimos ya verificados con ejecuciones reales, no solo declarados. |
| Frontend: framework, HTML5, CSS mobile-first, 3 breakpoints, eventos, errores, reactividad, input/output property, ≥1 servicio, modelos con clases | 3. Verificada | React + Vite; `src/index.css` + CSS por componente, mobile-first. Los 3 breakpoints (`sm-mobile`/`md-tablet`/`lg-desktop`) se verifican en cada corrida real de `recorrido-completo.spec.js` y `capturas.spec.js` (18/18, no solo con capturas estáticas). |
| Frontend: 1 test unitario de componente | 3. Verificada | `src/components/ProductCard.test.jsx` + otros, dentro de los 27/27 actuales. |
| Frontend: 1 test end-to-end | 3. Verificada, real | `e2e/recorrido-completo.spec.js`, **18/18 real** contra el backend/frontend aislados de E2E (`petshop_e2e`), no contra desarrollo — ejecutado y reproducido varias veces en la cuarta y quinta corrección (ver ahí el detalle de qué se verificó cada vez). |
| Frontend: login + protección según niveles del backend | 3. Verificada | `AuthContext` (sesión por cookies), `RutaProtegida`, navegación condicional por rol — cubierto tanto sin base (`AuthContext.test.jsx`) como por E2E real. |

## Corrección crítica: campos comerciales reservados a personal

La revisión independiente reprodujo (por HTTP, con persistencia simulada)
que un cliente autenticado podía mandar `descuento` en el cuerpo de
`POST /api/ventas` y el backend lo aplicaba igual: una compra de $100 con
`descuento: 100` quedaba registrada con total $0. Corregido en
`venta.service.js#registrarVenta`: si quien compra es un cliente,
`descuento` y `minimoMayorista` se ignoran por completo (ni se leen del
cuerpo), igual que ya pasaba con `idCliente`. Solo personal puede fijarlos.
Prueba de regresión: `test/ventaDescuentoAutorizacion.test.js` (158/158 en
la corrida completa). Ver [backend-autenticacion.md](backend-autenticacion.md).

## Envío a domicilio

Completado en esta corrección: `metodoEntrega` ahora se valida contra
exactamente dos valores reconocidos; "envío a domicilio" exige
`direccionEntrega` (8 a 200 caracteres) y la venta se rechaza sin ella (no
se puede confirmar un envío sin domicilio). El domicilio se guarda en una
tabla nueva, `direccionentrega` (1 a 1 con `venta`), no en una columna
agregada a `venta` — ver
[backend-base-de-datos.md](backend-base-de-datos.md) para la razón técnica
concreta (agregar la columna directamente rompió, en la práctica, todas
las operaciones sobre `Venta` contra la base de desarrollo sin migrar; una
tabla nueva no tiene ese problema). El checkout público
(`Checkout.jsx`) y la venta manual del panel (`PanelNuevaVenta.jsx`)
piden y validan la dirección en el frontend antes de habilitar "Confirmar
compra"/"Registrar venta". Probado sin base
(`test/ventaEntradasInvalidas.test.js`, `test/ventaDescuentoAutorizacion.test.js`).

## PromocionProducto

Se encontró una tabla `promocionproducto` ya creada en la base de
desarrollo (huérfana, sin modelo/servicio/ruta previos —
[backend-base-de-datos.md](backend-base-de-datos.md)): `idPromocionProducto`,
`fechaInicio`/`fechaFin` (`DATE`), `descuento` (`DECIMAL(5,2)`),
`idProducto` (FK **obligatoria** a `producto`), `idCategoria` (FK
**opcional** a `categoria`).

Esa FK a `categoria` (no a ninguna tabla "TipoCategoria", que no existe en
la base) es la evidencia concreta de que la referencia a "TipoCategoria" en
`proposal.md` es, casi con certeza, un error de tipeo por "Categoria" — se
tomó esa interpretación para implementar el CRUD, reutilizando la tabla
existente tal cual (no se recreó ni se le cambió la forma).

**Lo que se implementó**: CRUD completo (`POST`/`GET`/`PUT`/`DELETE
/api/promociones`, lectura pública, escritura solo personal),
`PanelPromociones.jsx` en el panel de gestión, y un listado público
(`Promociones.jsx`) **con un aviso explícito** de que el descuento listado
no se aplica en el checkout (corrección de esta etapa: antes el listado
mostraba "Descuento: X" sin esa aclaración, lo que podía leerse como una
promesa de precio).

**Corrección de esta etapa — validación de calendario real**: `fechaInicio`/
`fechaFin` antes solo se validaban por formato (`AAAA-MM-DD`) y con
`new Date()`, que **no rechaza** una fecha de calendario inválida (p. ej.
`"2026-02-30"`): la normaliza en silencio a otro día real (2 de marzo).
Ahora se arman los componentes de la fecha y se comprueba que la fecha
resultante coincida exactamente con lo pedido; si no, se rechaza con `400`.
Probado en `test/promocionEntradasInvalidas.test.js` (30 de febrero, 31 de
abril, mes 13, 29 de febrero en año bisiesto vs. no bisiesto).

**Lo que NO se implementó, a propósito**: ninguna regla de aplicación
automática. No está confirmado si `descuento` es un porcentaje o un monto
fijo, cómo interactúa con el `descuento` manual que ya existe en `Venta`,
ni qué pasa si dos promociones vigentes se superponen sobre el mismo
producto. Mientras eso no se confirme, `registrarVenta` sigue calculando el
total exactamente igual que antes (precio × cantidad − descuento manual,
este último ahora restringido a personal, ver arriba); ninguna promoción se
resta automáticamente.

**Propuesta concreta a confirmar** (no aplicada todavía): interpretar
`descuento` como un porcentaje (0-100), que se aplique al producto exacto
(`idProducto`) y, si además tiene `idCategoria`, quede acotado a esa
categoría; ante superposición, tomar la de mayor descuento; y que la
promoción se combine con el descuento manual sumando ambos descuentos hasta
un tope del subtotal (nunca un total negativo). Pendiente de que Mauro la
confirme o proponga otra. **Todas estas decisiones de promoción pendientes
quedan agrupadas acá, en un solo lugar**, para que sea fácil revisarlas
juntas.

## Filtro de ventas por proveedor: interpretación propuesta

`Venta` no tiene una relación directa con `Proveedor` (una misma venta
puede incluir productos de proveedores distintos). Se implementó
`?idProveedor=` en `GET /api/ventas` como "ventas que incluyen al menos un
producto de ese proveedor" (`obtenerIdsVentaPorProveedor` en
`venta.service.js`, vía `DetalleVenta → Producto → Proveedor`). Es una
propuesta razonable pero no la única posible (alternativa: solo ventas
donde *todos* los productos son del mismo proveedor); queda pendiente de
confirmación.

## Autenticación, sesión y niveles de acceso

Implementado con JWT + `scrypt` (ver
[backend-autenticacion.md](backend-autenticacion.md)): 3 roles, registro
público que siempre crea `cliente`, alta interna de `vendedor`/
`administrador` solo por un administrador ya autenticado, identidad de
compra derivada de la sesión.

**Corrección de esta etapa — estrategia de sesión**: antes, el JWT viajaba
en el cuerpo de la respuesta de login y el frontend lo guardaba en
`localStorage`, legible por cualquier script que corriera en la página
(vector clásico de robo de sesión por XSS). Ahora la sesión vive en una
cookie **HttpOnly**, inaccesible para JavaScript. Se agregó protección CSRF
(patrón double-submit cookie: una segunda cookie legible + header
`X-CSRF-Token`) para las solicitudes que cambian estado autenticadas por
cookie, y un límite de intentos (8 logins/15 min, 5 registros/hora, por
IP+email) contra fuerza bruta. Manejo explícito de expiración (401 limpia
la sesión en el frontend), cierre de sesión (`POST /api/usuarios/logout`,
limpia el estado local aunque el pedido falle) y ausencia de
`localStorage` para la sesión (ya no es un modo de falla posible para
ella). Detalle completo, incluidas las limitaciones conocidas del límite
de intentos (en memoria, por proceso), en
[backend-autenticacion.md](backend-autenticacion.md).

## Concurrencia de ventas y stock

Sin cambios de comportamiento desde la etapa anterior de estabilización:
`registrarVenta`/`cancelarVenta`/`marcarVentaComoEnviada`/
`ajustarStockProducto` siguen usando transacción + bloqueo de fila. Las
pruebas de integración que lo demostrarían contra MySQL real siguen sin
poder ejecutarse (bloqueo de privilegios, re-verificado de forma read-only
en esta corrección).

## Base de datos reproducible

`sync()` no destructivo, sin cambios en el mecanismo. Esta corrección
agregó una tabla nueva (`direccionentrega`, ver arriba) usando el mismo
mecanismo ya establecido (sin `ALTER TABLE`, sin migración manual — se creó
sola). `scripts/sembrarDatosDemo.js` (de la entrega anterior) no se
modificó ni se volvió a correr en esta corrección.

**Bloqueo sin resolver, sin cambios**: `petshop_app` sigue sin privilegios
de `CREATE DATABASE`/`CREATE USER` (`GRANT USAGE ON *.*` + `ALL PRIVILEGES`
únicamente sobre `petshop_db`, confirmado con `SHOW GRANTS` — solo lectura,
sin reintentar la creación). Paso mínimo exacto para desbloquear, en
[backend-base-de-datos.md](backend-base-de-datos.md).

## Operaciones de demostración sobre la base de desarrollo (registro exacto)

Por instrucción explícita, esta corrección **no borra ni restaura** datos
de desarrollo automáticamente; se registra acá, con exactitud, qué hay y de
dónde salió, verificado por lectura directa en esta corrección:

- **Ventas `#1` y `#2`** (`idCliente` = "Mauro Perez"), fecha `2026-07-21`:
  anteriores a esta serie de correcciones (pruebas manuales previas de
  Mauro).
- **Ventas `#3` a `#12`** (`idCliente` = "Cliente De Prueba"), fecha
  `2026-09-09`/`2026-09-10`: generadas por la entrega anterior (pruebas
  manuales por HTTP + la corrida completa de `e2e/recorrido-completo.spec.js`,
  15 pruebas). Incluye 3 ventas en estado `enviada` sobre "Rascador para
  gatos" (stock bajó de 10 a 7 y **no se restituye**: enviar una venta no
  devuelve stock, solo cancelarla lo hace) y varias `cancelada`.
- **Ninguna venta nueva** se agregó en **esta** corrección: se comprobó
  contando filas de `venta` antes y después de cada verificación manual y
  del script de capturas de pantalla (10 pantallas × 3 viewports, todas de
  solo lectura, sin clic en "Confirmar compra" en ningún caso) — el conteo
  se mantuvo en 12 en los tres momentos en que se verificó.
- **Usuarios de prueba** (`admin@petshop.demo`, `vendedor@petshop.demo`,
  `cliente@petshop.demo`): de la entrega anterior, sin cambios.

## Segunda corrección: aislamiento E2E, límites por IP, logout, documentación e imágenes

Una revisión posterior a la corrección anterior (que ya había confirmado
158/165 → ahora 165/165 backend y 16/16 → ahora 21/21 frontend, ver abajo)
encontró cinco puntos concretos sin completar. Estado de cada uno,
verificado en esta corrección:

1. **Aislamiento E2E**: preparado, no ejecutado. Se agregó
   `backend/.env.e2e.example`, se generalizó
   `backend/scripts/prepararBaseTest.js` para aceptar también nombres de
   base con `"e2e"` (antes solo `"test"`), y se documentó el procedimiento
   completo con comandos exactos (ver
   [backend-base-de-datos.md](backend-base-de-datos.md), "Base aislada
   para E2E", y [frontend-pruebas.md](frontend-pruebas.md), "Aislamiento
   para E2E"). No se pudo crear la base `petshop_e2e` en sí: requiere la
   misma intervención administrativa de MySQL que sigue bloqueada para
   `petshop_test` (`SHOW GRANTS` re-verificado, sin privilegios globales).
   Lo que no dependía de esa intervención —la configuración, el script, la
   documentación— sí se completó.
2. **Límites por IP**: corregido. La única capa que existía (IP+email)
   tenía un punto ciego real: probar muchos emails distintos desde la
   misma IP nunca se bloqueaba (cada email es una clave nueva). Se agregó
   una segunda capa por IP sola, encadenada antes de la anterior (ver
   [backend-autenticacion.md](backend-autenticacion.md), "Límite de
   intentos"). Probado en `test/limiteIntentosPorIp.test.js` (4 pruebas):
   reproduce el punto ciego original con la configuración previa y
   confirma que la capa nueva lo frena.
3. **Logout fallido**: corregido en esta etapa (**superado por una
   corrección posterior, ver "Tercera corrección" más abajo — esta
   entrada queda como registro histórico, no describe el comportamiento
   actual**). `AuthContext.jsx#cerrarSesion` limpiaba el estado local en
   un `finally` pero dejaba que el error de red se siguiera propagando
   después, quedando como un rechazo de promesa sin atrapar (nadie en
   `Navbar` espera esa promesa). En esta corrección se atrapó
   explícitamente, pero **el estado local se seguía limpiando aunque el
   cierre hubiera fallado** — un cierre que no había ocurrido, presentado
   como si hubiera ocurrido; ese defecto es justamente lo que corrige la
   entrada de "Tercera corrección". Probado entonces en
   `frontend/src/context/AuthContext.test.jsx` (2 pruebas: logout que
   falla por red y logout exitoso, ambas verificaban que el estado quedara
   limpio — ese archivo tiene hoy 5 pruebas, con aserciones distintas, ver
   "Tercera corrección" y [frontend-pruebas.md](frontend-pruebas.md)).
4. **Documentación de `direccionentrega`**: completada. La sección
   "Esquema observado en desarrollo" de
   [backend-base-de-datos.md](backend-base-de-datos.md) (el lugar donde se
   documenta la estructura real de cada tabla, verificada contra
   `information_schema`) no tenía una entrada para `direccionentrega`: solo
   existía la narración de por qué se hizo tabla nueva, sin sus columnas,
   tipos y regla de borrado documentados en el mismo nivel de detalle que
   el resto de las tablas. Se agregó esa entrada (verificada de nuevo por
   lectura directa, de solo lectura).
5. **Imágenes de producto**: completada la infraestructura (sin fabricar
   ninguna foto). Antes, el catálogo solo podía mostrar un ícono por
   categoría, sin ninguna forma de cargar una imagen real por producto. Se
   agregó: una tabla nueva relacionada (`imagenproducto`, mismo criterio
   que `direccionEntrega` — ver
   [backend-base-de-datos.md](backend-base-de-datos.md)), un campo "URL de
   imagen" opcional en el panel de productos, validación de la URL en el
   backend, y un componente (`ImagenProducto.jsx`) que muestra la imagen
   real si existe y cae al ícono por categoría si no hay imagen o si la
   URL cargada no llega a cargar (estado que antes no podía darse). Al
   escribir esto se encontró y corrigió, además, un problema no reportado:
   `eliminarProducto` habría fallado con un error de restricción de clave
   foránea al borrar un producto con imagen cargada (la FK generada queda
   `ON DELETE NO ACTION`, igual que `direccionentrega` → `venta`); ahora
   borra primero la imagen. Probado en `test/productoImagen.test.js` (7
   pruebas: crear, actualizar, reemplazar y borrar la imagen; URL
   inválida o demasiado larga rechazada).

**Verificación de esta corrección**: `npm test` en `backend/` → **169/169**
(158 de la corrección anterior + 7 nuevas de `productoImagen.test.js` + 4
nuevas de `limiteIntentosPorIp.test.js`). `npm test` en `frontend/` →
**21/21** (16 + 2 de `AuthContext.test.jsx` + 3 de
`ImagenProducto.test.jsx`). Lint y `npm run build` del frontend, limpios.
No se ejecutó MySQL de integración ni el E2E completo (mismo motivo que la
corrección anterior). Se creó una tabla nueva (`imagenproducto`) con
`sync()` contra `petshop_db` —mismo mecanismo no destructivo ya usado para
`usuario`/`promocionproducto`/`direccionentrega`, verificado de nuevo por
lectura directa de `information_schema`—; no se escribió ninguna fila de
datos: `SELECT COUNT(*) FROM venta` siguió en **12** y
`SELECT COUNT(*) FROM producto` en **6** antes y después de todo el trabajo
de esta corrección.

## Tercera corrección: bloqueo de MySQL resuelto, aislamiento E2E real, logout, límites por IP y atomicidad

### Bloqueo de MySQL resuelto

Mauro, desde su propia conexión administradora en MySQL Workbench, creó
`petshop_test`/`petshop_test_app` y `petshop_e2e`/`petshop_e2e_app` (ver
[backend-base-de-datos.md](backend-base-de-datos.md), "Bases y usuarios de
prueba"). El bloqueo de privilegios que impidió correr integración y E2E
reales en las dos correcciones anteriores está resuelto. Lo único
pendiente es completar la contraseña de cada usuario en
`backend/.env.test`/`backend/.env.e2e` (dos archivos, un campo
`DB_PASSWORD` cada uno, ya creados a partir de sus `.example` — Mauro los
completa directamente en VS Code, no se piden ni se muestran acá).

### Logout: corregido para no ocultar un fallo como si fuera un cierre exitoso

La corrección anterior atrapaba el error de red de logout pero limpiaba el
estado local de todas formas — presentaba a quien usa la app como
"desconectado" mientras su cookie seguía activa. Ahora el estado local
**solo** se limpia cuando el servidor confirma el cierre o ya no reconoce
la sesión; cualquier otro fallo se muestra (`Navbar.jsx`) y permite
reintentar con el mismo botón. Ver
[backend-autenticacion.md](backend-autenticacion.md) y
`frontend/src/context/AuthContext.test.jsx` (5 pruebas: cierre exitoso,
fallo visible sin relanzar el error, reintento exitoso, sesión ya
inválida tratada como éxito, recarga después de un fallo).

### Aislamiento E2E: de "preparado" a implementado y verificado

**Esta descripción quedó desactualizada por correcciones posteriores —
ver "Cuarta corrección" y "Quinta corrección" más abajo para el mecanismo
actual del `globalSetup`; se deja como registro histórico de esta etapa,
no como el comportamiento vigente.**

Antes solo había documentación y una plantilla de configuración. Ahora hay
cuatro capas reales, cada una probada (ver
[frontend-pruebas.md](frontend-pruebas.md) para el detalle completo):
base distinta (`petshop_e2e`, con guardas propias en
`scripts/sembrarDatosE2E.js`), puertos distintos y estrictos (backend 3001,
frontend 5183, ambos abortan si el puerto está ocupado — verificado
provocando el conflicto de verdad), cookies con nombre distinto por
entorno (`ENTORNO=e2e` en `backend/.env.e2e`, sufijo en
`utils/sesion.js`), y un `globalSetup` de Playwright que verifica
`entorno: "e2e"` contra el backend real antes de correr cualquier prueba
(probado con los tres casos: sin backend, con el entorno correcto, con el
entorno incorrecto).

### Límites por IP: `Map` independiente por instancia

La corrección anterior namespaceaba las claves de un único `Map`
compartido entre las cuatro instancias del limitador. Se encontró (revisión
posterior) que eso no evitaba que la limpieza periódica de una instancia
—que recorre el `Map` entero con su propia ventana— borrara intentos
vigentes de otra instancia con una ventana distinta. Ahora cada instancia
tiene su propio `Map`. Ver
[backend-autenticacion.md](backend-autenticacion.md) y
`test/limiteIntentosPorIp.test.js` (reproduce el escenario exacto con
`node:test`'s `mock.timers`).

### Producto e imagen como una operación atómica

Se reprodujo con persistencia simulada el hallazgo: `ImagenProducto.destroy`
podía "tener éxito" y `producto.destroy` fallar después (relación con
ventas), dejando el producto vivo pero sin imagen. `crearProducto`,
`actualizarProducto` y `eliminarProducto` ahora corren dentro de una única
`sequelize.transaction`, con esa misma transacción pasada a cada
consulta/escritura relacionada (`sincronizarImagenProducto` la recibe como
parámetro en vez de abrir la suya). Probado con persistencia simulada
(`test/productoImagenAtomico.test.js`: cada escritura de una misma
operación recibe el mismo objeto de transacción falso, y un fallo se
propaga sin que nada lo trague) y con **MySQL real**
(`test-integracion/productoImagen.integracion.js`: un borrado bloqueado
por una venta asociada, con `ForeignKeyConstraintError` real, no deja el
producto sin su imagen — resultado real más abajo).

### Esquema: crear una tabla también es un cambio de esquema

Corrección de encuadre: una corrección anterior describió la creación de
`imagenproducto` como si no fuera "ningún cambio" por no tocar filas
existentes. Es un cambio de esquema real (agrega una tabla), solo que uno
seguro con `sync()` porque no altera ninguna tabla ya existente — la
distinción correcta es esa, no "hubo cambio" vs. "no hubo cambio". Las
bases `petshop_test`/`petshop_e2e`, una vez con la contraseña completa,
crean su esquema completo (`usuario`, `promocionproducto`,
`direccionentrega`, `imagenproducto` y las entidades preexistentes) con el
mismo `sequelize.sync()`, sin ninguna intervención manual — ver
[backend-base-de-datos.md](backend-base-de-datos.md).

### Revisión con Codex: impedimento concreto, auto-revisión en su lugar

Se intentó usar el plugin de Codex para una revisión independiente de esta
etapa (pedido explícito). El mecanismo de plugins de Claude Code no está
disponible en este entorno, pero sí hay un `codex` CLI instalado
(`codex-cli 0.154.0`, `npm`) — se intentó invocar directamente. `codex
login status` informa "Logged in using ChatGPT", pero **el token
almacenado no se puede refrescar**: toda invocación real (`codex exec`)
falla con `401 Unauthorized` /
`Your access token could not be refreshed. Please log out and sign in
again.`, reproducido de forma consistente. Arreglar esto requiere `codex
login` interactivo (flujo OAuth en el navegador), que no se puede
completar sin la intervención de Mauro. **No se simuló ninguna revisión de
Codex**: en su lugar, se hizo una auto-revisión adversarial de las cuatro
correcciones de esta etapa (logout, aislamiento E2E, límites por IP,
atomicidad de producto+imagen) releyendo el código actual contra lo
afirmado, sin confiar en la propia descripción previa.

**Hallazgo real de esa auto-revisión** (encontrado, no simulado):
`frontend/src/api/httpClient.js` tenía el nombre de la cookie de CSRF fijo
en `'petshop_csrf'`, sin el sufijo por entorno que sí se le agregó al
backend (`utils/sesion.js`). Contra el backend E2E
(`petshop_csrf_e2e`), el frontend nunca hubiera encontrado la cookie,
nunca hubiera mandado `X-CSRF-Token`, y **cualquier** escritura habría
respondido `403` — una regresión real, con impacto severo (rompía todo el
camino de escritura de E2E), que ninguna prueba anterior había detectado
porque ninguna se había ejecutado contra un backend E2E real todavía.
Corregido leyendo `VITE_ENTORNO` (nuevo, en `frontend/.env.e2e`) con el
mismo criterio que el backend. Ver
[backend-autenticacion.md](backend-autenticacion.md) para el detalle
completo, y `frontend/src/api/httpClient.test.js` (3 pruebas nuevas,
confirmado que fallan contra el código anterior a esta corrección y pasan
contra el corregido). También se verificó, con `vite build --mode e2e` y
lectura directa del bundle generado, que el nombre `petshop_csrf_e2e`
efectivamente queda compilado — no solo que el código "debería" producirlo.

El resto de la auto-revisión (relectura completa de
`limiteIntentos.middleware.js`, `producto.service.js`,
`server.js`/`EADDRINUSE` con una prueba real de conflicto de puerto,
`scripts/sembrarDatosE2E.js`) no encontró más defectos: las cuatro
correcciones descriptas arriba siguen siendo correctas tal como se
documentaron, con esta única salvedad ya corregida.

### Resultados reales de esta corrección

```
cd backend && npm test        → 175/175
cd frontend && npm test       → 27/27 (24 + 3 de httpClient.test.js, nuevo)
cd frontend && npm run lint   → sin errores
cd frontend && npm run build  → compila sin errores
```

`npm run test:integracion` y `npm run test:e2e`: ver "Cuarta corrección"
abajo — ya se ejecutaron de verdad, con resultado real.

## Cuarta corrección: contraseñas completas, Codex operativo, aislamiento E2E ejecutado de verdad por primera vez

Mauro completó las contraseñas locales pendientes (`backend/.env.test`,
`backend/.env.e2e`) y volvió a autenticar Codex. A diferencia de la
corrección anterior (donde Codex seguía sin poder invocarse — 401,
token de refresco vencido), esta vez **sí estuvo operativo**: se usó dos
veces como revisor independiente y real, no simulado (ver más abajo).

### Los tres hallazgos puntuales pedidos, verificados uno por uno

1. **"El control E2E debe comprobar frontend → backend utilizado → base y
   usuario efectivos, antes de cualquier escritura. No alcanza con
   consultar una URL independiente que responda entorno='e2e'"** — cierto,
   confirmado por lectura directa: `globalSetupAislamiento.js` (antes)
   solo llamaba a `GET /api/health`, campo `entorno` (una variable de
   entorno autodeclarada, sin relación con la conexión real), contra una
   URL configurada de forma **independiente** (`E2E_BACKEND_URL`) que
   podía divergir de `VITE_API_URL` (la que el frontend REALMENTE usa)
   sin que nada lo notara. **Corregido**: `globalSetupAislamiento.js`
   ahora lee `frontend/.env.e2e` con la misma utilidad que usa Vite
   (`loadEnv`) para obtener `VITE_API_URL` — ya no una URL independiente
   — y llama a un endpoint nuevo, `GET /api/health/aislamiento`
   (`backend/src/app.js`), que consulta `SELECT
   DATABASE()`/`CURRENT_USER()` de verdad y compara contra
   `petshop_e2e`/`petshop_e2e_app@localhost` de forma exacta. Ver
   [backend-base-de-datos.md](backend-base-de-datos.md) y
   [frontend-pruebas.md](frontend-pruebas.md) para el detalle completo,
   incluida una limitación conocida y aceptada (no corregida): si alguien
   arrancara el frontend sobreescribiendo `VITE_API_URL` a mano por
   variable de shell (fuera del flujo documentado), esto no lo detectaría.
2. **"El servidor debe comprobar el entorno aislado antes de ejecutar
   sync() o cualquier operación que modifique esquema o datos"** — cierto,
   confirmado: `backend/scripts/sembrarDatosE2E.js` y
   `test-integracion/ayudaIntegracion.js` ya tenían este resguardo, pero
   **`backend/src/server.js` (el proceso normal, `npm run dev:e2e`) no**
   — llamaba a `sequelize.sync()` sin ninguna comprobación previa contra
   la base efectiva. **Corregido**: ahora consulta la base/usuario
   efectivos ANTES de `sync()` (antes se hacía después, solo a modo
   informativo) y aborta si no coincide con lo esperado para
   `ENTORNO=e2e`/`test`.
3. **"Los comandos deben cargar explícitamente la configuración de
   pruebas y gestionar los prerrequisitos y servidores necesarios"** —
   verificado, ya resuelto sin cambios de código: `dev:e2e`/`sembrar:e2e`
   (backend) usan `dotenv_config_path=.env.e2e` explícito;
   `test:integracion` se documenta con `DOTENV_CONFIG_PATH=.env.test`
   explícito (`docs/backend-pruebas.md`); ambos scripts destructivos
   exigen además una habilitación explícita (`PERMITIR_SEMBRADO_E2E`/
   `PERMITIR_LIMPIEZA_INTEGRACION`) antes de tocar cualquier dato. El
   flujo de 4 terminales para E2E (backend, sembrado, frontend,
   Playwright) sigue siendo manual a propósito — es una decisión de
   diseño ya documentada, no un defecto demostrado; no se lo cambió por
   no ampliar el alcance sin evidencia concreta de que haga falta.

### Dos defectos reales más, encontrados recién al ejecutar de verdad (no por lectura de código)

Ninguno de los dos se había detectado en las tres correcciones anteriores
porque ninguna había llegado a ejecutar el sembrado ni la suite E2E contra
una base real con contraseña — auto-revisión de código, por rigurosa que
sea, no sustituye ejecutar:

- **`npm run sembrar:e2e` fallaba siempre**: los emails de prueba usaban
  el dominio `@petshop.e2e`, y el validador `isEmail` de `validator.js`
  (usado por el modelo `Usuario`) rechaza cualquier TLD con dígitos — "e2e"
  tiene uno. Corregido a `@petshop-e2e.test` (dominio reservado por la
  IANA para pruebas, RFC 2606) en el script y en los dos specs de `e2e/`.
- **Límites de intentos de login demasiado estrictos para esta suite,
  encontrados en dos pasadas** (el primero pareció resuelto, el segundo
  recién se reprodujo al correr la suite completa dos veces seguidas sin
  reiniciar el backend): una corrida serial de 3 viewports contra 2
  cuentas fijas acumula, de forma legítima, más de 8 intentos por
  IP+email y más de 30 por IP sola (sumando ambas cuentas) — ninguno es un
  ataque real. Se agregaron `LIMITE_LOGIN`/`LIMITE_LOGIN_POR_IP`
  (`usuario.routes.js`), configurables solo en `backend/.env.e2e`, sin
  tocar los valores de producción/desarrollo (8 y 30) en ningún otro
  `.env`. Ver [frontend-pruebas.md](frontend-pruebas.md) para el detalle
  completo, incluido un tercer hallazgo menor: `/panel/ventas` no
  renderizaba ninguna tabla en una base recién sembrada sin ventas
  todavía (`capturas.spec.js` fallaba esperándola) — corregido sembrando
  una venta fija de entrada.

### Codex, esta vez operativo: qué revisó y qué encontró

Dos revisiones independientes, reales (no simuladas):

1. **Antes de implementar** (contraste de los hallazgos contra el código
   actual, como pidió el prompt): confirmó por lectura directa que
   `/api/health` (antes de la corrección) solo devolvía `entorno` sin
   consultar la base, y que `server.js` sincronizaba sin resguardo previo
   — la misma conclusión a la que se había llegado por revisión propia,
   dicho por una herramienta independiente antes de tocar ningún archivo.
2. **Después de implementar**, revisión del diff completo: confirmó que
   `sequelize.sync()` no tiene ningún camino que evite el chequeo para
   `ENTORNO=e2e`/`test`, que la venta fija sembrada no interfiere con
   ningún assert de otra prueba, que no quedan referencias vivas al
   dominio de email anterior, y que nombres/comentarios siguen el estilo
   del proyecto. **Encontró un hallazgo real que la auto-revisión no
   había visto**: el `catch` de `/api/health/aislamiento` devolvía
   `error.message` crudo en la respuesta HTTP (ruta pública, sin
   autenticación) — un posible detalle operativo de Sequelize/MySQL
   filtrado innecesariamente. **Corregido**: ahora responde un mensaje
   genérico y registra el detalle real solo en el log del servidor.

No se aceptaron cambios de alcance ampliado: no se tocó el límite de login
de producción/desarrollo (el hallazgo era sobre la configuración de
prueba, no sobre la protección contra fuerza bruta en sí), y no se
automatizó el arranque de los 4 terminales de E2E (decisión de diseño ya
documentada, no un defecto demostrado).

### Resultados reales de la cuarta corrección

```
cd backend && npm test                                          → 175/175 (sin cambios de comportamiento en desarrollo)
cd frontend && npm test                                          → 27/27
cd frontend && npm run lint / npm run build                      → sin errores

DOTENV_CONFIG_PATH=.env.test npm run test:integracion (backend)  → 30/30, REAL contra petshop_test
npx playwright test (frontend, contra petshop_e2e real)          → 18/18, dos veces seguidas sin
                                                                     reiniciar el backend entre medio
                                                                     (el escenario que expuso el límite
                                                                     de login), y una tercera vez tras
                                                                     el fix del mensaje de error
```

Git y base de datos sin cambios: `HEAD` sigue en `2189ec6a`, sin commits;
`petshop_db` (`venta`: 12, `producto`: 6) verificado sin cambios antes y
después de toda la sesión — todas las escrituras de esta corrección
(sembrado, confirmar/cancelar una venta, cargar una venta manual) fueron
contra `petshop_e2e`, nunca contra `petshop_db` ni `petshop_test`.

## Quinta corrección: cierre acotado — frontend servido verificado de verdad, endpoint de diagnóstico restringido a E2E, documentación corregida

Mauro reportó que hizo revisar el ZIP de la cuarta corrección con Codex
desde ChatGPT (no el `codex` CLI de este entorno): confirmó 175/175
backend, 27/27 frontend, lint y build — no repitió MySQL ni E2E (una
revisión de código estático, no una re-ejecución). A partir de ahí, pidió
un corte acotado con cuatro puntos concretos.

### 1. El frontend realmente servido, no solo su configuración declarada

**Hallazgo**: `globalSetupAislamiento.js` (de la cuarta corrección)
confirmaba la base/usuario reales del **backend**, pero para el
**frontend** solo releía `frontend/.env.e2e` — si el proceso de Vite ya
estaba corriendo con otra configuración (por ejemplo, `VITE_API_URL`
pisada a mano por una variable de entorno del shell al arrancarlo), el
archivo podía decir una cosa y el proceso vivo estar haciendo otra, sin
que nada lo notara. Era, con matices, el mismo tipo de problema que ya se
había corregido para el backend.

**Corregido** con una solución simple, sin agregar infraestructura nueva:
`globalSetupAislamiento.js` abre un navegador real (Chromium, el mismo
motor que usan las pruebas), navega a la página de inicio del frontend
servido, espera la petición real que esa página hace al cargar (`GET
.../api/productos`) y compara el **origen de esa petición real** —no lo
que dice ningún archivo— contra el backend ya confirmado. Ver
[frontend-pruebas.md](frontend-pruebas.md) para el detalle completo,
incluido un defecto propio que apareció al probarlo: el primer matcher
(`url().includes('/api/productos')`) enganchaba por accidente con
`/src/api/productos.api.js` (el código fuente del cliente HTTP, servido
por Vite, que contiene esa misma subcadena) en vez de con el pedido real
— corregido comparando el `pathname` exacto.

**Verificado con los dos resultados posibles, no solo el que pasa**:

- Configuración correcta → confirma y la suite completa corre, **18/18**.
- `VITE_API_URL` pisada a mano al puerto de desarrollo
  (`VITE_API_URL=http://localhost:3000/api npm run dev:e2e`, backend
  E2E real sin tocar) → **aborta antes de que aparezca "Running N
  tests"**, ninguna prueba llega a correr ni a escribir.

### 2. `/api/health/aislamiento` restringido a `ENTORNO=e2e`

**Hallazgo**: el endpoint (agregado en la cuarta corrección) respondía en
cualquier instancia, sin restricción — nombre de base y usuario de
conexión no son credenciales, pero tampoco hacía falta que cualquier
instancia (desarrollo, o cualquier otra) los expusiera.

**Corregido**: responde `404 "Ruta no encontrada"` fuera de
`ENTORNO=e2e`, **sin llegar a consultar la base** (el chequeo de entorno
ocurre antes de cualquier `sequelize.query`). Prueba agregada en
`backend/test/app.test.js` (2 casos, sin necesitar MySQL — ver
[backend-base-de-datos.md](backend-base-de-datos.md) para el detalle de
cómo se prueba la ausencia de la consulta sin mocks).

### 3. Documentación: bloqueos resueltos, logout corregido, seis pruebas no es cobertura completa

- La nota y las dos tablas de "Regularidad"/"Aprobación Directa" (arriba
  del todo de este documento) citaban resultados de entregas muy
  anteriores (E2E "15/15" o "no re-ejecutado", integración "pendiente
  bloqueada") — **reescritas** con la evidencia real y vigente: 177
  backend, 27 frontend, 30 integración real, 18 E2E real, cada fila
  citando qué suite la cubre (o diciendo explícitamente que ninguna la
  cubre, en vez de heredar el nivel de una fila relacionada).
- La entrada de "Logout fallido" en "Segunda corrección" describía una
  versión intermedia del arreglo (atrapaba el error, pero seguía
  limpiando el estado en cualquier fallo) sin señalar que quedó superada
  por "Tercera corrección" — quien leyera solo esa entrada se llevaba una
  descripción incorrecta del comportamiento actual. **Corregida** con una
  nota explícita de que es un registro histórico, no vigente.
- La sección "Aislamiento E2E: de 'preparado' a implementado y
  verificado" (Tercera corrección) describía el `globalSetup` original
  (solo `entorno`, sin base/usuario ni frontend servido) sin apuntar a
  las dos correcciones posteriores — **corregida** con la misma clase de
  nota.
- En ningún lugar de esta documentación se afirmaba literalmente que las
  18 ejecuciones de E2E fueran "cobertura completa", pero la cifra sola,
  sin contexto, podía leerse así. Se agregó, en
  [frontend-pruebas.md](frontend-pruebas.md), la aclaración explícita:
  son **6 casos de prueba distintos** (5 en `recorrido-completo.spec.js`,
  1 en `capturas.spec.js`) × 3 viewports = 18 ejecuciones — **no** 18
  funcionalidades distintas probadas, y no cubre los CRUD de personal más
  allá de Producto, el filtro de ventas por proveedor, ni las reglas de
  `PromocionProducto` (todo eso, sin caso E2E propio, sigue en el nivel
  que ya tenía: "probada sin base" o "pendiente", según corresponda).

### 4. Pasos de ejecución exactos, y alcance real de las variables de límite de login

El flujo de E2E siguió siendo manual (4 terminales) a propósito — es una
decisión de diseño de `playwright.config.js`, no un defecto — pero se
revisó que la documentación lo enumere con precisión y sin sobreestimar
qué automatiza cada script: [frontend-pruebas.md](frontend-pruebas.md),
"Cómo correrlas", enumera los 4 terminales con carpeta, comando y orden
exactos (incluido `npx playwright install chromium`, marcado como "una
sola vez"). Ningún script de este proyecto arranca ni gestiona otro
proceso por sí mismo — ni `sembrar:e2e` levanta un servidor, ni
`test:e2e` levanta el backend o el frontend: cada terminal es una
responsabilidad separada, tal como se enumera. Se agregó además una
aclaración explícita del alcance exacto de `LIMITE_LOGIN`/
`LIMITE_LOGIN_POR_IP` (solo afectan login, no registro; solo están
definidas en `backend/.env.e2e`, en ningún otro `.env`) — ver
[frontend-pruebas.md](frontend-pruebas.md).

### Codex: implementación propia, revisión real de esta ronda

Esta ronda la implementó Claude (coordinación pedida: "Claude implementa
y Codex revisa, o viceversa, sin editar los mismos archivos
simultáneamente"); Codex (CLI, operativo desde la cuarta corrección)
revisó el diff completo después, en solo lectura, con este resultado:

- **Hallazgo real, corregido**: el filtro de la petición esperada en
  `globalSetupAislamiento.js` no exigía método `GET`, solo el `pathname`
  — un preflight CORS `OPTIONS` (disparado porque `httpClient.js` manda
  `Content-Type: application/json` incluso en un `GET`) podía resolver la
  espera en vez del pedido real. Mismo origen en ambos casos (no cambiaba
  el resultado del chequeo), pero sí lo que literalmente probaba.
  Corregido: ahora exige `método === 'GET'` además del `pathname` exacto.
- **Hallazgo real, corregido**: la prueba de `/api/health/aislamiento`
  fuera de `ENTORNO=e2e` probaba la ausencia de consulta a la base de
  forma indirecta (si igual consultara, fallaría por un error real contra
  una conexión no configurada) — correcto, pero no lo demostraba de forma
  literal. Se agregó un espía explícito sobre `sequelize.query` que
  confirma que nunca se llama.
- **Observación evaluada y descartada**: Codex señaló que, comparando
  contra el `HEAD` de git completo (no contra el diff de esta ronda
  puntual), `backend/src/app.js` también incluye las rutas de
  `usuarios`/`promociones` — correcto, pero esas rutas son de
  correcciones muy anteriores (segunda/tercera), ya presentes antes de
  esta ronda; Codex mismo lo dejó condicionado ("si eso pertenece a esta
  ronda, excede el alcance") porque solo tenía visibilidad del diff
  completo contra `HEAD`, no de qué cambió hoy específicamente. No amplía
  el alcance de esta corrección: el único cambio de producción de esta
  ronda en ese archivo es el `gate` de `ENTORNO=e2e` ya descripto.

Ningún hallazgo de Codex implicaba tocar código fuera de lo ya acotado
por los 4 puntos pedidos.

### Resultados reales de la quinta corrección

```
cd backend && npm test                                          → 177/177 (175 + 2 nuevas de app.test.js)
cd frontend && npm test                                          → 27/27
cd frontend && npm run lint / npm run build                      → sin errores

DOTENV_CONFIG_PATH=.env.test npm run test:integracion (backend)  → 30/30, REAL contra petshop_test
npx playwright test (frontend, contra petshop_e2e real)          → 18/18 con la config correcta;
                                                                     abortó ANTES de "Running N tests"
                                                                     con VITE_API_URL pisada a mano
                                                                     (prueba deliberada de la discrepancia)
```

Git y base de datos sin cambios: `HEAD` sigue en `2189ec6a`, sin commits;
`petshop_db` sin cambios (`venta`: 12, `producto`: 6) — todas las
escrituras de esta corrección fueron contra `petshop_e2e`.

## Pendientes de alcance (no implementados, no se inventaron reglas)

- **Reglas de aplicación de `PromocionProducto`** (ver arriba): propuesta
  concreta escrita, pendiente de confirmación.
- **Interpretación de "ventas por proveedor"** (ver arriba): propuesta
  concreta implementada, pendiente de confirmación de que sea la correcta.
- **Cuarto caso de uso**: la propuesta enumera tres para 4 integrantes
  ("Registrar caso de uso... por cada integrante, mínimo 2 relacionados
  entre sí"); no se inventó un cuarto. Candidatos razonables a proponer:
  "Consultar productos recomendados según el tipo de mascota" (ya listado
  como voluntario en `proposal.md`) o "Valorar un producto comprado". Queda
  para que el equipo y los docentes lo definan.
- **Alcance adicional voluntario no implementado**: recordatorio de pedido
  no pagado luego de un tiempo (no aplica todavía: no hay pasarela de
  pago que distinga "pagado" de "no pagado").
- **Fotos reales de producto**: sigue sin haber ninguna fabricada. Lo que
  cambió en esta corrección es que ahora **existe cómo cargarlas** (campo
  "URL de imagen" en el panel, ver "Segunda corrección" arriba y
  [frontend-diseno.md](frontend-diseno.md)); mientras nadie cargue una,
  el catálogo sigue mostrando el ícono por categoría.
- ~~Suite E2E completa no re-ejecutada~~ — **resuelto en la cuarta
  corrección**: ya se ejecutó de verdad, dos veces seguidas, 18/18 casos
  reales contra `petshop_e2e` (ver "Cuarta corrección" arriba).
- **Deploy**: no se hizo.

## Material académico revisado

`README.md`, `docs.md`, `proposal.md` y `FAQ.md` (los únicos archivos de
ese tipo presentes en el repositorio) fueron revisados. Si la cátedra
distribuyó otro material (diapositivas, PDFs) fuera del repositorio, no se
pudo contrastar contra él por no estar disponible acá — se señala
explícitamente en vez de asumir que no existe.

## Próximas etapas sugeridas

1. **Confirmar con Mauro**: reglas de `PromocionProducto`, interpretación
   del filtro de ventas por proveedor, y el cuarto caso de uso.
2. **Desbloquear la base de pruebas** (privilegios de MySQL) para poder
   correr por fin la suite de integración del backend — y, con ella
   disponible, poder correr también el E2E y las pruebas de integración
   contra una base descartable en vez de desarrollo.
3. Volver a correr la suite E2E completa (contra una base aislada, una vez
   disponible) para confirmar el nuevo flujo de sesión por cookies de
   punta a punta.
4. **Deploy** y credenciales de demostración, para la entrega de
   aprobación.
