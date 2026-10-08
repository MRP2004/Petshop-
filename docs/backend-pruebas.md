# Pruebas del backend

Hay dos suites, con propósitos y requisitos distintos. **No se deben
confundir entre sí**: la primera nunca toca una base real; la segunda
siempre lo hace.

## 1. Pruebas sin base de datos (`backend/test/`)

Validan lógica pura (cálculos monetarios, validaciones de forma y de rango)
y el manejo HTTP de solicitudes inválidas, hasta el punto exacto en que el
código dejaría de necesitar la base (antes de abrir una transacción o
ejecutar una consulta). Varios archivos interceptan
`sequelize.transaction`, `sequelize.query` y
`sequelize.connectionManager.getConnection` para que, si algún caso
llegara a intentar tocar MySQL por error, la prueba falle de inmediato en
vez de intentar conectarse.

**No demuestran** persistencia real, rollback real ni bloqueo real de
filas en MySQL — eso lo cubre la suite de integración.

Comando (no requiere ninguna base de datos ni variables de entorno reales):

```bash
cd backend
npm test
```

Archivos y alcance:

| Archivo | Qué cubre |
|---|---|
| `test/app.test.js` | Health check, 404, cuerpo JSON inválido (preexistente). |
| `test/errorMiddleware.test.js` | Orden `UniqueConstraintError` antes que `ValidationError`, con instancias reales de Sequelize. |
| `test/validacion.test.js` | Primitivas genéricas: enteros en rango, importes obligatorios/opcionales, política de campos de texto opcionales (`limpiarCadenaOpcional`). |
| `test/ventaValidaciones.test.js` | Cálculo de subtotal/acumulado/total en centavos, límites de `DECIMAL(10,2)`, redondeo. |
| `test/ventaEntradasInvalidas.test.js` | `registrarVenta` con cuerpos/detalles/importes inválidos, directo y vía HTTP. |
| `test/productoEntradasInvalidas.test.js` | Creación/edición de producto y movimiento de stock con datos inválidos; PUT que intenta tocar `stockActual`. |
| `test/crudEntradasInvalidas.test.js` | Forma de cuerpo (null/arreglo) y tipos inválidos en campos opcionales (p. ej. `email: true`) en cliente, proveedor, categoría, tipo de mascota y medio de pago; además, `401`/`403` en rutas protegidas sin token o con rol insuficiente. |
| `test/usuarioEntradasInvalidas.test.js` | Registro/login/alta interna con datos inválidos; `GET /api/usuarios/perfil` con y sin token válido; aislamiento de `GET/PUT /api/clientes/:id` (un cliente no puede ver el registro de otro). |
| `test/ventaDescuentoAutorizacion.test.js` | **Corrección crítica**: un cliente que manda `descuento`/`minimoMayorista` no logra aplicarlos (se ignoran); el mismo campo, mandado por personal, sí se aplica. También domicilio de entrega: se persiste con "envío a domicilio", se ignora con "retiro en sucursal". Usa persistencia simulada (stubs de los modelos), igual que hizo la revisión independiente para reproducir el hallazgo sin MySQL real. |
| `test/ventaAccesoAjeno.test.js` | Permisos explícitos de "acceso a compras ajenas": un cliente no puede ver ni cancelar la venta de otro cliente (403), personal sí puede ver cualquiera, una venta inexistente da 404 para cualquier rol. Persistencia simulada. |
| `test/sesionYCsrf.test.js` | Estrategia de sesión por cookies: login deja el JWT solo en una cookie HttpOnly (nunca en el cuerpo); una solicitud mutable por cookie sin `X-CSRF-Token` responde 403; con el token correcto, pasa; un `Authorization: Bearer` explícito no lo exige; logout limpia las cookies; límite de intentos de login (8 cada 15 min) responde 429 al superarlo. Persistencia simulada solo para `Usuario.findOne` (verificación real de contraseña con `scrypt`, sin base). |
| `test/promocionEntradasInvalidas.test.js` | Validación de calendario real de `PromocionProducto` (30 de febrero, 31 de abril, mes 13, 29 de febrero en año bisiesto vs. no bisiesto), antes y después de la corrección que evita que `Date` de JavaScript "normalice" fechas inválidas en silencio. |
| `test/productoImagen.test.js` | **Corrección de esta etapa** (imágenes de producto): crear/actualizar un producto con `urlImagen` persiste (o reemplaza, o borra) la fila relacionada en `imagenproducto`; URL sin `http(s)` o demasiado larga responde 400. Persistencia simulada. |
| `test/limiteIntentosPorIp.test.js` | **Corrección de una revisión posterior** (límites por IP, con `Map` independiente por instancia): cambiar de email no evita el límite general por IP; login y registro no comparten conteos; la limpieza de una ventana corta no borra intentos vigentes de una ventana más larga (con `mock.timers`); recuperación tras vencer la ventana. |
| `test/productoImagenAtomico.test.js` | **Corrección de una revisión posterior** (producto e imagen como una operación atómica): reproduce con persistencia simulada el hallazgo original (`ImagenProducto.destroy` "exitoso" seguido de un `producto.destroy` que falla) y confirma que cada escritura de una misma operación recibe el mismo objeto de transacción, y que un fallo en cualquier paso se propaga sin que nada lo trague. |

## 2. Pruebas de integración real (`backend/test-integracion/`)

Ejercitan los servicios reales contra una base MySQL real y aislada:
persistencia, rollback, bloqueo de filas, condiciones de carrera y
comportamiento efectivo de las claves foráneas. **Nunca se descubren con
`npm test`** (los archivos no terminan en `.test.js` y viven fuera de
`test/`), precisamente para que no puedan ejecutarse por accidente sin una
base de pruebas preparada.

Requisitos antes de correrlas: `petshop_test` y su usuario exclusivo
(`petshop_test_app`) ya existen (ver
[backend-base-de-datos.md](backend-base-de-datos.md), "Bases y usuarios de
prueba"); falta completar la contraseña en `backend/.env.test`
(`DB_PASSWORD`), que ya trae el resto de la configuración correcta
(`DB_NAME=petshop_test`, `PERMITIR_LIMPIEZA_INTEGRACION=si`).

Comando (bash/Git Bash):

```bash
cd backend
DOTENV_CONFIG_PATH=.env.test npm run test:integracion
```

Archivos agregados en la Etapa 9 de la ronda 2:

- `marketplaceCompra.integracion.js` (8 pruebas): compra mixta con un
  producto de PetShop y dos tiendas (total, stock, un aviso por tienda,
  "Mis ventas" de cada vendedor), reintento idempotente sin avisos nuevos,
  tienda suspendida al cotizar, confirmar y en la venta manual, y cuatro
  pruebas de concurrencia con bloqueos reales retenidos por una conexión
  cruda (suspensión contra compra en los dos órdenes, orden producto →
  tienda con una sonda `FOR UPDATE NOWAIT`, suspensión contra edición).
- `permisosCruzados.integracion.js` (11 pruebas): permisos por HTTP con el
  **login real** de cada rol (cookie de sesión + `X-CSRF-Token`): cliente,
  vendedor interno, administrador, vendedores independientes de dos
  tiendas distintas y sin sesión.

`test/utilMigracion.test.js` (unitaria) cubre el chequeo de "el ENUM solo
se amplía" que usan las migraciones.

Comando (PowerShell):

```powershell
cd backend
$env:DOTENV_CONFIG_PATH = ".env.test"
npm run test:integracion
```

`ayudaIntegracion.js` vuelve a comprobar, antes de tocar cualquier dato,
que `DB_NAME` coincide **exactamente** con `petshop_test` (ya no alcanza
con que lo "contenga") y que la base a la que la conexión realmente
terminó apuntando también coincide (`SELECT DATABASE()`); si algo no
coincide, aborta antes de escribir nada.

El script corre con `--test-concurrency=1`: los tres archivos se ejecutan
uno después del otro, no en paralelo, porque comparten las mismas tablas y
cada uno limpia datos entre pruebas. Esto no afecta la concurrencia
*interna* que las propias pruebas necesitan ejercitar (dos operaciones
reales lanzadas a la vez dentro de un mismo test).

Archivos y alcance:

| Archivo | Qué cubre |
|---|---|
| `test-integracion/ventaConcurrencia.integracion.js` | Venta válida (stock, importes), stock insuficiente (validación, sin escrituras), **rollback real después de escrituras dentro de la transacción** (restitución que desborda `INTEGER` al cancelar), subtotal individual fuera de rango con un descuento válido por sí mismo, total fuera de rango, cancelación y restitución exacta, doble cancelación secuencial, envío y transiciones inválidas, y tres escenarios de concurrencia real con contención confirmada: cancelar/enviar, doble cancelación simultánea, dos ventas simultáneas sin sobreventa. |
| `test-integracion/stockYProducto.integracion.js` | Movimiento de stock (entrada y ajuste negativo), rechazo de stock negativo, PUT que no puede tocar el stock, y un escenario de concurrencia real (contención confirmada) de ajuste de stock simultáneo con una venta, sin pérdida de cambios. |
| `test-integracion/crudBasico.integracion.js` | Relación inexistente al crear un producto, recorrido CRUD completo de Cliente, comportamiento real de la FK opcional al borrar una Categoría, y el error de clave foránea al borrar un Cliente con ventas — verificado en dos capas separadas (ver abajo). |
| `test-integracion/envioADomicilio.integracion.js` | **Nuevo en esta corrección**: la fila de `direccionentrega` queda persistida de verdad para "envío a domicilio"; "retiro en sucursal" no crea ninguna; rollback real — si la venta falla (stock insuficiente de un segundo producto), no queda ninguna venta ni domicilio huérfano. |
| `test-integracion/productoImagen.integracion.js` | **Nuevo en esta corrección** ("producto e imagen como una operación atómica"): alta completa persiste ambas filas relacionadas; actualizar reemplaza la URL sin duplicar la fila; borrado permitido elimina ambas; **rollback real** — un borrado bloqueado por una venta asociada (`ForeignKeyConstraintError` real) no deja el producto sin su imagen (reproduce contra MySQL real el hallazgo original). |

`ayudaIntegracion.js#limpiarDatos` ahora también limpia `usuario`,
`promocionproducto` y `direccionentrega` (las tres tablas agregadas después
de que existiera esta limpieza), en el orden que respeta sus relaciones
(hijas antes que `cliente`/`producto`/`categoria`/`venta`). Incluye fixtures
(`crearUsuarioDePrueba`, `crearPromocionDePrueba`) que crean también su
`Cliente`/`Producto` relacionado si no se pasa uno explícito, para no
insertar filas que violen una FK obligatoria.

### Sincronización determinista en las pruebas de concurrencia

Antes, estas pruebas lanzaban dos operaciones con `Promise.allSettled` y
asumían que habían competido de verdad por el mismo bloqueo, sin
comprobarlo. Ahora (`ayudaIntegracion.js`): se abre una conexión cruda que
retiene un `SELECT ... FOR UPDATE` real sobre la fila en disputa, se lanzan
las operaciones reales que compiten por ella, se **confirma contra
`performance_schema.data_lock_waits`** (identificando la conexión
bloqueadora por su `CONNECTION_ID()`, no cualquier espera global) que hay
contención real, y recién ahí se libera el bloqueo y se observan los
resultados y el estado persistido. Si no se detecta contención dentro de
un timeout, la prueba falla explícitamente en vez de continuar sin
evidencia. El bloqueo retenido siempre se libera en un `finally`, para no
dejar transacciones abiertas. Requiere `GRANT SELECT ON
performance_schema.*` para el usuario de pruebas (ver
[backend-base-de-datos.md](backend-base-de-datos.md)).

### Separación de capas al probar el error de clave foránea

`crudBasico.integracion.js` comprueba el borrado de un Cliente con ventas
asociadas en dos pruebas separadas, no una sola:

- **Capa de servicio**: llamar a `eliminarCliente` directamente debe
  propagar el error real de Sequelize (`ForeignKeyConstraintError`), no un
  `AppError` con `statusCode` — esa traducción ocurre en
  `error.middleware.js`, una capa más arriba, no en el servicio.
- **Capa HTTP**: `DELETE /api/clientes/:id` sí debe responder `409` con el
  cuerpo esperado, porque ahí interviene el middleware. Además, se verifica
  que el cliente y la venta siguen existiendo después del intento fallido.

## Estado real de ejecución en esta etapa (evidencia separada por suite)

Cada suite se evalúa por separado, a propósito: que una no se haya podido
ejecutar **no dice nada** sobre si las otras corrieron o no, y viceversa.
Una corrección anterior de este informe mezclaba ambas cosas en un mismo
párrafo; acá se listan una por una.

| Suite | ¿Corrió en esta etapa? | Resultado real | Contra qué base |
|---|---|---|---|
| Backend sin base (`npm test`) | Sí | **236 pruebas, 236 aprobadas, 0 falladas** | Ninguna (mockeada/interceptada) |
| Backend integración (`npm run test:integracion`) | Sí (novena corrección, CU-04 ronda 4) | **74 pruebas, 74 aprobadas, 0 falladas**, real contra MySQL — ver [estado-proyecto.md](estado-proyecto.md) | `petshop_test` |
| Frontend unitarias/componentes (`npm test` en `frontend/`) | Sí | Ver [frontend-pruebas.md](../docs/frontend-pruebas.md) | Ninguna |
| Frontend E2E (`npx playwright test`) | Sí (novena corrección, CU-04 ronda 4) | **36 casos, 36 aprobados** (12 casos × 3 viewports), real contra el backend/frontend aislados, incluyendo la solicitud de cancelación del cliente y la cancelación directa del personal con confirmación — ver [estado-proyecto.md](estado-proyecto.md) | `petshop_e2e`, nunca `petshop_db` |

**Backend, sin base**: ejecutada de verdad en la novena corrección (CU-04,
ronda 4), con el comando exacto de arriba, 236/236. Sobre las 227 de la
octava corrección, suma 6 nuevas en `correo.service.test.js` (adjunto con
firma `%PDF`, fallo de generación de PDF, con/sin/mal-configurada
`URL_PUBLICA_FRONTEND`) + 3 nuevas en `ventaCancelacionPermisos.test.js`
(corrección adicional post-entrega: `cancelarVenta` ahora exige
explícitamente `vendedor`/`administrador`, rechazando también un rol
desconocido o la ausencia de usuario, no solo `'cliente'` — ver
`cu04-informe-cierre.md` §12.10).

**Backend, integración**: sobre las 61 de la octava corrección, suma 13
nuevas — 12 en `test-integracion/solicitudCancelacion.integracion.js`
(nuevo: solicitar, aprobar, rechazar, duplicados, decisiones repetidas,
cierre automático de una solicitud pendiente al cancelar/enviar
directamente, y dos escenarios de concurrencia real) + 1 en
`compra.integracion.js` ("el propio cliente NO puede cancelar
directamente").

**Backend, integración**: sigue exactamente en el mismo estado que en la
entrega anterior (bloqueo de privilegios de MySQL, ver
[backend-base-de-datos.md](backend-base-de-datos.md), re-verificado con una
consulta de solo lectura en esta corrección, sin volver a intentar crear
la base). No se declara aprobada ni cerrada.

**Frontend E2E**: la entrega anterior había corrido las 15 pruebas
completas de `e2e/recorrido-completo.spec.js` contra `petshop_db`
(desarrollo), lo que dejó ventas de demostración reales ahí — ver el
registro exacto en [estado-proyecto.md](estado-proyecto.md), sección
"Operaciones de demostración sobre la base de desarrollo". Esta corrección
**no volvió a correr esa suite** (evita seguir escribiendo sobre
desarrollo); tampoco se limpiaron ni restauraron los datos que ya había
(no se borra nada automáticamente). Lo único que se ejecutó contra el
servidor real en esta etapa fue: (a) verificaciones manuales de solo
lectura por HTTP (login, perfil, CSRF, logout — ninguna crea una venta) y
(b) un script de capturas de pantalla (`e2e/capturas.spec.js`,
rediseñado para esta corrección) que navega y iguala hasta el formulario
de checkout sin nunca hacer clic en "Confirmar compra": se comprobó antes
y después que el conteo de filas de `venta` en la base no cambió.
