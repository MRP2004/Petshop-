# Estado del proyecto

Última actualización: novena corrección — cuarta ronda de CU-04 (Mauro),
tras confirmar en la venta #20 que el correo automático llega de verdad
con SMTP real configurado: adjuntó el mismo PDF del comprobante a ese
envío y quitó el enlace a `localhost` que llevaba, y restringió la
cancelación directa de una venta al personal — el cliente ahora
**solicita** la cancelación de su propia compra, y el personal la aprueba
o la rechaza. Ver "Novena corrección" más abajo para el detalle; "Octava
corrección" documenta la tercera ronda (5 pendientes de una revisión
independiente: idempotencia cuando falla la escritura en `localStorage`,
un diagnóstico equivocado sobre la zona horaria de la conexión a la base,
el límite de tiempo HTTP no cubriendo la lectura del cuerpo, paginación
del PDF, y dos números corregidos en el informe de cierre); "Séptima
corrección" documenta la segunda ronda (recuperación de una compra tras
perder la respuesta, medios de pago deshabilitados, estados de correo
honestos, histórico del comprador, límite monetario del total, contrato
transaccional de precios para José, y rediseño del comprobante); "Sexta
corrección" documenta la primera entrega de CU-04; "Cuarta corrección" y
"Quinta corrección" el estado previo (aislamiento E2E).

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

**Nota sobre esta tabla (actualizada en la novena corrección)**: en
entregas anteriores, varias filas decían "E2E real ejecutado y pasando"
refiriéndose a una corrida contra `petshop_db` (desarrollo) previa al
cambio de estrategia de sesión (cookies HttpOnly), sin re-confirmar
después. **Eso ya no aplica**: la suite E2E (`npx playwright test`) se
ejecutó de verdad contra el backend/frontend aislados (`petshop_e2e`, no
`petshop_db`), más recientemente en la novena corrección, con resultado
real **36/36**. Importante para no sobrestimar lo que eso cubre: son **12
casos de prueba distintos** (`recorrido-completo.spec.js`: 11, sumó 3 en
la novena corrección — el recorrido de "solicitar y aprobar" reescrito
como recorrido real completo, cancelación directa del personal con
confirmación; `capturas.spec.js`: 1), cada uno corrido en 3 viewports
(mobile/tablet/desktop) — 12 × 3 = 36 ejecuciones, **no 36
funcionalidades distintas probadas**, y de ninguna manera una cobertura
completa de todos los CRUD o casos de uso del proyecto (ver el detalle de
qué cubre cada caso en [frontend-pruebas.md](frontend-pruebas.md)). La
integración real (`npm run test:integracion`) también se ejecutó,
**74/74** contra `petshop_test` (61 de las rondas anteriores + 13 nuevos
de la novena corrección, la mayoría en
`solicitudCancelacion.integracion.js`). Cada fila de las tablas de abajo
cita, cuando corresponde, cuál de estas dos suites la cubre — y cuando no
la cubre ninguna, lo dice explícitamente en vez de heredar el nivel de una
fila relacionada.

## Regularidad (mínimo obligatorio)

| Requisito | Nivel | Evidencia |
|---|---|---|
| CRUD Cliente, Proveedor, Producto, TipoMascota (simples/dependientes) | 3. Verificada | CRUD completo + pruebas sin base (`test/crudEntradasInvalidas.test.js`, dentro de los 177/177 actuales) + panel de gestión (`PanelClientes.jsx`, etc.) + integración real (`test-integracion/crudBasico.integracion.js`, dentro de los 30/30, contra `petshop_test`). El recorrido de cliente en el catálogo, no el CRUD de personal, está cubierto además por E2E real (`recorrido-completo.spec.js`). |
| CRUD Producto {depende de} Categoría y TipoMascota | 3. Verificada | `producto.service.js` valida las relaciones; `PanelProductos.jsx` las gestiona con selects cargados de la API real; `test-integracion/stockYProducto.integracion.js` (dentro de los 30/30). |
| CRUD PromocionProducto {depende de} Producto | Implementada + probada sin base | Validación, calendario, reglas de vigencia y aplicación al checkout/venta manual implementados. La integración contra MySQL para promociones aún no se ha ejecutado en esta rama; ver [promociones.md](promociones.md). |
| Listado de productos filtrado por categoría o tipo de mascota, con detalle | 2. Probada sin base + 3. Verificada por E2E real | `GET /api/productos?idCategoria=&idTipoMascota=`, `Catalogo.jsx` + `ProductoDetalle.jsx`; recorrido de búsqueda cubierto por `recorrido-completo.spec.js` (18/18 real); capturas de los tres viewports en `capturas.spec.js`. |
| Listado de ventas filtrado por cliente o proveedor, con detalle | 2. Probada sin base | `GET /api/ventas?idCliente=&idProveedor=`, `PanelVentas.jsx` + `VentaDetalle.jsx`. El filtro por proveedor es una interpretación propuesta (ver más abajo), sin caso de prueba E2E propio — el filtro no forma parte de ningún caso cubierto por `recorrido-completo.spec.js`. |
| CUU: Registrar una venta | 3. Verificada, E2E real | `recorrido-completo.spec.js` ("iniciar sesión, buscar un producto, agregar al carrito, confirmar la compra y cancelarla" y "un vendedor puede cargar una venta... y marcarla como enviada"), dentro de los 18/18 reales contra `petshop_e2e`. También `test-integracion/ventaConcurrencia.integracion.js` (dentro de los 30/30). Ver [casos-de-uso.md](casos-de-uso.md). |
| CUU: Cancelar una venta | 3. Verificada, E2E real | Mismo caso de arriba (confirma y cancela en el mismo recorrido); `test-integracion/*.integracion.js` cubre además el rollback real de stock. |
| CU-04: Registrar una compra, procesar un pago simulado y gestionar la venta (Mauro) | 3. Verificada | Cotización, pago simulado, idempotencia, recuperación tras perder la respuesta, medios de pago deshabilitados, comprobante honesto e histórico — ver "Sexta corrección" y "Séptima corrección" más abajo y [cu04-checkout-pago.md](cu04-checkout-pago.md). Integración real (`test-integracion/compra.integracion.js`, 31 casos) + E2E real (débito aprobado/rechazado, descarga real del PDF, recuperación tras perder la respuesta, dentro de los 33/33 de `recorrido-completo.spec.js`/`capturas.spec.js`). |

## Aprobación Directa / Examen

| Requisito | Nivel | Evidencia |
|---|---|---|
| Todos los CRUD de regularidad + Categoría, MedioPago, Venta, DetalleVenta | 3. Verificada | Los 6 CRUD simples/dependientes completos; Venta/DetalleVenta se gestionan como unidad (registrar/cancelar/enviar — cancelar es exclusivo de personal desde la novena corrección, con la solicitud de cancelación del cliente como alternativa), con integración real (74/74) y el recorrido de venta cubierto por E2E real (36/36). |
| CUU: Cambiar el estado del pedido una vez enviado (marcar como enviada) | 3. Verificada, E2E real | `recorrido-completo.spec.js` ("un vendedor puede cargar una venta para un cliente y marcarla como enviada"), dentro de los 36/36. Ver [casos-de-uso.md](casos-de-uso.md). |
| Cuarto caso de uso (necesario para 4 integrantes) | Actualizado | Mauro confirmó y asignó CU-04 (checkout, pago simulado, gestión de venta) como su propio caso de uso — ya implementado, corregido y verificado en dos rondas (ver fila de arriba, "Sexta corrección" y "Séptima corrección"). Sigue sin confirmarse si esto es lo que la cátedra espera como "cuarto caso de uso" del equipo en el sentido de la propuesta original (esa es una decisión académica de los cuatro integrantes y los docentes, no algo que se pueda determinar desde acá) — no se reinterpreta este casillero como "resuelto" por decisión propia. |
| 1 test automatizado por integrante (4) | 3. Verificada (de sobra) | **236** pruebas backend sin base + **50** pruebas frontend unitarias (Vitest) + **74** de integración real (MySQL, `petshop_test`) + **36** E2E real (Playwright, `petshop_e2e`, 12 casos × 3 viewports) — las cuatro suites ejecutadas y pasando, ver "Novena corrección". |
| 1 test de integración | 3. Verificada | `test-integracion/*.integracion.js`, **74/74, real contra MySQL** (`petshop_test`) — incluye los 32 casos de `compra.integracion.js` y los 12 de `solicitudCancelacion.integracion.js` (CU-04, entre las cuatro rondas). |
| Login con autenticación propia y al menos 2 niveles de acceso | 3. Verificada | Ver [backend-autenticacion.md](backend-autenticacion.md): 3 roles, sesión por cookies HttpOnly + CSRF, probado sin base (`test/usuarioEntradasInvalidas.test.js`, `test/sesionYCsrf.test.js`) y por E2E real (login de cliente y de vendedor, credenciales incorrectas, dentro de los 36/36). |
| Proteger rutas según nivel de acceso | 3. Verificada | Middlewares `requiereAutenticacion`/`requiereRol`/`permitirPropioClienteOStaff` (backend); `RutaProtegida` (frontend, UX). Acceso a compras ajenas probado sin base (`test/ventaAccesoAjeno.test.js`); acceso denegado al panel para un cliente autenticado probado por E2E real (`recorrido-completo.spec.js`, dentro de los 36/36). |
| Definir ambientes (.env) | 3. Verificada | `.env`/`.env.example` en backend y frontend; `.env.test.example`/`.env.test` (integración) y `.env.e2e.example`/`.env.e2e` (E2E), los cuatro con sus propias bases, usuarios y puertos — los dos últimos ya verificados con ejecuciones reales, no solo declarados. |
| Frontend: framework, HTML5, CSS mobile-first, 3 breakpoints, eventos, errores, reactividad, input/output property, ≥1 servicio, modelos con clases | 3. Verificada | React + Vite; `src/index.css` + CSS por componente, mobile-first. Los 3 breakpoints (`sm-mobile`/`md-tablet`/`lg-desktop`) se verifican en cada corrida real de `recorrido-completo.spec.js` y `capturas.spec.js` (36/36, no solo con capturas estáticas). |
| Frontend: 1 test unitario de componente | 3. Verificada | `src/components/ProductCard.test.jsx` + otros, dentro de los 50/50 actuales. |
| Frontend: 1 test end-to-end | 3. Verificada, real | `e2e/recorrido-completo.spec.js`, **36/36 real** contra el backend/frontend aislados de E2E (`petshop_e2e`), no contra desarrollo — ejecutado y reproducido varias veces, más recientemente en la novena corrección (ver ahí el detalle de qué se verificó cada vez). |
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

La tabla `promocionproducto` ya existía en la base antes de que tuviera
servicio o interfaz. En la implementación actual, la promoción es por
producto; la categoría se obtiene del producto y la columna opcional
`idCategoria` se elimina con la migración adicional indicada abajo.

Las reglas y el flujo vigentes están en [promociones.md](promociones.md):
descuento porcentual, fechas inclusivas en horario de Argentina, sin
períodos superpuestos por producto, y aplicación tanto en checkout como en
ventas manuales antes del descuento manual. La integración de promociones contra MySQL en esta rama todavía está
pendiente; no ejecutar la suite de integración hasta confirmar que apunta a
la base aislada `petshop_test`.

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

## Sexta corrección: CU-04 — checkout, pago simulado y gestión de venta (Mauro)

Implementación completa del caso de uso de Mauro Pérez ("Registrar una
compra, procesar un pago simulado y gestionar la venta"), integrado con el
carrito/checkout existente y preparado para las promociones de José. Rama
`feature/cu04-checkout-pago-simulado` desde `ffd33b8` (base verificada de
la entrega anterior), sin commit. Documentación completa, con contrato para
José y ejemplos: [cu04-checkout-pago.md](cu04-checkout-pago.md) — acá solo
el resumen.

### Qué se hizo

- Cotización server-side (`POST /api/compras/cotizacion`) y confirmación
  atómica e idempotente (`POST /api/compras`), con pago simulado
  (transferencia siempre aprobada; débito con tarjetas de demostración
  fijas y deterministas).
- Todo lo nuevo a persistir se modeló como **tablas nuevas** (`pago`,
  `comprobante`, `detalleventapromocion`, `intentocompra`) — mismo criterio
  ya usado para `direccionEntrega`/`imagenProducto`: no hizo falta ningún
  `ALTER TABLE`, `sequelize.sync()` ya es el procedimiento de actualización
  seguro (verificado explícitamente, instalación nueva y actualización con
  datos, contra `petshop_test` — ver `backend/scripts/verificarMigracionCU04.js`).
- Comprobante numerado, PDF descargable (`pdfkit`) y correo (`nodemailer`,
  transporte de prueba en toda la suite automatizada).
- El flujo del vendedor (`registrarVenta`, `PanelNuevaVenta.jsx`) sigue
  intacto, sin tarjeta ficticia ni cambios de comportamiento.

### Hallazgos de Codex y cómo se resolvieron

Codex (CLI) revisó primero el DISEÑO de la transacción de idempotencia
antes de implementarla (aprobado, con el ajuste de capturar deadlocks como
409 reintentable, ya incorporado desde el principio), y después el DIFF
final ya implementado, enfocado en los ocho puntos pedidos (atomicidad,
idempotencia/recuperación, cotización/precio manipulado, precisión
monetaria, autorización, compatibilidad de esquema, efectos post-commit,
regresiones):

| Hallazgo | Severidad | Resolución |
|---|---|---|
| `POST /api/ventas` seguía aceptando rol `cliente`: un cliente podía saltear el checkout con pago simulado por completo | Alta | Restringida a `vendedor`/`administrador` (mismo criterio que "marcar como enviada"); 4 pruebas migradas de HTTP-como-cliente a llamar `registrarVenta` directamente (siguen probando la misma regla de negocio), + una prueba nueva confirmando el 403. |
| El pago se validaba antes de consultar la idempotencia: recuperarse de una respuesta perdida con el formulario de pago reiniciado (otra tarjeta, u otro medio) podía fallar en vez de devolver la compra ya aprobada | Alta | El hash de idempotencia ya no incluye el medio de pago ni datos de tarjeta ("contenido comercial" es qué se compra, no cómo se paga), y la validación del pago se movió DENTRO de la transacción, después de comprobar si el intento ya está resuelto. Verificado con 2 casos de integración real (reintento con otro medio; reintento con datos de tarjeta inválidos), ambos devolviendo la venta original sin reprocesar nada. |
| `enviarComprobantePorCorreo` podía lanzar si fallaba su propia actualización de estado, tumbando la respuesta de una venta ya comiteada | Media | Dos `try/catch` separados (envío, actualización de estado) que nunca propagan; + límite de 8s sobre el envío (`Promise.race`) para no bloquear la respuesta indefinidamente. |
| El límite de tiempo del correo dejaba un `setTimeout` vivo aunque el envío ya hubiera resuelto (encontrado por Codex al ejecutar las pruebas él mismo: la suite tardaba ~9.8s de más) | Media | `clearTimeout` en un `finally`. |
| Reenvíos de correo concurrentes podían pisarse el contador de intentos | Media | Incremento atómico en SQL (`sequelize.literal`) en vez de un valor calculado en JS. |
| `cotizacion.service.js` confiaba ciegamente en la forma de lo que devuelve el proveedor de precios | Media | `validarPrecioVigente` (nueva), valida rango, que `precioFinal = lista − descuento`, y consistencia entre promoción/porcentaje/monto — responde 500 si el proveedor (José, a futuro) devuelve algo inconsistente, antes de usarlo para nada. 6 pruebas nuevas en aislamiento. |

Codex verificó cada corrección por separado después (ejecutando él mismo
las pruebas unitarias tocadas) y confirmó las seis resueltas.

### Resultados reales de la sexta corrección

```
cd backend && npm test                                           → 220/220
cd frontend && npm test                                          → 32/32
cd frontend && npm run lint / npm run build                      → sin errores

DOTENV_CONFIG_PATH=.env.test npm run test:integracion (backend)  → 48/48, REAL contra petshop_test
                                                                     (incluye 18 casos nuevos de
                                                                     compra.integracion.js)
npx playwright test (frontend, contra petshop_e2e real)          → 18/18, real, re-ejecutado
                                                                     después de todas las
                                                                     correcciones de Codex
```

Verificación de migración (instalación nueva + actualización con datos
preexistentes, contra `petshop_test` descartable, nunca `petshop_db`):

```
DOTENV_CONFIG_PATH=.env.test node scripts/verificarMigracionCU04.js
--- Paso 1: instalación NUEVA (esquema completo desde cero) ---
OK: las 16 tablas existen, incluidas las 4 nuevas de CU-04.
--- Paso 2: actualización de un esquema PREVIO (con datos ya cargados) ---
OK: las 4 tablas de CU-04 se crearon, y la venta/producto cargados ANTES de sync() siguen intactos.
```

Git y base de datos sin cambios: sin commits (rama
`feature/cu04-checkout-pago-simulado`); `petshop_db` sin escrituras durante
esta ronda (todas las escrituras de prueba fueron contra `petshop_test`/
`petshop_e2e`).

### Pendiente/no verificado de esta ronda

- **Entrega real de correo**: sin credenciales SMTP disponibles, el envío
  real (más allá del transporte de prueba usado en todas las suites) queda
  sin verificar — documentado así explícitamente, no se declara probado.
- **Reglas reales de promoción de José**: el contrato de precios está
  definido, documentado con ejemplos, y probado de punta a punta con un
  proveedor de prueba controlado — pero ninguna promoción se aplica
  todavía de forma automática a una compra real (mismo estado que antes de
  esta ronda, ver "PromocionProducto" más arriba).
- **Guardar una tarjeta para la próxima compra**: fuera de alcance de esta
  ronda por pedido explícito; extensión documentada en
  [cu04-checkout-pago.md](cu04-checkout-pago.md), §9.

## Séptima corrección: CU-04, ronda 2 — recuperación, medios de pago, correo honesto, histórico, límite monetario, contrato de precios y diseño del comprobante (Mauro)

Segunda ronda sobre CU-04, corrigiendo 8 defectos reales que Mauro
encontró al probar a mano la primera entrega (comprobados manualmente:
registro de cuenta, compra por transferencia simulada, comprobante y PDF,
descuento de stock, persistencia al recargar, cancelación con reversión de
pago y restitución de stock — no se reescribieron esos recorridos, solo se
completaron las correcciones). Misma rama, sin commit. Documentación
completa: [cu04-checkout-pago.md](cu04-checkout-pago.md) — acá solo el
resumen; ver [cu04-informe-cierre.md](cu04-informe-cierre.md) para la
tabla completa hallazgo-por-hallazgo.

### Qué se corrigió

1. **Recuperación tras perder la respuesta**: `GET /api/compras/intentos/:clave`
   (lectura pura, nunca reemplaza el camino atómico de la confirmación
   real); la clave de idempotencia se asocia al `idCliente` de la sesión
   (no se mezcla entre cuentas del mismo navegador) y guarda la entrega
   elegida, con una cadena de respaldo `localStorage` → `sessionStorage` →
   memoria si el nivel anterior no está disponible.
2. **Medios de pago deshabilitados**: `resolverMedioPagoSimulado` bloquea
   y comprueba `habilitado` antes de cotizar; una compra ya aprobada nunca
   vuelve a mirarlo (sigue siendo recuperable aunque se deshabilite
   después); mismo lock agregado a la carga manual del personal.
3. **Estados de correo honestos**: ENUM nuevo
   (`pendiente/simulado/no_configurado/aceptado/fallido/no_aplica`) — un
   transporte de prueba o la ausencia de `SMTP_HOST` ya no se guardan ni
   se muestran como "enviado".
4. **Histórico del comprador**: instantánea (`nombreCompradorHistorico`,
   etc.) en `Comprobante`, usada por PDF, correo y pantalla — editar el
   perfil del cliente después de comprar no cambia un comprobante ya
   emitido.
5. **Límite del total monetario**: un total que superaría `DECIMAL(10,2)`
   se rechaza (400), aunque cada línea individual sea válida por separado.
6. **Contrato transaccional de precios**: `obtenerPrecioVigente(producto, { transaction, instanteEvaluacion })` —
   José puede leer/bloquear sus propias tablas de forma coherente con el
   resto de la operación, con un único "ahora" para todas las líneas de
   una misma cotización.
7. **Diseño del comprobante**: PDF rediseñado (encabezado con marca, tabla
   con descuento, formato argentino, estados legibles, paginación con
   encabezado repetido) — revisado visualmente con 4 PDF de ejemplo, no
   solo generados; esa revisión encontró y corrigió dos defectos reales
   (una página en blanco espuria, un salto de línea incorrecto).
8. **Migración de esquema sin perder datos**: `migrarCU04Ronda2.js` —
   índice único de `mediopago.nombre`, ENUM de `comprobante.estadoCorreo`
   ampliado→migrado→angostado, 3 columnas nuevas — todo idempotente,
   verificado contra `petshop_test` descartable.

### Hallazgos de Codex y cómo se resolvieron

Misma dinámica que la sexta corrección: revisión de DISEÑO antes de
implementar (recuperación/idempotencia, lock de medio de pago, contrato de
precios — aprobado, con dos ajustes incorporados desde el principio:
índice único real para el lock de `MedioPago`, y orden de locks explícito)
y revisión del DIFF final ya implementado, con 4 hallazgos reales:

| Hallazgo | Severidad | Resolución |
|---|---|---|
| Con `localStorage` bloqueado Y la página recargada, se perdía el respaldo en memoria de la clave | Media/alta | Cadena de respaldo de 3 niveles: `localStorage` → `sessionStorage` → memoria |
| `httpClient.js` sin límite de tiempo: una conexión colgada dejaba la recuperación del checkout esperando indefinidamente | Media | Límite de 15s por pedido (`AbortController`) |
| La migración validaba el índice único de `mediopago.nombre` solo por nombre fijo, sin detectar el índice autogenerado de una instalación ya sincronizada | Baja/media | Se verifica por existencia de cualquier índice único sobre la columna |
| `VentaDetalle.jsx` seguía mostrando el nombre ACTUAL del cliente mientras el PDF/correo ya usaban el histórico | Baja | La pantalla usa la misma instantánea histórica |

Una prueba E2E nueva (descarga real del PDF, no solo que el botón exista)
encontró además un quinto defecto, independiente de la revisión de Codex:
`Content-Disposition` no estaba expuesto en la configuración de CORS, así
que el nombre real del comprobante nunca llegaba a leerse desde el
frontend en un pedido cross-origin — corregido con
`exposedHeaders: ['Content-Disposition']`.

### Resultados reales de la séptima corrección

```
cd backend && npm test                                           → 227/227
cd frontend && npm test                                          → 35/35
cd frontend && npm run lint / npm run build                      → sin errores

DOTENV_CONFIG_PATH=.env.test npm run test:integracion (backend)  → 61/61, REAL contra petshop_test
                                                                     (13 casos nuevos, todos en
                                                                     compra.integracion.js)
npx playwright test (frontend, contra petshop_e2e real)          → 33/33 (11 casos × 3 viewports),
                                                                     real, re-ejecutado después de
                                                                     todas las correcciones
```

Verificación de migración de la ronda 2 (esquema previo de la primera
entrega de CU-04, con datos, contra `petshop_test` descartable, dos veces
seguidas para confirmar idempotencia):

```
DOTENV_CONFIG_PATH=.env.test node scripts/verificarMigracionCU04Ronda2.js
--- Aplicando la migración (primera vez) ---
OK: ENUM final, dato migrado (enviado→simulado), comprobante previo intacto,
    columnas de instantánea NULL (no inventadas), índice único creado.
--- Aplicando la migración de nuevo (debe ser un no-op seguro: idempotencia) ---
OK: ENUM final, dato migrado (enviado→simulado), comprobante previo intacto,
    columnas de instantánea NULL (no inventadas), índice único creado.
```

Git y base de datos sin cambios: sin commits (rama
`feature/cu04-checkout-pago-simulado`); `petshop_db` sin escrituras durante
esta ronda (todas las escrituras/migraciones de prueba fueron contra
`petshop_test`/`petshop_e2e`).

### Pendiente/no verificado de esta ronda

- **Entrega real de correo**: sin credenciales SMTP disponibles, sigue sin
  verificar más allá del transporte de prueba — ahora, al menos, el
  estado persistido nunca finge un envío real que no ocurrió.
- **Reglas reales de promoción de José**: contrato extendido
  (transacción + instante de evaluación) y probado de punta a punta con un
  proveedor de prueba controlado; ninguna promoción se aplica todavía de
  forma automática a una compra real.
- **Guardar una tarjeta**: sigue fuera de alcance, sin cambios respecto de
  la sexta corrección.

## Octava corrección: CU-04, ronda 3 — 5 pendientes de una revisión independiente (Mauro)

Ronda acotada, sobre la misma rama sin commit, corrigiendo 5 pendientes
que dejó una revisión independiente sobre la séptima corrección. Detalle
completo: [cu04-informe-cierre.md](cu04-informe-cierre.md) §11 y
[cu04-checkout-pago.md](cu04-checkout-pago.md) — acá solo el resumen.

### Qué se corrigió

1. **Idempotencia con `localStorage.setItem` fallando**: `leerGuardado()`
   ahora baja de nivel de almacenamiento tanto si el nivel anterior lanza
   como si responde "vacío" (antes solo bajaba si lanzaba — pero
   `QuotaExceededError` deja `getItem` funcionando y devolviendo `null`
   siempre, así que nunca llegaba a mirar `sessionStorage`). Cada escritura
   exitosa limpia TODOS los demás niveles (no solo los inferiores —
   hallazgo real de Codex sobre esta misma corrección, ver abajo).
2. **Zona horaria de la conexión**: revertido `timezone: '-03:00'` (de la
   séptima corrección, diagnóstico equivocado) a `'+00:00'` explícito, sin
   migrar datos — nunca se corrió `'-03:00'` contra una base real.
3. **Límite de tiempo HTTP**: ahora cubre también la lectura del cuerpo de
   la respuesta, no solo los encabezados.
4. **Paginación del PDF**: el resumen y el bloque de pago ya no caen en
   una página nueva encabezada por una tabla de productos vacía.
5. **Informe de cierre**: corregidos dos números (+3 pruebas frontend, no
   +5; 6 a 11 casos E2E, no "+15 casos").

### Codex

Revisión real, con fricción de entorno honesta: `git diff` falló dentro
del sandbox de Codex ("dubious ownership", usuario de Windows distinto al
dueño del repo) — Codex leyó los archivos completos en su lugar. Encontró
un hallazgo real: la limpieza de niveles de `claveIdempotencia.js` (punto
1 de arriba) solo limpiaba el nivel inferior al ganar un nivel superior,
no al revés — un resto viejo en `localStorage` (de un carrito anterior, a
propósito no limpiado) podía tapar un intento nuevo guardado en
`sessionStorage`. Corregido y verificado con una prueba dedicada. Ver
[cu04-informe-cierre.md](cu04-informe-cierre.md) §11.2 para el detalle
completo, incluida la fricción de entorno.

### Resultados reales de la octava corrección

```
cd frontend && npx vitest run                                    → 43/43
cd frontend && npm run lint / npm run build                      → sin errores
cd backend && npm test                                           → 227/227

DOTENV_CONFIG_PATH=.env.test npm run test:integracion (backend)  → 61/61, REAL contra petshop_test
npx playwright test (frontend, contra petshop_e2e real)          → 33/33 (11 casos × 3 viewports),
                                                                     real, re-ejecutado tras los
                                                                     cambios de httpClient.js y
                                                                     comprobantePdf.service.js
```

Sin cambios de esquema en esta ronda. Git y base de datos sin cambios: sin
commits; `petshop_db` sin escrituras (toda escritura de prueba, incluida
la verificación puntual del revert de timezone, fue contra
`petshop_test`/`petshop_e2e`).

## Novena corrección: CU-04, ronda 4 — correo con PDF adjunto y cancelación restringida al personal (Mauro)

Ronda sobre la misma rama sin commit, tras confirmar en la venta #20 que
el correo automático llega de verdad con SMTP real configurado. Detalle
completo: [cu04-informe-cierre.md](cu04-informe-cierre.md) §12 y
[cu04-checkout-pago.md](cu04-checkout-pago.md) — acá solo el resumen.

### Qué se corrigió

1. **Correo con PDF adjunto**: el correo automático de la confirmación
   (y cualquier reenvío manual) adjunta el MISMO PDF que genera
   `comprobantePdf.service.js` para la descarga manual — nunca un segundo
   diseño.
2. **Sin enlaces a `localhost`**: el enlace del correo se movió a una
   variable nueva y separada, `URL_PUBLICA_FRONTEND` (vacía por defecto,
   distinta de `FRONTEND_URL`, que es para CORS y siempre es `localhost`
   en los tres entornos configurados); sin configurarla, el correo omite
   el enlace — el resumen + el PDF adjunto ya alcanzan.
3. **Cancelación directa restringida al personal**: `PATCH
   /api/ventas/:id/cancelar` ahora exige `vendedor`/`administrador`, tanto
   en la ruta como en el servicio (defensa en profundidad); con
   confirmación explícita antes de ejecutarla.
4. **Solicitud de cancelación del cliente**: `POST
   /api/solicitudes-cancelacion` (sobre la propia venta, `registrada`, sin
   tocar venta/pago/stock) + aprobar/rechazar por el personal — aprobar
   reutiliza EXACTAMENTE la misma cancelación transaccional que la
   directa. Sin solicitudes duplicadas, sin decisiones repetidas, sin
   carreras con una cancelación/envío directo.

### Codex

Revisión real, con la misma fricción de entorno que la ronda anterior
(`git diff` bloqueado por "dubious ownership" en el sandbox de Codex —
resuelta leyendo los archivos completos). Encontró un hallazgo real: si el
personal cancelaba una venta directamente (o la marcaba como enviada)
mientras había una solicitud de cancelación pendiente para esa misma
venta, esa solicitud quedaba pendiente PARA SIEMPRE — nunca se resolvía
sola. Corregido: `cancelarVenta`/`marcarVentaComoEnviada` ahora cierran
solas, en la MISMA transacción, cualquier solicitud pendiente de esa
venta. Verificado con una prueba dedicada por cada función y actualizando
las dos pruebas de concurrencia real existentes. Ver
[cu04-informe-cierre.md](cu04-informe-cierre.md) §12.5 para el detalle
completo, incluida la fricción de entorno.

### Corrección adicional post-entrega (mismo día): permisos de `cancelarVenta`

El chequeo de permisos DENTRO del servicio solo bloqueaba un rol
`'cliente'` explícito, dejando pasar sin usuario o con un rol desconocido
si algún llamador interno se salteara la ruta (la ruta ya exigía
`vendedor`/`administrador`, así que no era explotable hoy, pero la defensa
en profundidad quedaba incompleta). Cambiado a una lista explícita de
roles permitidos, mismo criterio que ya usaba
`resolverSolicitudCancelacion`. 3 pruebas nuevas
(`ventaCancelacionPermisos.test.js`) + `ventaConcurrencia.integracion.js`
actualizado para pasar un `vendedor` válido. Codex revisó el cambio
puntual y no encontró hallazgos. Detalle completo:
[cu04-informe-cierre.md](cu04-informe-cierre.md) §12.10.

### Resultados reales de la novena corrección

```
cd backend && npm test                                           → 236/236
cd frontend && npx vitest run                                     → 50/50
cd frontend && npm run lint / npm run build                       → sin errores

DOTENV_CONFIG_PATH=.env.test npm run test:integracion (backend)  → 74/74, REAL contra petshop_test
npx playwright test (frontend, contra petshop_e2e real)          → 36/36 (12 casos × 3 viewports),
                                                                     real, re-ejecutado tras todas
                                                                     las correcciones
```

Sin cambios de esquema que requieran migración (una tabla nueva,
`solicitudcancelacion` — `sync()` la crea sola). Git y base de datos sin
cambios: sin commits; `petshop_db` sin escrituras (toda escritura de
prueba fue contra `petshop_test`/`petshop_e2e`).

### Pendiente/no verificado de esta ronda

- **Devolución de un pedido ya entregado**: distinta de la solicitud de
  cancelación de esta ronda (que solo aplica mientras la venta sigue
  `registrada`) — queda documentada como un flujo posterior, sin ninguna
  función ni botón que sugiera que ya existe.
- El resto de los pendientes de rondas anteriores (reglas reales de
  promoción de José, tarjeta guardada, confirmación docente del "cuarto
  caso de uso") sigue igual.

## Décima corrección: rediseño visual, ronda 1 — home, encabezado, navegación, tarjetas de producto y footer (Mauro)

### Qué se hizo

Identidad visual propia para PetShop (antes: paleta verde-azulado genérica
heredada de `InicioFront`): fondo crema `#FBF7F0`, texto `#2B2420`, verde
`#3C9A6E` para acciones/precios, terracota `#D97757` reservado solo para
promociones, tipografía Baloo 2 (títulos) + Manrope (cuerpo). Todo vive en
variables de `frontend/src/index.css`, así que se propaga solo a Catálogo,
Detalle de producto, Carrito, Checkout, Mi cuenta, Ingreso/Registro y el
panel sin tocar esos archivos. Detalle completo, incluidas las decisiones
de alcance (qué del boceto original NO se implementó, y por qué, sin
menús ni promesas sin datos reales detrás) en
[frontend-diseno.md](frontend-diseno.md), "Ronda 1 de rediseño visual".

Cambios de código: `Navbar.jsx`/`.css` (reescrito: barra informativa
honesta, desplegables reales Perros/Gatos con `NavDropdown.jsx` nuevo,
menú táctil en móvil, encabezado reducido en /iniciar-sesion y /registro),
`Footer.jsx`/`.css` (reescrito: enlaces reales a categorías/mascota/ayuda,
sin redes ni newsletter), `Home.jsx`/`.css` (hero con composición propia +
productos reales, categorías rápidas, destacados que excluyen productos de
prueba), `ProductCard.jsx`/`.css` (chip "Poco stock" con `stockMinimo`,
campo que el backend ya devolvía), `CategoryItem.css` (paleta), `index.css`
(tokens/tipografía), `index.html` (fuentes de Google Fonts). Sin cambios de
backend ni de modelo de datos.

### Codex

Revisión acotada a los 13 archivos de esta ronda (11 modificados + 2
nuevos, `NavDropdown.jsx`/`.css`), pidiéndole explícitamente que calculara
contraste real (no a ojo) para los pares de color nuevos. Encontró 4
hallazgos concretos, los 4 corregidos y verificados en el momento:

1. **Contraste insuficiente en `.boton-primario`**: fondo `--color-marca`
   (`#3C9A6E`) con texto blanco da ~3.48:1, por debajo de WCAG AA (4.5:1)
   para texto normal — afecta los CTA principales ("Ver catálogo",
   "Agregar al carrito", "Confirmar y pagar", etc.). Corregido: el fondo
   ahora es `--color-marca-oscuro` (~5:1).
2. **Terracota usado fuera de promociones, y con contraste insuficiente
   como texto**: el contador del carrito y el chip "Poco stock" usaban
   `--color-acento`, contradiciendo la regla explícita de esta ronda de
   que terracota significa solo "oferta"; además blanco sobre terracota da
   ~3.12:1. Corregido: ambos pasan a reutilizar `--color-peligro` (ya
   existía, para avisos/errores — semánticamente correcto, no es una
   promoción). El link "Promociones" de la navegación, que sí es
   promoción, tenía el mismo problema de contraste como texto — se agregó
   `--color-acento-oscuro` (`#AE5F46`, ~4.64:1) para ese uso, dejando
   `--color-acento` para fondos/superficies donde ya daba buen contraste.
3. **Hueco de hover en `NavDropdown`**: el menú tenía `margin-top: 4px`
   respecto del botón; ese hueco sin ningún elemento debajo del mouse
   dispara `mouseleave` del contenedor antes de que el cursor llegue al
   menú, cerrándolo de golpe al bajar en línea recta (reproducido con
   Playwright moviendo el mouse en pasos pequeños: se cerraba antes de la
   corrección). Corregido: `margin: 0` + `padding-top` más grande para el
   mismo respiro visual sin hueco muerto; reproducido de nuevo tras el
   arreglo y el menú ya no se cierra.
4. **Selector `[data-abierto='true']` huérfano**: el CSS lo usaba pero el
   JSX nunca seteaba ese atributo. Corregido: `data-abierto={abierto}` en
   el contenedor.

Sin hallazgos en el resto (`Home.jsx` con `productos` vacío o pocos
publicables, rutas del encabezado reducido, foco/teclado del propio
`NavDropdown`, o selectores que dependen las pruebas): Codex los revisó
explícitamente y los confirmó sin problemas.

### Resultados reales de la décima corrección

```
cd frontend && npm test         → 50/50 (sin pruebas nuevas: cambio visual/presentacional, no de lógica de negocio)
cd frontend && npm run lint     → sin errores
cd frontend && npm run build    → sin errores

Verificación manual con Playwright contra el servidor de desarrollo (no automatizada,
no forma parte de la suite): home → búsqueda → catálogo → detalle → carrito, encabezado
reducido en /iniciar-sesion y /registro, navegación por teclado en los desplegables
(Enter abre, flechas mueven el foco, Escape cierra y devuelve el foco), menú móvil
táctil — en 390×844, 834×1112 y 1440×900.

npx playwright test (frontend, contra petshop_e2e real)  → 36/36 (12 casos × 3 viewports),
                                                              re-ejecutado tras el rediseño
```

Sin cambios de esquema ni de backend. Git y base de datos sin cambios: sin
commits; `petshop_db` no se escribió (la verificación manual fue de solo
lectura + carrito en localStorage; la suite E2E corrió, como siempre,
contra `petshop_e2e`).

### Pendiente/no verificado de esta ronda

- **"Otras especies" en la navegación**: no hay ningún `TipoMascota` más
  allá de Perro/Gato cargado todavía. Cuando se agreguen desde el panel,
  sumarlos a `Navbar.jsx` es inmediato (los desplegables ya son genéricos).
- **"Marcas" en la navegación**: no existe ningún modelo de marca en el
  backend (`Proveedor` es una entidad B2B, no una marca de cara al
  público). Pendiente de que Mauro confirme si vale la pena modelarlo.
- **Nombre del usuario en el encabezado**: el payload de sesión no trae
  nombre (ni siquiera email) — solo `idUsuario`/`rol`/`idCliente`. Mostrar
  un nombre real requeriría un cambio de backend, fuera del alcance de
  esta ronda (visual/frontend).
- El resto de los pendientes de rondas anteriores sigue igual.

## Undécima corrección: rediseño visual, ronda 2 — Etapa 1: identidad más verde y correcciones de honestidad (Mauro)

Primera etapa de la "ronda 2" pedida por Mauro (alcance completo: identidad
visual v2, buscador predictivo, dirección argentina con Georef, cuenta con
nombre real/favoritos/avisos, confirmaciones/estados de pedido, marketplace
de vendedores independientes — ver el plan completo acordado antes de
empezar). Se ejecuta en etapas verificables e independientes; esta es la
primera, puramente visual/frontend, sin tocar esquema de datos.

### Qué se hizo

- **Paleta v2** en `frontend/src/index.css`: fondo `#EEF6F0` (antes
  `#FBF7F0`), nuevo token `--color-fondo-suave` (`#E3F0E8`) para separar
  secciones sin bordes, texto `#193D2E` (antes `#2B2420`, menos marrón, más
  verde — pedido explícito). Verde de acciones/precios y terracota de
  promociones sin cambios (ya coincidían con lo pedido esta ronda).
  `--color-texto-suave` y `--color-borde` recalculados contra el fondo
  nuevo.
- **Footer**: se sacó la columna "Contacto" completa (domicilio/teléfono/
  correo eran datos de demostración inventados, nunca reales). No se
  inventó ningún reemplazo.
- **Home**: se sacó la etiqueta "Envío a todo el país" del hero (afirmaba
  cobertura nacional no validada) por "Retirá en sucursal o recibí en tu
  domicilio" (lo que el checkout realmente soporta). Se sacó el botón
  "Ofertas del mes": se mostraba con solo que existiera algún registro de
  promoción, sin chequear vigencia ni si el descuento se aplica al pagar —
  confirmado en el código que `venta.service.js` no lee promociones
  todavía (CRUD puro, sin efecto en el total). Queda documentado como
  punto de integración pendiente del compañero a cargo de promociones.
  Los dos productos del hero ahora priorizan los que tengan foto real
  cargada (antes tomaba ciegamente los dos primeros publicables, casi
  siempre sin foto), y el recuadro del hero suma un patrón de huellas
  decorativas + degradé para que no se vea vacío cuando ninguno tiene foto.
- Reemplazo de colores hardcodeados por los tokens correspondientes en
  `Home.css`/`ProductCard.css` (sin cambio visual, sin colores mágicos
  sueltos).

### Codex

Revisión acotada a los archivos de esta etapa (dándole el detalle exacto
de qué cambió y qué NO tocar), pidiéndole contraste real calculado, no a
ojo, y que buscara el patrón `background: var(--color-marca)` + texto
blanco en el resto del frontend. Encontró 2 hallazgos reales, ambos
corregidos y reverificados:

1. **`--color-borde` insuficiente para límites de controles interactivos**
   (WCAG 1.4.11, ≥3:1): el tono recalculado para esta ronda (`#AFD2BA`) da
   ~1.4-1.65:1 contra blanco/los fondos nuevos — alcanza para un borde
   decorativo (tarjetas con sombra, separadores) pero no para el único
   límite visual de un control (inputs, píldoras de categoría/filtro
   clicables, enlaces del panel, buscador y botón hamburguesa de la
   barra). Corregido: nuevo token `--color-borde-interactivo` (`#4F8A6C`,
   ~3.3-4:1 contra esos mismos fondos) aplicado solo en esos controles;
   los bordes puramente decorativos siguen con `--color-borde`.
2. **`.navbar__boton-buscar` con el mismo patrón de contraste ya corregido
   dos veces en esta ronda** (`background: var(--color-marca)` + texto/
   ícono blanco, ~3.48:1): pasó a `--color-marca-oscuro` (~5:1), igual que
   `CategoryItem.css` y `PanelLayout.css`.

Sin hallazgos en el resto: confirmó que `--color-texto-suave` pasa AA
contra los tres fondos nuevos, que los tres colores recalculados del
footer pasan AA contra el nuevo fondo oscuro, que la lógica de
"priorizar producto con foto" en `Home.jsx` no muta el array original y
cae bien sin fotos, y que los SVG decorativos nuevos del hero quedan
correctamente fuera del árbol de accesibilidad (`aria-hidden`).

### Resultados reales de esta etapa

```
cd frontend && npm test         → 50/50 (sin pruebas nuevas: cambio visual/presentacional)
cd frontend && npm run lint     → sin errores
cd frontend && npm run build    → sin errores

Verificación manual con Playwright contra el servidor de desarrollo (no automatizada):
home, catálogo, detalle de producto, carrito, encabezado reducido en /iniciar-sesion y
/registro — en 390×844, 834×1112 y 1440×900. Confirmado visualmente: paleta nueva,
footer sin datos inventados, hero sin promesas no respaldadas, píldoras de
categoría/filtro con borde visible.
```

No se corrió la suite E2E completa en esta etapa (no toca ningún flujo que
esos casos ejerciten de forma distinta a como ya lo hacían — se re-ejecutará
al cierre de una etapa que sí toque flujos de usuario, según el plan).
Git y base de datos sin cambios: sin commits; `petshop_db` no se escribió
(verificación manual de solo lectura + carrito en localStorage).

### Pendiente (etapas siguientes del mismo pedido, no de esta)

Buscador predictivo (ver Duodécima corrección, ya hecho), nombre real en la
barra + menú de cuenta + diálogos reutilizables, dirección argentina con
Georef, favoritos, avisos in-app, estados de pedido retiro/envío, y el
marketplace de vendedores independientes — cada una en su propia etapa
verificable, con revisión de Codex antes de cualquier migración de esquema
(dirección, estados de pedido, marketplace).

## Duodécima corrección: rediseño ronda 2 — Etapa 2: buscador predictivo (Mauro)

### Qué se hizo

Sugerencias desde la primera letra en el buscador del encabezado, con
imagen/nombre/precio real de hasta 6 coincidencias.

- **Backend**: `GET /api/productos/sugerencias?q=...`, público y separado
  del listado general (`GET /api/productos`, que sigue intacto — lo usa el
  filtrado por categoría/tipo de mascota de los compañeros). `LIKE
  %término%` case-insensible vía `LOWER()` en ambos lados (no depende de
  la collation de la columna), excluyendo por nombre cualquier producto
  con "prueba" (mismo criterio que `Home.jsx#esPublicable`). Límite de 6
  resultados, término vacío/ausente devuelve `[]` sin tocar la base.
- **Frontend**: `BuscadorPredictivo.jsx` (nuevo) reemplaza el `<form>` de
  búsqueda que vivía inline en `Navbar.jsx` (mismo placeholder/aria-label/
  botón, sin tocar los selectores de los que dependen las pruebas E2E).
  Debounce de 250ms, teclado completo (flechas sin wrap, Escape cierra sin
  borrar el texto, Enter con sugerencia activa navega a esa ficha de
  producto, Enter sin selección conserva el comportamiento anterior: abre
  `/catalogo?buscar=...`).

### Codex

Revisión acotada a los archivos de esta etapa. Encontró 3 hallazgos
reales, los 3 corregidos y reverificados:

1. **Condición de carrera real en el buscador**: el contador de secuencia
   que descarta respuestas viejas recién se incrementaba dentro del
   `setTimeout` del debounce, no apenas cambiaba el texto. Un pedido ya en
   vuelo (su propio debounce ya había disparado) podía llegar durante la
   ventana en que el debounce del término nuevo todavía no disparó, y esa
   respuesta vieja pasaba el chequeo sin ser invalidada. Corregido:
   `secuencia.current` se incrementa de forma síncrona apenas cambia
   `busqueda`, no dentro del timer — así cualquier pedido de una
   `busqueda` anterior queda invalidado en el instante en que se escribe
   la siguiente tecla, sin depender de qué timer dispare primero.
2. **Comodines de `LIKE` sin escapar** (`backend/producto.service.js`):
   `%` y `_` son caracteres especiales de `LIKE`; buscar literalmente
   "50%" no coincidía con "50%" sino con "50" seguido de cualquier cosa, y
   buscar solo "%" devolvía prácticamente cualquier producto. Corregido:
   nueva función `escaparComodinesLike` que escapa `\`, `%` y `_` antes de
   armar el patrón (MySQL usa `\` como carácter de escape de `LIKE` por
   defecto). Cubierto con 3 pruebas de integración nuevas.
3. **Patrón ARIA incompleto y mezclado**: el `<input>` no tenía
   `role="combobox"` (sin eso, un lector de pantalla puede no anunciarlo
   como un campo con lista de sugerencias); y el `listbox` mezclaba
   estados (`role="status"`/`role="alert"` de cargando/error/sin
   resultados) con `role="option"`, además de tener un `<Link>` real
   (focosable) anidado dentro de cada opción — un `listbox` solo debe
   contener opciones, sin controles interactivos anidados. Corregido:
   `role="combobox"` en el input; los estados se sacaron del `<ul
   role="listbox">` (viven en un `<div>` hermano, condicionalmente); las
   opciones pasaron de `<Link>` a `<li>` simple con `onClick` manual (la
   navegación por teclado ya no dependía del `<Link>` de todos modos,
   `aria-activedescendant` la resolvía por sí sola).
   - Esta corrección introdujo, de rebote, un bug real que encontré yo
     mismo al escribir la prueba de clic con mouse para el nuevo diseño
     (no algo que Codex haya señalado): al sacar el `<Link>` focosable, un
     clic sobre una sugerencia le sacaba el foco al `<input>` ANTES de que
     llegara el evento de clic (las opciones ya no son focosables), y ese
     blur cerraba/desmontaba el panel a mitad del clic — el clic nunca
     llegaba a ejecutar la selección. Corregido con la técnica estándar
     para este problema: `onMouseDown={(e) => e.preventDefault()}` en el
     `<ul>` del listbox, que evita que el navegador le saque el foco al
     input al hacer mousedown sobre una opción.

Sin hallazgos en el resto: confirmó que el placeholder, el
`aria-label="Buscar productos"` del input y el `aria-label="Buscar"` del
botón siguen exactamente iguales (de los que depende
`frontend/e2e/recorrido-completo.spec.js`), y que no queda ningún otro
`background: var(--color-marca)` + texto blanco sin corregir.

### Resultados reales de esta etapa

```
cd backend && npm test                         → 241/241
cd backend && npm run test:integracion (solo productoSugerencias) → 9/9 (petshop_test)
cd backend && npm run test:integracion (completa)                → 83/83 (petshop_test, incluye
                                                                       las 3 pruebas de escape de
                                                                       LIKE agregadas en la
                                                                       corrección de Codex)
cd frontend && npm test                        → 59/59 (9 nuevas: BuscadorPredictivo)
cd frontend && npm run lint                    → sin errores
cd frontend && npm run build                   → sin errores
npx playwright test (frontend, contra petshop_e2e real) → 36/36 (12 casos × 3 viewports)
```

La corrida completa de E2E (no solo el caso que toca el buscador) se
volvió a correr entera después de cada tanda de fixes, porque el bug real
de esta etapa (el debounce no cancelado, más abajo) lo encontró
exactamente esa suite, no una prueba unitaria: `recorrido-completo.spec.js`
falló en los 3 viewports con una sugerencia vieja ("Pelota de goma
resistente") todavía montada en `/carrito`, reproducido y corregido antes
de pedirle la revisión a Codex (cerrar el panel ahora también cancela el
debounce pendiente y bumpea la secuencia). Sin cambios de esquema. Git y
`petshop_db` sin cambios (verificación manual de solo lectura; la suite
E2E corrió, como siempre, contra `petshop_e2e`).

## Decimotercera corrección: rediseño ronda 2 — Etapa 3: nombre real, menú de cuenta, diálogos reutilizables (Mauro)

### Qué se hizo

- **Nombre real sin tocar el JWT**: el token sigue siendo exactamente
  `{idUsuario, rol, idCliente}`, sin cambios (nada nuevo que autorizar
  quedó embebido ahí). `GET /api/usuarios/perfil` dejó de devolver el
  payload del token tal cual — ahora hace una consulta fresca (`Usuario.
  findByPk` + `Cliente.findByPk` si hay `idCliente`) para poder incluir
  `email`/`nombre`/`apellido`, a propósito para no mostrar un nombre
  desactualizado si el cliente edita su perfil después de loguearse.
  `iniciarSesionConUsuario` (login/registro) arma el mismo shape, para
  que el estado de sesión del frontend no cambie de forma según venga de
  login o de recargar la página (invariante ya documentado desde antes).
- **ConfirmDialog** (nuevo, reutilizable) reemplaza los 3 `window.confirm`
  que quedaban (`GestionEntidad.jsx` "Eliminar", `VentaDetalle.jsx`
  "Cancelar venta" y "Aprobar solicitud"): foco por defecto en el botón NO
  destructivo, Escape cierra salvo que la acción ya esté en vuelo, y si la
  acción falla el diálogo queda abierto mostrando el error en vez de
  cerrarse (imposible con `window.confirm`).
- **AjustarStockDialog** (nuevo) reemplaza el `window.prompt`/
  `window.alert` de "Ajustar stock": muestra stock actual + resultado
  calculado en vivo antes de guardar, deshabilita "Guardar" si el
  resultado quedaría negativo. La validación real (que nunca dependa del
  cliente) sigue siendo la transacción con bloqueo de fila de
  `producto.service.js#ajustarStockProducto`, sin cambios.
- **CuentaMenu** (nuevo): desplegable accesible (mismo patrón mouse/
  teclado que `NavDropdown.jsx`) que muestra el nombre real (cliente) o
  "Panel (rol)" (personal) como disparador, con un único destino real por
  rol ("Mi cuenta" o "Ir al panel") + "Salir" adentro. "Salir" ya no
  cierra la sesión al primer clic: abre un `ConfirmDialog` ("¿Querés
  cerrar sesión?"), pedido explícito de esta etapa.
- El comprobante de CU-04 ya decía "de demostración — sin validez fiscal"
  desde una corrección anterior (`VentaDetalle.jsx`) — verificado que
  sigue así, no hizo falta ningún cambio nuevo acá.

### Codex

Revisión acotada a los archivos de esta etapa. Encontró 2 hallazgos
reales, ambos corregidos y reverificados:

1. **Sin trampa de foco en los diálogos modales**: `ConfirmDialog`/
   `AjustarStockDialog` declaraban `aria-modal="true"` pero Tab/Shift+Tab
   podían sacar el foco hacia controles del fondo con el overlay todavía
   abierto; `AjustarStockDialog` además no tenía ningún manejo de Escape.
   Corregido: nueva utilidad compartida `atraparTab.js` (envuelve el foco
   entre el primer y el último elemento enfocable del diálogo, ignorando
   los deshabilitados) usada por los dos componentes, y Escape agregado a
   `AjustarStockDialog` (mismo criterio que `ConfirmDialog`: no cierra
   mientras la acción está en vuelo).
2. **`ConfirmDialog` sin `aria-describedby`**: el `alertdialog` solo tenía
   `aria-labelledby` (el título) — un lector de pantalla podía anunciar
   título y botones salteándose el mensaje con la consecuencia real ("se
   restituye el stock", "no se puede deshacer"), que en un `alertdialog`
   es la parte más importante. Corregido: `aria-describedby` apuntando al
   párrafo del mensaje.

**Hallazgo real que encontré yo mismo** (no por Codex, al escribir la
prueba de clic con mouse de `CuentaMenu`, antes de pedirle la revisión):
el botón disparador alternaba abierto/cerrado al hacer clic
(`setAbierto((v) => !v)`) mientras el contenedor abría por `onMouseEnter`
— con mouse, "mouseenter" siempre dispara antes que "click" en la misma
interacción, así que el hover ya abría el menú antes de que el clic
llegara, y el clic lo cerraba de inmediato. Reproducido con una prueba que
fallaba con el código viejo. Corregido cambiando el `onClick` a "abrir"
(no alternar) en `CuentaMenu.jsx` **y también en `NavDropdown.jsx`**, que
comparte el mismo patrón desde la ronda 1 y tenía el mismo bug sin que
ninguna prueba automatizada lo hubiera cubierto hasta ahora (no tenía
ningún test unitario propio). Cerrar sigue andando por mouseleave, clic
afuera y Escape en los dos.

### Investigación pedida: "Nueva venta" con total en $0

Se pidió investigar un reporte de que el total de "Nueva venta" se vio en
$0 una vez y después fue correcto. Se leyó `PanelNuevaVenta.jsx` completo:
`total` se calcula con `lineas.reduce(...)` directamente en el cuerpo del
componente, en cada render, a partir del array `lineas` en memoria — no
hay ningún total separado fetcheado ni cacheado, ni ningún hueco
asíncrono entre "agregar línea" y "mostrar total" donde pudiera
renderizarse un valor viejo o vacío. No se encontró ningún camino de
código que explique un $0 transitorio con líneas ya cargadas, y no se
pudo reproducir. Queda documentado como **no reproducido, sin evidencia
de un defecto real** (instrucción explícita: no declarar un defecto de
cálculo sin evidencia) — si vuelve a observarse, valdría la pena
capturarlo (captura de pantalla + qué se hizo justo antes) para poder
investigarlo con algo concreto.

### Resultados reales de esta etapa

```
cd backend && npm test                         → 242/242
cd frontend && npm test                        → 85/85 (24 nuevas: ConfirmDialog,
                                                    AjustarStockDialog, CuentaMenu,
                                                    GestionEntidad)
cd frontend && npm run lint                    → sin errores
cd frontend && npm run build                   → sin errores
npx playwright test (frontend, contra petshop_e2e real) → 36/36 (12 casos × 3 viewports),
                                                    re-ejecutado dos veces (antes y
                                                    después de la corrección de Codex)
```

`frontend/e2e/recorrido-completo.spec.js` se actualizó: los `window.
confirm` nativos que aceptaba con `page.once('dialog', ...)` ya no
existen (ahora se hace clic en el botón de confirmación dentro del
`role="alertdialog"`); los chequeos de "¿el link de Mi cuenta/Panel está
visible?" pasaron a `role="button"` (ahora es el disparador de un menú,
no un link) y el caso del cliente verifica el nombre real sembrado
("Cliente") en vez del texto "Mi cuenta". Sin cambios de esquema. Git y
`petshop_db` sin cambios (verificación manual de solo lectura contra
`cliente@petshop.demo`/`vendedor@petshop.demo`; la suite E2E corrió,
como siempre, contra `petshop_e2e`).

## Decimocuarta corrección: ronda 2 — Etapa 4: dirección argentina estructurada + Georef (Mauro)

### Qué se hizo

Antes de escribir el modelo Sequelize, se probó la API real de Georef
(`https://apis.datos.gob.ar/georef/api`) y se le presentó a Codex el
esquema de datos propuesto — ver más abajo, "Revisión de diseño". Recién
después de esa aprobación se escribió el modelo/migración.

- **Tabla nueva `direccioncliente`** (gratis vía `sync()`, cero `ALTER
  TABLE`): `idCliente` como PK 1:1 (un cliente, una dirección guardada en
  esta ronda — no una lista), `idProvincia`/`provincia`,
  `idLocalidad`/`localidad` (código real de Georef + nombre legible
  desnormalizado), `calle`, `numero`, `piso`/`indicaciones` opcionales.
  `cliente.direccion` (el campo libre viejo) y `direccionentrega`/`venta`
  (el snapshot histórico por compra, ya existente desde CU-04) **no se
  tocaron**: el checkout sigue con su mismo campo de texto libre ya
  validado, ahora solo pre-llenado desde el frontend.
- **Georef real, no simulado**: se confirmó contra la API real que su
  filtro `nombre` NO hace prefijo (`nombre=R`/`nombre=Ros` en Santa Fe
  devuelven 0 resultados; recién con 6 letras aparece "Rosario") — así que
  el backend cachea en memoria (TTL 7 días) la lista COMPLETA de
  localidades por provincia (un pedido a Georef, no por tecla) y el
  filtro "empieza con" lo hace el propio frontend sobre esa lista ya
  cargada. Provincias (24, reales) embebidas como JSON estático.
  `GET /api/georef/provincias` y `GET /api/georef/localidades` públicos.
- **`GET`/`PUT /api/clientes/direccion`**: siempre "la propia" (nunca por
  `:id` ni por el cuerpo — reduce superficie de IDOR), exclusivo de rol
  `cliente`. Valida coherencia provincia-localidad **por id**, contra el
  catálogo real cacheado, no solo por nombre.
- **Frontend**: `DireccionForm.jsx` (provincia + localidad con combobox de
  filtro local + calle/número/piso/indicaciones), usado en `Registro.jsx`
  (paso separado y opcional después de crear la cuenta, con "Completar más
  tarde" como salida real), `MiCuenta.jsx` (nueva sección "Mi dirección",
  ver/editar) y `Checkout.jsx` (pre-llena el campo de texto libre de
  entrega con la dirección guardada, formateada; sigue 100% editable —
  "permitir corregir o elegir otra" se resuelve así, no con una lista de
  direcciones).

### Revisión de diseño (Codex, antes de migrar)

Se le presentó el esquema completo (tabla, endpoints, estrategia de cache
de Georef, decisión de no tocar `venta`/`direccionentrega`) antes de
escribir el modelo. Confirmó el diseño como razonable, con una salvedad
que se dejó resuelta por escrito: usar explícitamente el recurso Georef
`/localidades` (BAHRA, pensado para direcciones postales), no
`/localidades-censales` — confirmado contra la API real que los ids de
`/localidades` van de 8 a 11 dígitos según la provincia (`STRING(20)`
sobra con margen).

### Codex (revisión de la implementación ya hecha)

3 hallazgos reales, los 3 corregidos y reverificados:

1. **Condición de carrera en la cache de Georef**: dos pedidos concurrentes
   a la misma provincia sin cache podían disparar dos fetches reales; si
   uno tenía éxito (dejando cache fresca) mientras el otro fallaba, el que
   falló igual respondía 503 aunque ya hubiera cache recién cargada por el
   primero (el `catch` miraba una variable capturada antes del `await`, no
   la cache actual). Corregido: los pedidos concurrentes a la misma
   provincia ahora deduplican en una única promesa en vuelo, y el `catch`
   relee el `Map` en vez de la variable vieja.
2. **`DireccionForm` podía sugerir localidades de la provincia anterior**:
   si cargar las localidades de la provincia recién elegida fallaba,
   `useCargaDatos` conservaba la lista de la provincia previa (no la
   limpia al recargar) y el campo seguía habilitado — un fallo de red al
   cambiar de provincia dejaba "elegir" una localidad que no correspondía
   (el backend la rechaza igual, pero el formulario quedaba en un estado
   engañoso). Corregido: las sugerencias se descartan y el campo se
   deshabilita mientras haya un error de carga.
3. **Sin validar la forma de la respuesta de Georef**: una respuesta 200
   con `localidades` que no fuera un arreglo, o con algún elemento sin
   `id`/`nombre` reales, se guardaba tal cual — podía terminar
   persistiendo una `localidad: ''`. Corregido: una respuesta malformada
   (no arreglo) se trata como fallo (mismo camino de reintento/fallback);
   un elemento individual sin forma válida se descarta sin invalidar el
   resto de la lista.

### Hallazgo propio (no de Codex): `.campo--linea` nunca ponía los campos en fila

Al verificar visualmente el formulario con Playwright contra el servidor
de desarrollo real, calle/número aparecían apilados en vez de en fila.
Causa real: `.campo--linea` (`Checkout.css`, reutilizada acá) solo ponía
`display:flex`, sin declarar su propia `flex-direction` — `.campo`
(`index.css`) ya declara `flex-direction: column`, y la cascada se
resuelve propiedad por propiedad, no todo-o-nada por selector: esa columna
heredada ganaba siempre. Este bug es de la ronda de CU-04 (anterior a
esta), nunca notado porque los campos apilados igual se veían como un
formulario normal — afecta también al vencimiento/CVV de `Checkout.jsx`.
Corregido agregando `flex-direction: row` explícito.

### Resultados reales de esta etapa

```
cd backend && npm test                                            → 263/263
cd backend && npm run test:integracion (completa, incluye Georef real) → 88/88
cd frontend && npm test                                            → 102/102
cd frontend && npm run lint                                        → sin errores
cd frontend && npm run build                                       → sin errores
npx playwright test (frontend, contra petshop_e2e real)            → 36/36
```

Un fallo aislado y no reproducible (distinto test cada vez, solo en el
viewport lg-desktop, siempre pasa aislado y en una corrida completa
posterior) durante esta etapa: se investigó, pasó limpio en aislamiento
las dos veces y en una corrida completa de reintento — se documenta como
flake del entorno (carga del sistema por la actividad en paralelo de esta
sesión), no como regresión de código, ya que ninguno de los dos tests
afectados toca georef/dirección. Sin migración manual: toda esta etapa es
UNA tabla nueva, gratis vía `sync()` — no hace falta ningún script de
migración como el de CU-04 ronda 2.

**Desvío real a marcar, no a ocultar**: a diferencia de las rondas
anteriores (verificación manual contra `petshop_db` de solo lectura +
carrito en localStorage), verificar esta etapa a mano implicó completar de
verdad el formulario de registro contra el servidor de desarrollo —eso
SÍ escribe una cuenta nueva real en `petshop_db`, no es de solo lectura—.
Se crearon así 2 cuentas de prueba reales en la base de desarrollo, con
emails con el patrón `direccion-test-*@petshop.demo` y
`debug-layout-*@petshop.demo` (número aleatorio en el sufijo, no
registrado en ningún otro lado). No se tocó ni se sembró nada más allá de
esas dos altas de cuenta (con su Cliente y su DireccionCliente asociados).
Esto no debería haber pasado tal como estaba planteado el pedido ("no
sembrar `petshop_db`"): a partir de acá, cualquier verificación manual que
escriba datos (registro, favoritos, avisos, etc. en las próximas etapas)
se hace contra el entorno aislado `petshop_e2e` (ya levantado y sembrado),
no contra el servidor de desarrollo — la navegación de solo lectura contra
`petshop_db` (catálogo, carrito en localStorage) sigue igual de segura que
siempre.

## Decimoquinta corrección: ronda 2 — Etapa 5: favoritos (Mauro)

### Qué se hizo

Tabla nueva `favorito` (gratis vía `sync()`, sin `ALTER TABLE`): PK propia
`idFavorito` autoincremental, `idCliente`/`idProducto`, índice único
compuesto (`idCliente`+`idProducto` — es la garantía real anti-duplicado,
no solo la capa de aplicación). A diferencia de la Etapa 4, **no se le
presentó el esquema a Codex antes de escribir el modelo**: es un caso de
bajo riesgo explícito según el plan (una tabla nueva, sin tocar ninguna
existente, sin ENUM ni columna nueva sobre datos ya persistidos) — sí se
le pidió una revisión de la implementación ya escrita, ver más abajo.

- **`GET/POST /api/favoritos`, `DELETE /api/favoritos/:idProducto`**:
  exclusivos de rol `cliente`, siempre sobre `req.usuario.idCliente` (JWT),
  nunca por `:id` ni por el cuerpo — mismo criterio que
  `/api/clientes/direccion`.
- **Idempotencia real**: `agregarFavorito` usa `findOrCreate` (agregar un
  favorito ya agregado es un éxito silencioso, no un error);
  `quitarFavorito` usa `destroy` (quitar uno que no está tampoco es un
  error).
- **Frontend**: `FavoritosContext` (carga real desde el backend cuando hay
  sesión de cliente, se vacía sin llamar a la API si no; `alternarFavorito`
  optimista con reversión si el backend rechaza el pedido — a diferencia
  del carrito, esto NO vive en `localStorage`: es un dato propio del
  cliente, tiene que persistir entre dispositivos), `BotonFavorito`
  (toggle reutilizable, deshabilitado con una razón visible sin sesión de
  cliente), página `/mis-favoritos` (reutiliza `ProductCard`/la grilla del
  catálogo), integrado en `ProductCard` y `ProductoDetalle`. `CuentaMenu`
  se generalizó de un `enlace` único a un arreglo `enlaces` para poder
  sumar "Mis favoritos" junto a "Mi cuenta", con navegación por teclado
  correcta para 1 o más ítems (ver
  [frontend-diseno.md](frontend-diseno.md), "Ronda 2, Etapa 5").

### Codex (revisión de la implementación ya hecha)

Se le pidió una revisión enfocada en autorización cruzada entre clientes,
condiciones de carrera del toggle optimista, y el cambio de `CuentaMenu` a
múltiples enlaces. 4 hallazgos reales, los 4 corregidos y reverificados:

1. **Favoritos "filtrados" entre cuentas sin recargar la página**:
   `FavoritosContext` solo dependía de `esCliente` (booleano) para decidir
   cuándo recargar. Si el cliente A cerraba sesión y el cliente B iniciaba
   sesión en la misma pestaña (sin recargar la SPA), `esCliente` seguía en
   `true` en los dos casos — el efecto nunca se volvía a disparar, y B veía
   en pantalla los favoritos de A hasta la primera acción que forzara una
   recarga. El backend seguía protegido (cada pedido usa el `idCliente` de
   SU propia sesión), pero era una fuga visual real entre cuentas.
   Corregido: el efecto ahora también depende de `usuario?.idCliente`, y
   limpia la lista ANTES de pedir la nueva (no solo al terminar), para no
   mostrar ni un instante los favoritos del cliente anterior.
2. **Condición de carrera real en el toggle optimista sobre el mismo
   producto**: agregar y luego quitar (o viceversa) el MISMO producto en
   dos clics rápidos son dos pedidos HTTP independientes que pueden
   resolverse en cualquier orden; si el más nuevo terminaba antes que el
   más viejo, la UI quedaba mostrando lo contrario de lo que el servidor
   había terminado guardando, de forma persistente (no solo momentánea).
   Corregido: mientras haya un pedido en curso para un producto, un nuevo
   toggle sobre ESE MISMO producto se ignora (el botón queda deshabilitado
   — ver `BotonFavorito.jsx`); sobre otros productos no bloquea nada.
3. **`eliminarProducto` podía fallar por una restricción de clave foránea
   que no es un dato de negocio**: igual que ya pasaba con
   `ImagenProducto` (ver Etapa de CU-04), un producto marcado como
   favorito por algún cliente no podía borrarse (`Producto.destroy()`
   fallaba por la FK de `favorito`) aunque no tuviera ninguna venta
   asociada — un borrado legítimo terminaba en un error de base de datos
   en vez de completarse. Corregido borrando los favoritos del producto
   DENTRO de la misma transacción, antes de borrar el producto (mismo
   criterio que la imagen, no el historial de ventas, que si existe SÍ
   debe bloquear el borrado). Reproducido y verificado con una prueba de
   integración real nueva (`favorito.integracion.js`) y con los stubs de
   `productoImagenAtomico.test.js` actualizados para reflejar el nuevo
   paso.
4. **HTML inválido: controles interactivos anidados** — `ProductCard`
   tenía dos `<button>` (agregar al carrito, favorito) DENTRO de un único
   `<Link>` (que se renderiza como `<a>`), lo cual es inválido y
   problemático para lectores de pantalla y navegación por teclado (y ya
   venía arrastrándose desde antes con el botón de agregar al carrito
   solo — agregar un segundo botón lo hizo más visible). Corregido
   restructurando `ProductCard`: el contenedor pasó a ser un `<article>`,
   el `<Link>` envuelve solo la parte navegable (imagen, nombre, precio,
   stock), y los dos botones quedan como hermanos del enlace, no anidados
   adentro. Verificado visualmente (el botón de favorito sigue en la
   esquina superior derecha de la imagen) y con la suite E2E completa.

Sobre autorización backend y `CuentaMenu`, Codex no encontró problemas
reales: los tres endpoints de favoritos siempre resuelven `idCliente`
desde el JWT (nunca por `:id` ni por el cuerpo) y están protegidos por rol
`cliente`; la navegación por teclado de `CuentaMenu` funciona igual con 1,
2+ o incluso un arreglo vacío de `enlaces`.

### Resultados reales de esta etapa (después de aplicar las 4 correcciones)

```
cd backend && npm test                                            → 274/274
cd backend && npm run test:integracion (contra petshop_test real)  → 96/96
cd frontend && npm test                                            → 20 archivos, 117/117
cd frontend && npm run lint                                        → sin errores
cd frontend && npm run build                                       → sin errores
npx playwright test (frontend, contra petshop_e2e real)            → 36/36
```

Sin migración manual: esta etapa es una tabla nueva, gratis vía `sync()`.

Un fallo aislado durante una corrida completa de E2E intermedia
(`recorrido-completo.spec.js`, solo en `md-tablet`, un test que no toca
nada de favoritos): pasó limpio al reintentarlo en aislamiento — mismo
patrón de flake de entorno ya documentado en la Etapa 4, no una regresión
de código. La corrida final (después de las 4 correcciones) dio 36/36
limpio en un solo intento.

Verificación manual (agregar/quitar un favorito real desde la UI, y
confirmar que un producto favorito puede borrarse desde el panel después
de la corrección #3) hecha contra el entorno aislado `petshop_e2e`, no
contra el servidor de desarrollo — corrigiendo el desvío de la Etapa 4
(ver más arriba).

## Decimosexta corrección: ronda 2 — Etapa 6: avisos in-app (Mauro)

### Qué se hizo

Tabla nueva `aviso` (gratis vía `sync()`, sin `ALTER TABLE`): `idUsuario`
destinatario con FK REAL a `usuario.idUsuario` (a diferencia de `favorito`/
`direccioncliente`, acá la FK sí importa desde el primer momento: ver
"Corrección de fixtures" más abajo), `tipo` (STRING validado en el
servicio, no ENUM de columna — agregar un tipo nuevo no exige otra
migración), `mensaje`, `enlace` (ruta del frontend, opcional), `leido`.
Mismo criterio de bajo riesgo que Favoritos: no se le presentó el esquema
a Codex antes de escribir el modelo (una tabla nueva, sin tocar ninguna
existente) — sí se le pidió una revisión de la implementación.

- **Cinco puntos de enganche reales**, todos dentro de la MISMA
  transacción que la acción de negocio que los origina (si la operación
  revierte, el aviso revierte con ella — y viceversa):
  `compra.service.js#confirmarCompra` ("compra confirmada", solo en la
  aprobación real, nunca en un reintento de idempotencia),
  `venta.service.js#cancelarVenta` y `#marcarVentaComoEnviada` ("tu compra
  fue cancelada"/"fue enviada", buscando al comprador por `idCliente` —
  una venta cargada manualmente por el personal para un Cliente sin
  Usuario asociado no tiene a quién avisar, y eso se ignora en silencio,
  no es un error),
  `solicitudCancelacion.service.js#solicitarCancelacion` ("nueva solicitud
  de cancelación" a TODO el personal — una fila por cada cuenta vendedor/
  administrador, no una única fila compartida) y
  `#resolverSolicitudCancelacion` ("tu solicitud fue aprobada/rechazada",
  con el motivo en el mensaje si se dio uno).
- **`GET /api/avisos`, `POST /api/avisos/:idAviso/leido`,
  `POST /api/avisos/leidos`**: cualquier rol autenticado (a diferencia de
  favoritos, que es solo `cliente`), siempre sobre `req.usuario.idUsuario`
  de la sesión.
- **Frontend**: `AvisosContext` (carga real para cualquier rol, recarga
  cuando cambia `usuario?.idUsuario` — aplicando desde el principio el
  hallazgo de Codex de la Etapa 5 sobre `FavoritosContext`, en vez de
  repetir el mismo bug —, con un polling simple cada 30 segundos mientras
  hay sesión: sin WebSocket, sigue siendo "in-app" real porque el contador
  se actualiza sin que nadie tenga que abrir el panel a mano).
  `Campana.jsx` en el `Navbar`: contador de no leídos, panel desplegable
  con la lista, cada aviso con enlace navega y lo marca leído al hacer
  clic.

### Corrección de fixtures (no un hallazgo de Codex, encontrado al correr las pruebas)

`compra.integracion.js` (preexistente) usaba objetos `usuario` con un
`idUsuario` inventado (`{ idUsuario: 1, ... }`, sin ninguna fila real en
`usuario`) — nunca había importado porque nada, hasta esta etapa, escribía
ese `idUsuario` en una tabla con clave foránea real. Ahora que
`confirmarCompra` crea un `Aviso` con FK real a `usuario.idUsuario`, esos
fixtures empezaron a fallar con una violación de clave foránea real (no
simulada). Corregido reemplazando esos objetos por cuentas reales
(`crearUsuarioDePrueba`) en los dos puntos de ese archivo que efectivamente
llaman a `confirmarCompra` — sin tocar el resto del archivo, que no se vio
afectado (los objetos `usuario` usados solo para lecturas, como
`obtenerVentaPorId`/`consultarIntento`, no necesitan una fila real).

### Codex (revisión de la implementación ya hecha)

Un hallazgo real, corregido y reverificado: en `Campana.jsx`, `Escape`
solo se manejaba en el botón de la campana, no en el panel desplegado ni
en sus ítems internos — al tabular hacia un aviso o hacia "Marcar todas
como leídas" y presionar Escape, el panel no se cerraba (el comentario del
componente prometía "Escape cierra y devuelve el foco", pero solo
funcionaba si el foco seguía en el botón). Corregido moviendo el manejo de
Escape al contenedor completo (el evento burbujea desde cualquier hijo),
que además devuelve el foco al botón de la campana al cerrar.

Sobre autorización, atomicidad (los 5 puntos de enganche) y el polling de
30s, Codex no encontró problemas reales.

### Resultados reales de esta etapa (después de la corrección)

```
cd backend && npm test                                            → 280/280
cd backend && npm run test:integracion (contra petshop_test real)  → 106/106
cd frontend && npm test                                            → 22 archivos, 129/129
cd frontend && npm run lint                                        → sin errores
cd frontend && npm run build                                       → sin errores
npx playwright test (frontend, contra petshop_e2e real)            → 36/36
```

Sin migración manual: esta etapa es una tabla nueva, gratis vía `sync()`.

Verificación manual (contra `petshop_e2e`, no contra el servidor de
desarrollo): compra real desde la UI → aviso real de "compra confirmada"
visible en la campana → clic navega a la compra y la marca leída → Escape
cierra el panel con el foco en cualquier ítem interno.

## Decimoséptima corrección: ronda 2 — Etapa 7: estados de pedido, retiro vs. envío (Mauro)

### Qué se hizo

Defecto real que motiva esta etapa: el personal solo tenía UNA función
(`marcarVentaComoEnviada`) para "avanzar" cualquier venta registrada,
sin importar si el método de entrega real era retiro en sucursal o envío
a domicilio — un pedido que el cliente retira en el local terminaba
mostrando el mismo estado "enviada" que uno despachado de verdad. Esta
etapa distingue las dos rutas con estados propios.

**Diseño de datos revisado con Codex ANTES de migrar** (mismo criterio
que la Etapa 4, esta vez sobre una tabla EXISTENTE con ventas históricas
reales — el caso de mayor riesgo real de esta ronda hasta ahora): se le
presentó la propuesta completa (ampliar `venta.estado` de 3 a 5 valores,
100% aditivo, sin ningún `UPDATE` sobre filas existentes) antes de
escribir el modelo o la migración. Aprobado, con dos precisiones que se
incorporaron: preservar `NOT NULL DEFAULT 'registrada'` en el `ALTER`
(no solo ampliar el ENUM a secas), y documentar explícitamente el
fallback de `metodoEntrega` nulo/desconocido como "legado, no se infiere
retiro" (ya estaba en la propuesta, Codex pidió dejarlo asentado por
escrito). Codex también señaló puntos concretos a actualizar que no
estaban en el bosquejo inicial (`PanelVentas.jsx`, CSS de estados,
verificar que ningún filtro tratara `'enviada'` como "finalizado" — se
confirmó por búsqueda en todo el código que no existía tal filtro).

- **`venta.estado`**: `ENUM('registrada','cancelada','enviada','lista_para_retirar','entregada')`
  — los 3 valores viejos se conservan exactamente donde estaban; toda
  venta histórica con `estado='enviada'` (haya sido retiro o envío bajo
  la semántica vieja) sigue en `'enviada'` para siempre, sin
  reinterpretarse. Migración
  (`backend/scripts/migracionRonda2Etapa7.js` +
  `migrarRonda2Etapa7.js` + `verificarMigracionRonda2Etapa7.js`, mismo
  patrón de 3 archivos que `migracionCU04Ronda2.js`) verificada dos
  veces contra `petshop_test` real: una vez recreando el esquema previo
  con una venta histórica `'enviada'` real (confirmando que sobrevive
  intacta) y otra corriéndola dos veces seguidas (idempotencia). Aplicada
  después contra `petshop_test` y `petshop_e2e` reales.
- **`marcarVentaComoEnviada`** (existente) ahora bifurca por
  `metodoEntrega`: `'envío a domicilio'` → `'enviada'` (sin cambios);
  `'retiro en sucursal'` → `'lista_para_retirar'` (nuevo); nulo/desconocido
  (ventas legadas, de antes de que este campo existiera) → `'enviada'`,
  a propósito, para no romper el comportamiento de datos ya guardados.
- **`marcarVentaComoEntregada`** (nueva, `PATCH /api/ventas/:id/entregar`,
  mismo rol exigido que las demás transiciones): única vía hacia
  `'entregada'`, válida desde `'enviada'` O `'lista_para_retirar'` —
  nunca directo desde `'registrada'` (no se puede saltear el hito
  operativo intermedio).
- **Avisos** (Etapa 6, extendida): 2 tipos nuevos
  (`venta_lista_para_retirar`, `venta_entregada`), mismo criterio de
  atomicidad y de "se ignora en silencio si el Cliente no tiene Usuario".
- **Frontend**: `VentaDetalle.jsx` bifurca el botón del personal según
  `estado`+`metodoEntrega` ("Marcar lista para retirar" vs "Marcar como
  enviada"; "Marcar como entregada" cuando corresponde); ya no muestra el
  ENUM crudo (usa `etiquetaEstadoVenta`, compartida entre backend y
  frontend, mismo patrón que `etiquetaEstadoPago`/`etiquetaEstadoCorreo`
  — `MiCuenta.jsx` tenía su propio mapa duplicado, se reemplazó por el
  import compartido en vez de mantener 3 copias).

### Codex (revisión de la implementación ya hecha)

No encontró problemas reales. Confirmó explícitamente: las transiciones
son completas y coherentes con el diseño aprobado, los locks de fila
existentes siguen protegiendo las transiciones nuevas sin bypass, la
ruta nueva tiene la misma restricción de rol que el resto, y la lógica
condicional del frontend coincide con el backend sin casos borde reales.
Una observación menor no bloqueante: `marcarVentaComoEnviada`/
`marcarVentaComoEntregada` no repiten la comprobación de rol dentro del
servicio (a diferencia de `cancelarVenta`) — mismo patrón ya existente
desde antes de esta etapa (la función confía en que la ruta ya exige el
rol), no una regresión introducida acá; se deja como está, consistente
con el resto del archivo.

### Hallazgo real de E2E (no de Codex): un caso de prueba probaba, sin saberlo, el defecto que esta etapa corrige

`recorrido-completo.spec.js` cargaba una venta manual desde el panel
(que arranca en "retiro en sucursal" por defecto, ver
`PanelNuevaVenta.jsx`) y esperaba ver el botón "Marcar como enviada" —
exactamente el comportamiento viejo que esta etapa corrige a propósito.
Con la corrección aplicada, esa misma venta ahora muestra "Marcar lista
para retirar", como corresponde. Se actualizó la prueba para reflejar el
recorrido real y correcto (registrada → lista para retirar → entregada),
en vez de mantenerla probando el defecto ya corregido.

### Resultados reales de esta etapa

```
cd backend && npm test                                            → 280/280
cd backend && npm run test:integracion (contra petshop_test real)  → 115/115
cd frontend && npm test                                            → 22 archivos, 134/134
cd frontend && npm run lint                                        → sin errores
cd frontend && npm run build                                       → sin errores
npx playwright test (frontend, contra petshop_e2e real)            → 36/36
```

Migración manual aplicada (una sola vez, real) contra `petshop_test` y
`petshop_e2e` — ver arriba el detalle de verificación previa contra
`petshop_test` con datos históricos simulados antes de aplicarla de
verdad. Pendiente para Mauro: aplicar
`node scripts/migrarRonda2Etapa7.js --confirmar` contra `petshop_db`
cuando decida actualizar su entorno de desarrollo (documentado, no
aplicado acá — la regla de "nunca migrar `petshop_db`" sigue en pie).

Verificación manual (contra `petshop_e2e`): un vendedor registró una
venta de envío a domicilio, la marcó como enviada y luego como
entregada; el cliente vio en su campana de notificaciones los avisos
reales "fue marcada como enviada" y "fue entregada", en ese orden.

## Decimoctava corrección: ronda 2 — Etapa 8: marketplace de vendedores independientes (Mauro)

### Qué se hizo

La etapa de mayor riesgo de toda la ronda: el pedido original la señalaba
explícitamente como "la más grande e invasiva" y exigía que ni el esquema
ni la autorización se tocaran sin que Codex revisara el diseño ANTES de
escribir una sola línea de modelo o migración.

**Diseño de esquema y autorización revisado con Codex antes de migrar**
(dos rondas de revisión: diseño, y después implementación — ver
EVIDENCIA-*.txt en el ZIP de esta etapa para la salida completa de las
dos). El diseño inicial fue aprobado con **2 cambios obligatorios**:

1. **Un vendedor independiente conserva `idCliente`** (nunca se pone en
   `null` al aprobarse): sigue siendo comprador además de vendedor —
   conserva su historial de compras, favoritos y direcciones de cuando
   era "solo" cliente. La propuesta inicial lo perdía, un error real que
   Codex marcó como "pérdida de identidad de cliente".
2. **"Mis ventas" de un vendedor independiente devuelve un DTO
   SANITIZADO, no la Venta completa con los detalles filtrados**: la
   propuesta inicial solo filtraba qué líneas de `DetalleVenta` se
   mostraban, pero seguía devolviendo el objeto `Venta` entero —
   filtrando líneas nada más, un vendedor igual vería el total real de la
   compra, el medio de pago, el comprobante y la dirección completa de
   un cliente que también le compró a otro vendedor o a PetShop en la
   misma operación. Corregido: `tienda.service.js` construye un objeto
   propio (`idVenta`, `fecha`, `estado`, `metodoEntrega`, `cliente:
   {nombre, apellido}`, `detallesPropios`, `subtotalPropio`) — nunca la
   Venta real.

Codex también pidió reemplazar cada `rol !== 'cliente'` (una negación que,
con 3 roles, significaba sin querer "entonces es personal" — inofensivo
mientras solo hubiera 3 roles, pero un vector real de fuga de acceso con
un cuarto rol nuevo) por helpers explícitos
(`utils/roles.js#esPersonalInterno/esVendedorIndependiente/
esCompradorRegistrado`), en `venta.service.js`, `compra.service.js`,
`solicitudCancelacion.service.js` y el middleware
`permitirPropioClienteOStaff`.

### Esquema (dos ALTER TABLE aditivos + dos tablas nuevas)

- `usuario.rol`: ENUM ampliado con `'vendedor_independiente'` — ninguna
  cuenta `'vendedor'` (personal interno) cambia de significado ni de
  acceso; confirmado que `requiereRol(...)` compara por string exacto,
  así que un rol nuevo y distinto no se cuela solo en ninguna ruta
  existente (sin necesitar auditar los ~32 usos uno por uno).
- `producto.idTienda`: columna nueva NULLABLE + índice + FK hacia
  `tienda.idTienda` — `NULL` en toda fila existente ("catálogo de
  PetShop"), sin excepción.
- Tablas nuevas `tienda` (dueño único por `idUsuario`, nombre, CUIL/CUIT,
  razón social, `estado` activa/suspendida) y `solicitudvendedor`
  (solicitante y resolutor como dos alias distintos hacia `Usuario`, a
  pedido explícito de Codex).

Migración (`backend/scripts/migracionRonda2Etapa8.js` +
`migrarRonda2Etapa8.js` + `verificarMigracionRonda2Etapa8.js`) verificada
contra `petshop_test` descartable con una cuenta `'vendedor'` y un
producto históricos reales, confirmando que ninguno se reinterpreta, y
aplicada dos veces seguidas para confirmar idempotencia. Aplicada después
contra `petshop_test` y `petshop_e2e` reales — pendiente para Mauro contra
`petshop_db` (documentado, no aplicado acá).

### Autorización real (no solo ocultar botones)

- **CUIL/CUIT real**: `utils/validacionFiscal.js` implementa el algoritmo
  público de dígito verificador módulo 11 de AFIP — probado contra un
  CUIT real verificado a mano (`20-17254359-7`), no un número inventado.
  Documentado explícitamente: solo formato y dígito verificador, **no**
  verifica existencia fiscal real ante AFIP (no hay ninguna integración
  externa).
- **"Quiero ser vendedor"**: solo una cuenta `cliente` ya existente puede
  solicitarlo (conserva todo lo que ya tenía); aprobación exclusiva de
  administrador (más restrictivo que resolver una solicitud de
  cancelación, que puede cualquier personal interno), en una transacción
  que bloquea la solicitud y la cuenta del solicitante, crea la `Tienda`
  y cambia el rol — todo o nada.
- **Productos de un vendedor independiente**: al crear, `idTienda` se
  fuerza al propio (nunca se lee del cuerpo); al editar/eliminar/ajustar
  stock, se verifica que el producto sea de SU tienda (nunca de PetShop
  ni de otra); la tienda se relee DENTRO de la transacción para confirmar
  que sigue `'activa'` (nunca se confía en el `idTienda` del JWT, que
  puede seguir vigente hasta 8h después de que un administrador suspenda
  la tienda).
- **`tienda.estado` es un campo real, no decorativo**: una tienda
  suspendida no puede escribir sus propios productos (verificado con
  integración real) Y sus productos desaparecen del catálogo público
  (verificado con integración real) — un administrador puede suspender/
  reactivar desde `PanelTiendas.jsx`.
- **Carrito mixto permitido a propósito**: no se prohíbe mezclar
  productos de PetShop y de varias tiendas en una misma compra (Codex:
  "razonable, no hace falta imponer una compra = un vendedor") — en
  cambio, "Mis ventas" filtra qué ve cada vendedor, nunca el carrito.

### Codex (revisión de la implementación ya escrita)

Veredicto real (transcripción completa en `EVIDENCIA-codex-etapa8-implementacion.txt`
del ZIP): 4 hallazgos concretos, los 4 confirmados como reales y corregidos,
cada uno con su prueba nueva:

1. **El buscador predictivo no filtraba tiendas suspendidas**:
   `obtenerSugerenciasBusqueda` era una tercera vía pública de catálogo sin
   el filtro `SOLO_TIENDAS_NO_SUSPENDIDAS`. Corregido (y al sumar el JOIN con
   `tienda` apareció un `nombre` ambiguo, resuelto calificando
   `Producto.nombre`). Prueba: `productoSugerencias.integracion.js`.
2. **Carrera entre suspender una tienda y escribir un producto**:
   `resolverTiendaPropiaActiva` releía la tienda sin bloqueo; ahora la lee con
   `LOCK.UPDATE` dentro de la transacción (y `cambiarEstadoTienda` también
   bloquea la fila), así una suspensión y una escritura concurrentes quedan
   serializadas.
3. **Carrera en "Quiero ser vendedor"**: dos pedidos simultáneos podían crear
   dos solicitudes pendientes. `solicitarSerVendedor` ahora bloquea la fila
   del usuario antes de chequear si ya hay una pendiente.
4. **Un vendedor independiente podía elegir cualquier `idProveedor`**, lo que
   contaminaba los filtros internos de "ventas por proveedor". Ahora se fuerza
   `idProveedor = null` para sus productos, al crear y al editar.

### Corrección del entorno E2E (encontrada al cerrar esta etapa)

La verificación manual de punta a punta (ver abajo) usó la cuenta sembrada
`cliente@petshop-e2e.test` para el recorrido real "Quiero ser vendedor" →
aprobación, lo que dejó esa cuenta como `vendedor_independiente` en
`petshop_e2e` y rompió 2 pruebas E2E que asumen que es un cliente común
(6 fallos, en los 3 tamaños de pantalla). Al re-sembrar apareció además que
`scripts/sembrarDatosE2E.js#limpiarTodo` se había quedado desactualizado
desde las Etapas 4–6: no borraba `direccioncliente`/`favorito`/`aviso` (filas
huérfanas tras cada re-siembra) ni las tablas nuevas `tienda`/
`solicitudvendedor`, y borraba `producto` después de `usuario` (ahora falla
por `producto.idTienda → tienda → usuario`). Se corrigió con el mismo orden
que `ayudaIntegracion.js`, se re-sembró `petshop_e2e` y se volvió a correr la
suite E2E completa (resultado abajo).

### Resultados reales de esta etapa

```
cd backend && npm test                                            → 297/297
cd backend && npm run test:integracion (contra petshop_test real)  → 128/128
cd frontend && npm test                                            → 23 archivos, 139/139
cd frontend && npm run lint                                        → sin errores
cd frontend && npm run build                                       → sin errores
npx playwright test (frontend, contra petshop_e2e re-sembrada)     → 36/36
```

(Todos los números de arriba son de la corrida posterior a las 4
correcciones de Codex y a la re-siembra de `petshop_e2e`.)

Verificación manual completa contra `petshop_e2e` (nunca el servidor de
desarrollo), de punta a punta: un cliente real solicitó ser vendedor → un
administrador real aprobó la solicitud (creó la Tienda, cambió el rol) →
el cliente volvió a iniciar sesión, ahora como vendedor independiente, y
vio su propia tienda en `/panel` → creó un producto real → el producto
apareció en el catálogo público con el badge "Vendido por" → el personal
registró una venta manual con ese producto → el vendedor lo vio en "Mis
ventas" con el subtotal correcto (coincidente con precio × cantidad) y
sin ninguno de los campos sensibles de la venta completa.

## Decimonovena corrección: ronda 2 — Etapa 9: correcciones del marketplace y cierre (Mauro)

### Decisión de alcance vigente (visible, no escondida)

- Los **vendedores independientes solo consultan** sus ventas ("Mis
  ventas": sus líneas y su subtotal). El **personal interno** gestiona el
  estado del pedido completo: preparación, envío o retiro, entrega y
  cancelación. Esto está verificado por HTTP: enviar, entregar y cancelar
  responden 403 para un vendedor independiente. También se aclara en la
  pantalla "Mis ventas".
- Una **compra mixta** (PetShop y una o más tiendas) tiene un solo estado
  y una sola entrega. **No** hay preparación ni entrega separada por
  tienda. No se rediseñaron estados ni logística: hay que acordarlo antes
  con Mauro.

### Hallazgos de la revisión de Codex (pedido de esta etapa), corregidos

1. **Tienda suspendida vendible.** El producto desaparecía del catálogo,
   pero se podía cotizar y comprar si su id seguía en el carrito, y el
   personal podía cargarlo en una venta manual. Corrección: nuevo
   `services/disponibilidadTienda.js#verificarTiendasActivas`, llamado en
   `cotizar` (cubre el resumen y la confirmación, que re-cotiza dentro de
   la transacción) y en `registrarVenta`. Responde 409 con
   `codigo = PRODUCTO_NO_DISPONIBLE`, nombra el primer producto afectado y
   no dice que la tienda está suspendida.
   - **Concurrencia**: orden global de bloqueos intento → medio de pago →
     productos (idProducto ascendente) → tiendas (idTienda ascendente,
     `FOR SHARE`). Dos compras de la misma tienda no se esperan entre sí.
     Una suspensión en curso hace esperar a la compra, que después ve
     "suspendida". Una compra en curso hace esperar a la suspensión.
   - Para respetar ese orden, `actualizarProducto` y `eliminarProducto`
     ahora bloquean el producto antes de la tienda. Antes el orden efectivo
     era tienda → producto, inverso al de `ajustarStockProducto` y al de
     una compra.
   - El checkout muestra el motivo y ofrece "Volver al carrito". El carrito
     no se limpia solo.
2. **Los vendedores no recibían aviso de sus ventas.** Ahora se crea un
   aviso `venta_tienda` por cada tienda participante, solo para su dueño,
   con el texto "Nueva venta #N con productos de tu tienda." y enlace a
   `/panel/mis-ventas`. No incluye montos ni productos. Se crea en la misma
   transacción que la venta. No se duplica con varios productos de la misma
   tienda (se toma un Map por idTienda) ni al reintentar con la misma clave
   (esa rama devuelve el resultado antes). También se envía en la venta
   manual del personal, igual que el resto de los avisos.
3. **Mensaje falso en las migraciones.** Decían "sin aplicar cambios
   parciales", pero cada `ALTER TABLE` de MySQL hace commit implícito. Los
   tres runners (`migrarCU04Ronda2`, `migrarRonda2Etapa7`,
   `migrarRonda2Etapa8`) ahora avisan que la base puede haber quedado a
   medias, imprimen consultas de inspección de solo lectura y el comando
   para reanudar. El procedimiento completo está en
   [actualizacion-base-existente.md](actualizacion-base-existente.md).

### Codex: revisión de diseño (antes de implementar)

Aprobó el orden de bloqueos y el diseño de los avisos, y pidió cambios que
se aplicaron:

- Detectar la FK de `producto.idTienda` por columna y tabla referenciada, no
  por nombre (una FK creada por `sync()` tiene otro nombre).
- Abortar sin tocar nada si `producto.idTienda` existe con un tipo o una
  nulabilidad incompatibles.
- Chequear antes de cada ALTER que un ENUM solo se amplía (Etapas 7 y 8).
- Leer `LIMITE_REGISTRO_POR_IP` con un parser estricto (el valor por
  defecto sigue en 15).
- Tres pruebas más: reintento aprobado después de suspender, edición
  concurrente contra suspensión, y FK con otro nombre.

Transcripción completa: `EVIDENCIA-codex-etapa9-diseno.txt`.

### Codex: revisión de la implementación

Encontró 3 hallazgos. Los 3 eran reales, se corrigieron y se reverificaron:

1. **(Alta, heredado de CU-04)** `cotizacionEstaDesactualizada` no comparaba
   `cantidad` ni `subtotalCentavos`. Con el mismo total, una combinación de
   cantidades distinta (A×2+B×1 en lugar de A×1+B×3) pasaba como la
   cotización aceptada. Se reprodujo con una prueba unitaria que fallaba y
   se corrigió.
2. Los verificadores de migración de las Etapas 7 y 8 decían restaurar "el
   esquema completo", pero solo cargaban algunos modelos. Ahora importan
   `src/models/index.js`. Se reprodujo borrando `aviso`: ahora se recrea en
   los dos verificadores.
3. La guía de recuperación tenía hardcodeado
   `DROP TABLE solicitudvendedor, tienda`. En una base más vieja quedaban
   otras tablas de más. Ahora `crearTablasNuevas.js` imprime la sentencia
   exacta para esa base, y la guía indica usar esa.

Sin hallazgos en: caminos de venta que salteen la verificación, ciclos de
deadlock con `FOR SHARE`, destinatarios o filtrado de los avisos, y lo que
prueban las pruebas de concurrencia. Transcripción:
`EVIDENCIA-codex-etapa9-implementacion.txt`.

### Otros problemas encontrados en esta ronda (no por Codex)

- `verificarMigracionRonda2Etapa7.js` dejaba `venta`, `cliente` y
  `mediopago` con esquema mínimo en `petshop_test`, el mismo problema que
  ya había aparecido en la Etapa 8. Ahora restaura al terminar.
- El ensayo de actualización mostró que restaurar un respaldo **no borra**
  las tablas creadas después de hacerlo. Quedó documentado, con la
  sentencia exacta de reversión.
- Los comandos de PowerShell de la guía tenían problemas: `> archivo`
  guarda en UTF-16 en PowerShell 5.1, y una tubería de PowerShell recodifica
  el texto. Se cambiaron por `mysqldump --result-file` y `cmd /c mysql <`,
  y se probaron tal cual contra `petshop_test`.
- El usuario de pruebas no tiene privilegio `RELOAD` para `mysqldump`. La
  guía usa `--set-gtid-purged=OFF --no-tablespaces`, que no lo necesitan.

### Cierre pedido

- **Compra mixta** (PetShop + tienda A con 2 productos + tienda B):
  `test-integracion/marketplaceCompra.integracion.js`. Total 950.00, stock
  de los 4 productos, 3 avisos (cliente, A y B, nadie más), "Mis ventas" de
  A con 2 líneas y 550.00, de B con 1 línea y 300.00, sin campos globales.
  El reintento con la misma clave no genera avisos nuevos.
- **Permisos cruzados por HTTP**:
  `test-integracion/permisosCruzados.integracion.js`, 11 pruebas con el
  login real de cada rol (cookie + CSRF): cliente, vendedor interno,
  administrador, vendedor de la tienda A, vendedor de la tienda B y sin
  sesión.
- **E2E del vendedor independiente**: `e2e/vendedor-independiente.spec.js`
  (solicitud, aprobación, nueva sesión, producto propio, compra del
  cliente, aviso, "Mis ventas" y acceso por URL directa). Registra su
  propia cuenta en cada corrida y nunca cambia el rol de las cuentas
  sembradas. Para eso, `.env.e2e` sube `LIMITE_REGISTRO_POR_IP`.
- **Matriz requisito → implementación → prueba → estado**:
  [matriz-trazabilidad.md](matriz-trazabilidad.md).
- **Actualización de una base existente**:
  [actualizacion-base-existente.md](actualizacion-base-existente.md) y los
  scripts `crearTablasNuevas.js` y `verificarEsquemaActual.js`. Se ensayó
  en `petshop_test`: base degradada a antes de las Etapas 7 y 8 con datos
  históricos, respaldo, pasos en orden, verificación, restauración, y un
  fallo provocado a mitad con su reanudación. **`petshop_db` no se tocó ni
  se leyó**: queda para que Mauro la actualice a mano.
- `src/models/index.js`: lista única de modelos, usada por `server.js` y
  por los scripts.
- Capturas en escritorio, tablet y móvil: `e2e/capturas-salida/`, 14 por
  viewport. Las `11-` a `14-` son nuevas (Quiero ser vendedor, solicitudes,
  Mi tienda, Mis ventas).

### Resultados reales de esta etapa (ejecutados en esta ronda, después de todas las correcciones)

```
cd backend && npm test                                            → 300/300
cd backend && npm run test:integracion (contra petshop_test real)  → 147/147
cd frontend && npm test                                            → 23 archivos, 141/141
cd frontend && npm run lint                                        → sin errores
cd frontend && npm run build                                       → sin errores
npx playwright test (frontend, contra petshop_e2e)                 → 39/39 (13 casos × 3 viewports)
verificarMigracionRonda2Etapa7.js / Etapa8.js (petshop_test)       → OK (Etapa 8 incluye 3 casos nuevos)
Ensayo de actualización (petshop_test)                             → OK, ver actualizacion-base-existente.md
```

### Límites de cobertura (lo que NO está verificado)

- La compra mixta con tres orígenes está probada en integración (MySQL
  real), no de punta a punta en el navegador. El E2E compra solo el
  producto del vendedor nuevo.
- La suspensión desde `PanelTiendas.jsx` no tiene E2E. Está probada por
  servicio y por HTTP.
- Las pruebas de concurrencia son deterministas, con bloqueos retenidos a
  propósito. No son pruebas de carga.
- `petshop_db`: no se sabe qué migraciones le faltan. El paso 0 de la guía
  (`verificarEsquemaActual.js`) lo dice.
- En "Mis ventas", un nombre de producto largo empuja la columna "Mi
  subtotal" fuera de la vista y hay que desplazar la tabla horizontalmente
  (visible en la captura de escritorio con los nombres largos del E2E). No
  se cambió el diseño de la tabla.
- `petshop_e2e` acumula en cada corrida del E2E nuevo una cuenta
  aspirante, una tienda, un producto y una venta. No afecta a las demás
  pruebas. `npm run sembrar:e2e` la deja limpia.

## Pendientes de alcance (no implementados, no se inventaron reglas)

- **Reglas de aplicación de `PromocionProducto`** (ver arriba): propuesta
  concreta escrita, pendiente de confirmación.
- **Interpretación de "ventas por proveedor"** (ver arriba): propuesta
  concreta implementada, pendiente de confirmación de que sea la correcta.
- ~~Cuarto caso de uso~~ — **actualizado en la sexta corrección**: Mauro
  confirmó y asignó CU-04 (checkout, pago simulado, gestión de venta) como
  su caso de uso; ya implementado y verificado (ver "Sexta corrección" más
  arriba). Sigue pendiente que el equipo y los docentes confirmen que esto
  es lo que la propuesta necesita en el casillero de "cuarto caso de uso"
  para los otros tres integrantes — eso no se puede decidir desde acá.
- **Alcance adicional voluntario no implementado**: recordatorio de pedido
  no pagado luego de un tiempo. Actualizado en la sexta corrección: desde
  CU-04 SÍ existe un estado de pago (`pago.estado`, distinto del estado del
  pedido) para las compras del checkout — pero solo para esas, no para
  ventas cargadas manualmente por el personal (que no tienen pago
  simulado); y el recordatorio en sí (un job periódico o similar) no se
  implementó, sigue siendo alcance voluntario no hecho.
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
