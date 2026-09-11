# Base de datos: creación, evolución y aislamiento de pruebas

## Cómo se crea y evoluciona el esquema hoy

El backend **no crea la base de datos**. `backend/src/config/database.js`
construye una instancia de `Sequelize` apuntando a `DB_NAME`; esa base debe
existir de antemano en el servidor MySQL (creada manualmente, o con el
mismo mecanismo que usan las pruebas de integración, ver más abajo).

Lo que sí hace el backend, en `backend/src/server.js`, al arrancar:

```js
await sequelize.authenticate(); // valida la conexión
await sequelize.sync();         // crea las tablas que falten
```

`sequelize.sync()` **sin** `force` ni `alter`:

- Crea las tablas de los modelos que todavía no existan en la base.
- **No modifica ni borra tablas que ya existen.** Si se cambia una
  definición de modelo (por ejemplo, el `onDelete` de una asociación, o el
  tamaño de una columna) y la tabla ya existía, `sync()` no aplica ese
  cambio: hay que alterar la tabla manualmente o recrear la base.

Por eso este backend **evoluciona el esquema por creación incremental**, no
por migraciones versionadas: agregar un modelo nuevo (tabla nueva) es
seguro con solo reiniciar el servidor; cambiar un modelo existente (tabla
que ya existe) requiere una intervención manual explícita. Esta etapa no
agrega una herramienta de migraciones (`sequelize-cli` u otra) porque no
había una necesidad concreta que lo justificara todavía.

**Nunca se usa `sync({ force: true })` ni `sync({ alter: true })` en este
proyecto**, ni en desarrollo ni en las pruebas de integración. `force: true`
borra y recrea todas las tablas (destructivo); `alter: true` puede truncar
o perder datos al intentar ajustar columnas existentes.

## Tres esquemas distintos: no confundirlos

Este documento distingue explícitamente tres cosas que **no son lo mismo**:

1. **Esquema observado en desarrollo** (`petshop_db`): lo que hay
   *efectivamente creado* hoy en la base de desarrollo, verificado por
   lectura directa (`information_schema`), sin modificar nada. Es lo único
   que se pudo inspeccionar en esta etapa, porque es la única base a la que
   hay acceso.
2. **Esquema que generaría el código actual desde cero**: lo que se dedujo
   *leyendo el código fuente* de las asociaciones de Sequelize instalado
   (`node_modules/sequelize/lib/associations/`), sin ejecutarlo. Es una
   predicción, no una observación.
3. **Esquema de las bases de pruebas** (`petshop_test`, `petshop_e2e`): lo
   que `sequelize.sync()` crea ahí la primera vez que corren, respectivamente,
   las pruebas de integración o el backend E2E. **Actualización de esta
   etapa**: un administrador (Mauro, desde su conexión con privilegios en
   MySQL Workbench) ya creó ambas bases y sus usuarios exclusivos
   (`petshop_test_app`, `petshop_e2e_app`) — el bloqueo de privilegios que
   impedía esto en las dos correcciones anteriores está resuelto. Lo que
   falta para poder conectarse de verdad es completar la contraseña de cada
   usuario en `backend/.env.test`/`backend/.env.e2e` (ver "Completar las
   contraseñas locales" más abajo); sin eso, (2) y (3) siguen sin poderse
   comparar. Cuando se pueda, deberían coincidir (ambos parten del mismo
   código actual); si no coinciden, sería un hallazgo en sí mismo.

No se modificó la base de desarrollo para hacer pasar ninguna prueba, y no
se declara verificado el esquema de pruebas mientras no se haya generado y
observado de verdad contra las bases reales.

## Esquema observado en desarrollo (petshop_db)

Verificado por lectura directa contra `information_schema` de la base de
desarrollo, sin escribir nada:

- **Todas las FK están como `ON UPDATE NO ACTION ON DELETE NO ACTION`**,
  incluidas las opcionales (`producto.idProveedor`, `producto.idTipoMascota`,
  `producto.idCategoria`). Esto bloquea el borrado de un
  Proveedor/TipoMascota/Categoria que tenga productos asociados, en vez de
  poner la referencia en `NULL`.
- Se encontró una tabla `promocionproducto` ya creada
  (`idPromocionProducto`, `fechaInicio DATE`, `fechaFin DATE`,
  `descuento DECIMAL(5,2)`, `idProducto` con FK obligatoria a `producto`,
  `idCategoria` con FK opcional a `categoria`), **sin ningún modelo,
  servicio, controlador ni ruta correspondiente en el código actual**. Es
  esquema huérfano: quedó de un desarrollo anterior de la funcionalidad
  `PromocionProducto` (comprometida en `proposal.md` pero no implementada
  en esta rama). No se tocó esa tabla en esta etapa. Ver
  [estado-proyecto.md](estado-proyecto.md).
- Todas las tablas usan **InnoDB**: soporta transacciones, bloqueo de filas
  y las FK que el código de ventas y de stock necesitan.
- No existe **ninguna restricción `UNIQUE`** en ninguna tabla (más allá de
  las claves primarias).
- Los tipos decimales de dinero (`producto.precio`,
  `detalleventa.precioUnitario`, `detalleventa.subtotal`, `venta.total`,
  `venta.descuento`, `venta.minimoMayorista`) son todos `DECIMAL(10,2)`,
  igual que las validaciones de `backend/src/utils/validacion.js`
  (`MAXIMO_IMPORTE_PESOS = 99999999.99`).
- **`direccionentrega`** (agregada esta etapa, ver más abajo "Evolución de
  esquema"): `idVenta INT NOT NULL` (PK, también FK a `venta.idVenta`),
  `direccion VARCHAR(200) NOT NULL`. FK `ON UPDATE CASCADE ON DELETE NO
  ACTION` (generada por Sequelize sin pedirlo explícitamente: no puede ser
  `SET NULL` porque la columna es la propia clave primaria, no nula). Esto
  significa que una `Venta` con domicilio cargado no podría borrarse
  mientras la fila de `direccionentrega` siga ahí — no es un problema hoy
  porque el sistema nunca borra una `Venta` (no existe `eliminarVenta`, solo
  cancelar/enviar).
- **`imagenproducto`** (agregada en esta corrección, ver "Imágenes de
  producto" abajo): `idProducto INT NOT NULL` (PK, también FK a
  `producto.idProducto`), `url VARCHAR(300) NOT NULL`. Misma FK `ON UPDATE
  CASCADE ON DELETE NO ACTION` que `direccionentrega`, con una diferencia
  importante: `producto` **sí** se borra (`DELETE /api/productos/:id`
  existe). Por eso `producto.service.js#eliminarProducto` borra primero la
  fila de `imagenproducto` (si existe) antes de borrar el producto — sin
  eso, borrar un producto con imagen cargada fallaría con un error de
  restricción de clave foránea en vez de completarse. Se encontró este
  detalle escribiendo la funcionalidad, no fue reportado por la revisión.

## Predicción por lectura del código: qué generaría el código actual

Trazando el código de asociaciones tal como está hoy
(`Producto.belongsTo(X)` seguido de `X.hasMany(Producto)`, con la FK
declarada `allowNull: true`), lo que generaría una base creada *desde cero*
sería `onDelete: 'SET NULL'` para las FK opcionales, **no** `NO ACTION`
(distinto de lo observado en desarrollo, punto anterior).

## Diferencias pendientes y su impacto

La explicación más probable de la diferencia entre lo observado en
desarrollo y lo que predice el código actual: la base de desarrollo se creó
con `sync()` en algún momento anterior (posiblemente con una versión
distinta del código de asociaciones), y `sync()` nunca vuelve a tocar una
tabla que ya existe, así que ese esquema quedó "congelado" aunque el código
haya cambiado después.

**Impacto concreto:** en desarrollo, borrar una Categoria/Proveedor/
TipoMascota referenciada por un Producto queda bloqueado (409). Si el
esquema de pruebas terminara generándose con `SET NULL` (como predice el
código actual), el mismo borrado ahí tendría éxito y dejaría la FK en
`NULL` en vez de bloquearse — un comportamiento observable distinto entre
ambos entornos para la misma operación. La prueba
`test-integracion/crudBasico.integracion.js` (`comportamiento real de la FK
opcional...`) está escrita para confirmar cuál de los dos aplica en
`petshop_test`, pero **no se pudo ejecutar todavía** (ver bloqueo más
abajo): esta diferencia sigue sin resolverse empíricamente, solo
documentada como riesgo conocido.

## Datos de desarrollo vs. datos de prueba

- **Desarrollo**: `backend/.env` (no versionado), apunta a la base habitual
  del desarrollador (`DB_NAME=petshop_db` en el ejemplo). El servidor
  (`npm run dev` / `npm start`) usa exclusivamente esta configuración.
- **Pruebas de integración**: `backend/.env.test` (no versionado; hay un
  `backend/.env.test.example` versionado, sin secretos). Apunta a una base
  **distinta**, con un usuario **exclusivo y distinto** del de desarrollo.

### Resguardos antes de cualquier limpieza (reforzados en esta corrección)

Antes, el resguardo aceptaba cualquier `DB_NAME` que contuviera la palabra
`"test"` (una expresión regular laxa). Ahora `test-integracion/ayudaIntegracion.js`
exige, en este orden, antes de ejecutar `limpiarDatos()` o `sync()`:

1. `PERMITIR_LIMPIEZA_INTEGRACION=si` definida explícitamente (si falta,
   aborta sin conectarse).
2. `DB_NAME` debe ser un identificador de base de datos válido (letras,
   números, guion bajo) **y coincidir exactamente** con el nombre permitido
   (`petshop_test` por defecto, configurable con
   `INTEGRACION_DB_NAME_PERMITIDA`) — ya no alcanza con que "contenga"
   la palabra test.
3. Ya conectado, se vuelve a comprobar el nombre **efectivo** de la base
   con `SELECT DATABASE()`, no solo la variable de entorno: si por algún
   motivo la conexión real terminó apuntando a otro lado, se aborta antes
   de escribir nada.

Cualquiera de estos tres chequeos que falle hace abortar **antes** de la
operación, nunca después.

### El mismo resguardo faltaba en server.js (corrección de una revisión independiente)

Los tres chequeos de arriba son de `test-integracion/ayudaIntegracion.js` y
de `scripts/sembrarDatosE2E.js` (que tiene los suyos propios, mismo
criterio, contra `petshop_e2e`) — pero **`src/server.js`** (el proceso
normal, el que arranca `npm run dev`/`npm run dev:e2e`) no tenía ningún
resguardo equivalente: llamaba a `sequelize.sync()` directo después de
`authenticate()`, sin comprobar antes contra qué base estaba conectado de
verdad. Para desarrollo esto es inofensivo (`petshop_db` es, precisamente,
lo esperado, sin un nombre fijo que validar) — pero para `ENTORNO=e2e`
(`npm run dev:e2e`), si `DB_NAME` en `.env.e2e` hubiera terminado apuntando
a otra base por error (un typo, un merge, copiar mal el archivo), `sync()`
se habría ejecutado igual, sin abortar, alterando el esquema de lo que
fuera que `DB_NAME` resolviera — sin ningún resguardo entre el aislamiento
declarado y la operación que modifica el esquema.

**Corregido**: `server.js` ahora consulta `SELECT DATABASE()`/`CURRENT_USER()`
ANTES de `sync()` (no después, que es cuando lo hacía antes, solo a modo
informativo) y, para `ENTORNO=e2e`/`ENTORNO=test`, aborta si la base
efectiva no es exactamente la esperada (`petshop_e2e`/`petshop_test`,
mismos valores por defecto que los scripts de arriba, configurables con
`E2E_DB_NAME_PERMITIDA`/`INTEGRACION_DB_NAME_PERMITIDA`). Verificado
arrancando `npm run dev:e2e` de verdad: imprime `Base de datos efectiva:
petshop_e2e` antes de sincronizar, y `npm test` (177/177) sigue sin
necesitar ninguna base real.

**`GET /api/health/aislamiento`** (nuevo, separado de `/api/health`, que
sigue sin depender de la base — ver `.github/workflows/backend-tests.yml`,
que corre `npm test` sin MySQL): expone el mismo `SELECT
DATABASE()`/`CURRENT_USER()` por HTTP, para que un proceso externo (no solo
`server.js` al arrancar) pueda confirmar la base y el usuario de conexión
EFECTIVOS de una instancia ya corriendo. Lo usa
`frontend/e2e/globalSetupAislamiento.js` antes de correr cualquier prueba
Playwright (ver [frontend-pruebas.md](frontend-pruebas.md)) — antes, ese
chequeo solo confirmaba `entorno` (el valor de una variable de entorno,
autodeclarado), no la conexión real.

**Corrección de una revisión posterior**: nombre de base y usuario de
conexión no son credenciales, pero tampoco hace falta que los conteste
cualquier instancia. Habilitado **solo cuando `ENTORNO=e2e`** — fuera de
ese entorno (desarrollo, o cualquier instancia sin esa variable) responde
`404 "Ruta no encontrada"` (el mismo cuerpo que cualquier ruta inexistente)
**sin llegar a consultar la base**, no solo con un error distinto. Probado
en `backend/test/app.test.js`: un caso confirma el `404` sin `ENTORNO=e2e`
y sin ningún mock de `sequelize` (si el código llegara a consultar la base
de todas formas, la prueba fallaría igual, por un error real contra una
conexión no configurada — no hace falta un espía para probar la ausencia
de la llamada); otro caso, con `ENTORNO=e2e` y `sequelize.query`
reemplazado por uno fijo (mismo patrón que `productoImagen.test.js`),
confirma el `200` con base/usuario expuestos.

## Bases y usuarios de prueba — bloqueo resuelto en esta etapa

**Las dos correcciones anteriores** de esta etapa quedaron bloqueadas acá:
`petshop_app` (el usuario de conexión de desarrollo) no tenía privilegio
global (`CREATE DATABASE`/`CREATE USER`/`GRANT`, que requieren `*.*`, no
`petshop_db.*`), confirmado con `SHOW GRANTS FOR CURRENT_USER()`. **Ese
bloqueo está resuelto**: Mauro, desde su propia conexión administradora en
MySQL Workbench, ya creó las dos bases y sus usuarios exclusivos:

| Base | Usuario | Privilegios | Uso |
|---|---|---|---|
| `petshop_test` | `petshop_test_app` | `ALL` sobre `petshop_test.*`, `SELECT` sobre `performance_schema.data_lock_waits`/`performance_schema.threads` | Integración del backend (`npm run test:integracion`) |
| `petshop_e2e` | `petshop_e2e_app` | `ALL` sobre `petshop_e2e.*` | E2E aislado (Playwright, ver [frontend-pruebas.md](frontend-pruebas.md)) |

Ninguno de los dos es `root` ni reutiliza `petshop_app` (el de desarrollo):
cada base tiene su propio usuario con privilegios limitados a esa única
base, como ya pedían las dos correcciones anteriores.

`backend/scripts/prepararBaseTest.js` (el script que hubiera creado esto
con credenciales de administración) ya no hace falta ejecutarlo — se deja
en el repo tal cual, documentado, por si alguna vez hace falta recrear
alguna de las dos bases desde cero.

### Completar las contraseñas locales

Lo único que falta para poder conectarse de verdad es la contraseña de
cada usuario, que **no se pide por chat ni se imprime en ningún lado**:
Mauro la completa directamente en VS Code, en los dos archivos siguientes
(ya creados a partir de sus `.example`, ambos ignorados por Git):

- **`backend/.env.test`** → campo `DB_PASSWORD` (la del usuario
  `petshop_test_app`).
- **`backend/.env.e2e`** → campo `DB_PASSWORD` (la del usuario
  `petshop_e2e_app`).

Con eso completo, `npm run test:integracion` (ver
[backend-pruebas.md](backend-pruebas.md)) y `npm run dev:e2e` (ver
[frontend-pruebas.md](frontend-pruebas.md)) se conectan sin más pasos: no
hace falta `CREATE DATABASE` ni `CREATE USER`, las dos bases ya existen.

**Verificación al arrancar**: `server.js` (cualquier instancia: desarrollo,
o `npm run dev:e2e`) imprime, apenas se conecta, la base y el usuario
EFECTIVOS (`SELECT DATABASE()`, `SELECT CURRENT_USER()`), no solo lo que
dice la variable de entorno — así se puede confirmar a simple vista que
apuntó adonde debía antes de que sincronice ningún esquema o siembre
ningún dato. `test-integracion/ayudaIntegracion.js` hace el mismo tipo de
comprobación (`asegurarBaseEfectivaDePrueba`) antes de cada operación, y
`scripts/sembrarDatosE2E.js` antes de sembrar la base E2E.

## Aislamiento entre archivos de integración

`npm run test:integracion` corre con `--test-concurrency=1`: los tres
archivos de `test-integracion/` se ejecutan **uno después del otro**, no en
paralelo. Antes, `node --test` con varios archivos podía correrlos en
procesos paralelos, y como los tres comparten las mismas tablas y cada uno
llama a `limpiarDatos()` en su `beforeEach`, un archivo podía borrar datos
que otro estaba usando en ese mismo instante. `--test-concurrency=1` no
afecta la concurrencia *interna* de un test (por ejemplo, dos llamadas
reales lanzadas con `Promise.allSettled` dentro de una misma prueba, que es
justamente lo que las pruebas de condiciones de carrera necesitan seguir
ejerciendo): solo serializa qué archivo corre cuando.

Entre cada prueba dentro de un mismo archivo, `limpiarDatos()` borra las
filas de las tablas del dominio (`DELETE`, en orden que respeta las FK), no
las tablas en sí. No usa `TRUNCATE` ni `sync({ force: true })`.

## Sincronización determinista en las pruebas de concurrencia

Las pruebas que ejercitan condiciones de carrera reales
(`test-integracion/ventaConcurrencia.integracion.js`,
`test-integracion/stockYProducto.integracion.js`) ya no se limitan a lanzar
dos operaciones con `Promise.allSettled` y asumir que compitieron de
verdad. El mecanismo (en `ayudaIntegracion.js`):

1. Se abre una conexión cruda (fuera del pool de Sequelize) que toma un
   `SELECT ... FOR UPDATE` real sobre la fila en disputa y lo retiene
   (transacción abierta, sin commitear).
2. Se lanzan las operaciones reales que compiten por esa misma fila.
3. Se confirma, contra `performance_schema.data_lock_waits` (unido con
   `performance_schema.threads` para identificar la conexión bloqueadora
   por su `CONNECTION_ID()`, no cualquier espera global del servidor), que
   hay contención real antes de continuar. Si no la hay dentro de un
   timeout, la prueba falla explícitamente en vez de continuar como si
   hubiera contención.
4. Recién ahí se libera el bloqueo retenido y se espera el resultado de
   las operaciones reales, verificando tanto las respuestas como el estado
   persistido.
5. La conexión cruda se cierra siempre (`try/finally`), incluso si alguna
   aserción falla, para no dejar transacciones abiertas.

**Permiso requerido:** `GRANT SELECT ON performance_schema.*` para el
usuario de pruebas (ya incluido en las instrucciones de creación de
usuario de arriba). Si ese permiso faltara, `ayudaIntegracion.js` lanza un
error explícito indicando exactamente qué falta, en vez de reportar
silenciosamente "sin contención".

## Evolución de esquema en esta corrección: por qué una tabla nueva, no un ALTER TABLE

Para el domicilio de entrega (caso de uso "envío a domicilio",
[casos-de-uso.md](casos-de-uso.md)) la primera versión agregó una columna
`direccionEntrega` directamente al modelo `Venta`. Eso **rompió la
aplicación real contra la base de desarrollo**: `sync()` no altera tablas
existentes (ver arriba), así que la tabla `venta` real seguía sin esa
columna, pero el modelo Sequelize ya la esperaba en **toda** consulta sobre
`Venta` (no solo al crear una venta con domicilio) — cualquier `GET
/api/ventas`, cancelar, marcar enviada, etc. empezó a fallar con
`ER_BAD_FIELD_ERROR: Unknown column 'direccionEntrega'`. Se detectó
probando manualmente contra el backend real (lectura, sin escribir nada) y
se revirtió de inmediato.

**Solución**: una tabla nueva, `direccionentrega` (`idVenta` PK/FK a
`venta`, `direccion`), en relación 1 a 1 opcional con `Venta`
(`Venta.hasOne`). Una tabla nueva es segura con `sync()` (crea lo que
falta, no toca lo que ya existe — exactamente el mecanismo ya establecido
para `usuario`), así que **no hizo falta ningún `ALTER TABLE` ni ninguna
migración manual**: alcanzó con el mismo `sync()` de siempre. Se verificó
que efectivamente se creó sola, sin intervención manual, y que el resto de
las operaciones sobre `Venta` siguieron funcionando exactamente igual que
antes (mismo comando `GET /api/ventas`, antes y después, comparado
directamente).

Esta es la lección concreta detrás de "preparar cualquier cambio de
esquema como evolución revisable": para una tabla que **ya existe** con
datos reales, alcanza con pensar el diseño como una tabla nueva relacionada
en vez de una columna agregada, siempre que la relación lo permita (acá,
1 a 1 opcional lo permite perfectamente) — evita necesitar tocar la tabla
existente en absoluto, no solo evita ejecutar el cambio ahora.

## Imágenes de producto: mismo criterio que direccionEntrega

Corrección de esta etapa (ver también
[frontend-diseno.md](frontend-diseno.md)): para cargar una imagen real por
producto (opcional — sigue sin haber fotos reales fabricadas) se aplicó la
misma lección que domicilio de entrega, directamente: una tabla nueva
relacionada (`imagenproducto`, 1 a 1 opcional con `producto`), no una
columna agregada a `producto`. `producto` es una tabla existente con datos
reales en desarrollo (6 filas verificadas); agregarle una columna habría
repetido el mismo error ya cometido y corregido una vez con
`direccionEntrega` (columna nueva en una tabla existente rompe **todas**
las consultas contra esa tabla si la base real no tiene la columna, porque
Sequelize la incluye en toda consulta generada para ese modelo). Se creó
sola con `sync()` (verificado por lectura directa de `information_schema`,
sin escribir nada: ver arriba) y no requirió ningún `ALTER TABLE`.

## Tablas agregadas en las últimas etapas

| Tabla | Motivo | Relación |
|---|---|---|
| `usuario` | Autenticación (ver [backend-autenticacion.md](backend-autenticacion.md)) | FK opcional y única a `cliente` |
| `promocionproducto` | Ya existía huérfana; ahora tiene código (`PromocionProducto`) | FK obligatoria a `producto`, opcional a `categoria` |
| `direccionentrega` | Domicilio de entrega (ver arriba) | FK obligatoria (y PK) a `venta`, 1 a 1 |
| `imagenproducto` | Imagen real de producto (ver arriba, esta corrección) | FK obligatoria (y PK) a `producto`, 1 a 1 |

Las cuatro se crean solas con `sync()`, sin intervención manual, en
cualquier base donde el backend arranque (desarrollo, o una futura
`petshop_test`/`petshop_e2e` una vez que se puedan crear — ver
"Base aislada para E2E" más abajo).

## Estado de la integración: no se declara cerrada

Ninguna de las pruebas de `test-integracion/` se ejecutó todavía contra
datos reales en esta etapa (bloqueo de privilegios, ver arriba). Se
verificó que cargan sin errores de sintaxis/importación y que los
resguardos abortan correctamente ante configuración inválida, pero eso no
equivale a que sus aserciones —incluidas las que dicen demostrar rollback
real o concurrencia real— se hayan comprobado alguna vez contra MySQL. No
se declara la integración cerrada ni verificada.
