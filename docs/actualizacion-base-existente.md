# Actualizar una base existente (por ejemplo, `petshop_db`) al código actual

Esta guía es para Mauro, para actualizar **a mano** su base de desarrollo
`petshop_db`. En esta ronda no se tocó `petshop_db`: el procedimiento se
ensayó completo sobre `petshop_test` (ver "Qué se ensayó de verdad" al
final), no sobre `petshop_db`.

## Por qué hace falta

El backend solo crea tablas **nuevas** al arrancar (`sequelize.sync()` sin
`alter`/`force`, ver [backend-base-de-datos.md](backend-base-de-datos.md)).
Los cambios sobre tablas **existentes** se aplican con scripts manuales,
idempotentes, en `backend/scripts/`. Si una base se creó antes de estas
entregas y nunca se migró, el código actual falla al usarla (por ejemplo,
cualquier consulta de productos falla si falta `producto.idTienda`).

## Pasos pendientes, en este orden exacto

| # | Comando (desde `backend/`) | Qué cambia | ¿Toca datos? |
|---|---|---|---|
| 0 | `node scripts/verificarEsquemaActual.js` | Nada (solo lectura). Lista qué falta. | No |
| 1 | `node scripts/crearTablasNuevas.js --confirmar` | Crea las tablas nuevas que falten (CU-04, `direccioncliente`, `favorito`, `aviso`, `tienda`, `solicitudvendedor`, etc.). No toca las existentes. | No |
| 2 | `node scripts/migrarCU04Ronda2.js --confirmar` | Índice único en `mediopago.nombre`; ENUM de `comprobante.estadoCorreo` (amplía, convierte `'enviado'` → `'simulado'`, angosta); 3 columnas nuevas en `comprobante`. | **Sí**: el `UPDATE` de `estadoCorreo`. Aborta sin cambios si hay nombres de medio de pago duplicados. |
| 3 | `node scripts/migrarRonda2Etapa7.js --confirmar` | Amplía el ENUM `venta.estado` (+`lista_para_retirar`, `entregada`). | No: ninguna venta cambia de estado. |
| 4 | `node scripts/migrarRonda2Etapa8.js --confirmar` | Amplía el ENUM `usuario.rol` (+`vendedor_independiente`); agrega `producto.idTienda` (NULL) con FK a `tienda`. | No: ninguna cuenta ni producto cambia. |
| 5 | `node scripts/verificarEsquemaActual.js` | Nada. Debe terminar en "Esquema al día con el código actual." | No |

Por qué este orden:

- El paso 1 va primero porque el paso 2 necesita que existan `comprobante`
  y `mediopago` (si la base es anterior a CU-04), y el paso 4 necesita que
  exista `tienda` para crear la FK. `crearTablasNuevas.js` crea tablas **sin
  levantar el servidor HTTP**: nadie usa la API mientras el esquema está a
  medio migrar.
- Cada script revisa `INFORMATION_SCHEMA` antes de cada cambio y saltea lo
  que ya está hecho. Si un paso ya estaba aplicado, dice "nada que hacer"
  y no cambia nada. Por eso los pasos 1 a 4 se corren todos, aunque la
  base ya tenga alguno aplicado.
- Sin `--confirmar`, cada script solo informa a qué base se conectó y no
  cambia nada.

## Procedimiento completo

### 1. Antes de empezar

1. Detené el backend de desarrollo (y cualquier otro proceso que use la base).
2. Confirmá contra qué base vas a trabajar: los scripts leen `backend/.env`
   (el mismo que usa `npm run dev`), e imprimen la base y el usuario
   **reales** de la conexión antes de hacer nada.
3. Revisá el estado de partida:

   ```powershell
   cd backend
   node scripts/verificarEsquemaActual.js
   ```

   Cada línea dice `OK` o `PENDIENTE` y el script que lo resuelve.

### 2. Respaldo (obligatorio)

Los `ALTER TABLE` de MySQL **no se pueden revertir con una transacción**:
cada uno hace commit implícito. La única vuelta atrás real es el respaldo.

```powershell
$env:MYSQL_PWD = "<contraseña del usuario de MySQL>"
& "C:\Program Files\MySQL\MySQL Server 9.7\bin\mysqldump.exe" -h localhost -u <usuario> `
  --single-transaction --set-gtid-purged=OFF --no-tablespaces --result-file=respaldo-petshop_db.sql petshop_db
$env:MYSQL_PWD = $null
```

- `--result-file` en vez de `> archivo`: en Windows PowerShell 5.1, `>`
  guarda el archivo en UTF-16, no en el UTF-8 que genera `mysqldump`.
- La contraseña va por `MYSQL_PWD` y no por `-p...`, para que no quede en
  el historial ni en la lista de procesos.
- `--set-gtid-purged=OFF` y `--no-tablespaces` evitan los privilegios
  `RELOAD`/`PROCESS`, que un usuario de aplicación normalmente no tiene
  (sin ellos, el usuario de pruebas falló con `Access denied ... RELOAD`
  en el ensayo).
- Confirmá que el archivo tiene contenido (`CREATE TABLE` e `INSERT INTO`)
  antes de seguir. Si la ruta de MySQL es otra, ajustala.

### 3. Aplicar los pasos 1 a 4

```powershell
node scripts/crearTablasNuevas.js --confirmar
node scripts/migrarCU04Ronda2.js --confirmar
node scripts/migrarRonda2Etapa7.js --confirmar
node scripts/migrarRonda2Etapa8.js --confirmar
```

Si alguno falla, **no sigas con el siguiente**: ver "Si algo falla".

### 4. Verificación posterior

```powershell
node scripts/verificarEsquemaActual.js
```

Todo debe decir `OK` y el script termina con código 0. Después:

1. Levantá el backend (`npm run dev`) y confirmá en la consola
   "Modelos sincronizados con la base de datos".
2. Revisá a mano, sin escribir nada: el catálogo carga, "Mis compras" de
   una cuenta cliente muestra sus ventas con el estado de siempre, y en el
   panel las cuentas `vendedor` existentes siguen entrando como personal
   interno (ninguna se convirtió en otra cosa).

### Migración adicional de promociones

La migración inicial ya no alcanza para el esquema de promociones actualizado:
`promocionproducto.idCategoria` dejó de usarse porque cada promoción apunta a
un producto concreto. Después de respaldar la base y detener el backend,
ejecutá desde `backend/`:

```powershell
node scripts/migrarPromociones.js
node scripts/migrarPromociones.js --confirmar
node scripts/verificarEsquemaActual.js
```

El primer comando solo confirma la base y el usuario conectados. El segundo
elimina la columna y cualquier FK asociada; los valores de categoría que
existieran en esa columna se descartan. La operación es idempotente, pero el
`ALTER TABLE` de MySQL no se revierte con una transacción: hacé un respaldo
antes de confirmar.

## Si algo falla

Un fallo **puede dejar la base aplicada a medias**: los pasos anteriores (y
a veces parte del paso que falló) ya quedaron hechos. Ejemplo real del
ensayo: al correr la migración de la Etapa 8 sin haber creado `tienda`, el
paso 1 (ENUM de `usuario.rol`) quedó aplicado y el paso 2 falló.

Cada runner, al fallar, imprime:

- el error,
- las consultas de solo lectura para ver el estado real
  (`SHOW COLUMNS ...`, `INFORMATION_SCHEMA...`),
- el comando para reanudar.

### Opción A: reanudar (lo normal)

1. Leé el error y corregí la causa (por ejemplo, correr antes
   `crearTablasNuevas.js`, o resolver nombres duplicados de medio de pago
   que informa `migrarCU04Ronda2.js`).
2. Corré `node scripts/verificarEsquemaActual.js` para ver qué quedó hecho.
3. Volvé a correr **el mismo script** con `--confirmar` y después los
   siguientes. Los pasos ya aplicados se saltean solos.

Casos en los que los scripts **abortan a propósito, sin modificar nada**, y
hay que revisar a mano:

- Un ENUM tiene un valor que el ENUM final no incluye (aplicarlo vaciaría
  esas filas).
- `producto.idTienda` existe pero con otro tipo o `NOT NULL`.

Si ya existe una FK equivalente de `producto.idTienda` hacia `tienda` con
otro nombre (por ejemplo, creada por `sync()`), el script la reconoce y no
crea una segunda.

### Opción B: volver al respaldo

1. Restaurá el respaldo:

   ```powershell
   $env:MYSQL_PWD = "<contraseña>"
   cmd /c "`"C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe`" -h localhost -u <usuario> petshop_db < respaldo-petshop_db.sql"
   $env:MYSQL_PWD = $null
   ```

   Se pasa por `cmd /c ... <` y no por una tubería de PowerShell, porque la
   tubería de PowerShell 5.1 recodifica el texto y puede estropear acentos.

2. **Importante (encontrado en el ensayo):** el respaldo solo recrea las
   tablas que existían al hacerlo. Las tablas que creó el paso 1
   **después** del respaldo siguen ahí. Para volver exactamente al estado
   anterior, hay que borrarlas. Son tablas nuevas y no tenían datos previos.

   **No copies una lista de otra base.** Cuáles son depende de qué tan vieja
   era la base: en una anterior a la Etapa 4 incluyen también
   `direccioncliente`, `favorito`, `aviso`, etc. Al terminar,
   `crearTablasNuevas.js --confirmar` imprime la sentencia exacta para tu
   base, por ejemplo:

   ```text
   Guardá esta salida. Solo si después volvés al respaldo, borrá estas tablas con:
     SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS tienda, solicitudvendedor; SET FOREIGN_KEY_CHECKS = 1;
   ```

   Usá **esa** sentencia, la que imprimió tu corrida. Si no la guardaste,
   compará `SHOW TABLES` con las tablas del archivo de respaldo
   (`CREATE TABLE`). Las que están en la base y no en el respaldo son las
   que hay que borrar.

3. Corré `node scripts/verificarEsquemaActual.js`: debe mostrar los mismos
   pendientes que antes de empezar.

## Qué se ensayó de verdad (en `petshop_test`, no en `petshop_db`)

Ensayo del 2026-09-27, con la base de pruebas llevada a propósito a un
estado anterior a las Etapas 7 y 8, con datos "históricos" (una cuenta
`vendedor`, un producto, una venta `enviada`):

1. `verificarEsquemaActual.js`: 5 pendientes (tablas `tienda` y
   `solicitudvendedor`, ENUM de `venta.estado`, ENUM de `usuario.rol`,
   `producto.idTienda` y su FK). Terminó con código 1.
2. Respaldo con `mysqldump`: 20 tablas, 5 filas.
3. Pasos 1 a 4 en orden: todos con código 0. `migrarCU04Ronda2.js` no
   cambió nada, porque esa parte ya estaba aplicada.
4. `verificarEsquemaActual.js`: todo `OK`, código 0. Datos intactos: la
   cuenta sigue `vendedor`, el producto con stock 7 e `idTienda` NULL, la
   venta sigue `enviada`.
5. Recuperación: se restauró el respaldo y se borraron las 2 tablas
   posteriores. El resultado fue idéntico, línea por línea, a la
   verificación del punto 1.
6. Fallo y reanudación: se corrió la Etapa 8 sin `tienda`. Quedó aplicado
   el paso 1 y falló el 2, con el mensaje nuevo. Se reanudó con
   `crearTablasNuevas.js` y la misma migración, y terminó todo `OK`.
7. Después: suite de integración completa, 147/147, sobre ese esquema.
8. Los comandos de PowerShell de esta guía se probaron tal cual contra
   `petshop_test`: `mysqldump --result-file` generó un archivo UTF-8 con las
   22 tablas, y la restauración con `cmd /c ... <` terminó con código 0 y
   el esquema al día. En el primer intento, `mysql -e "source <ruta>"`
   falló con esta ruta porque contenía `--`; por eso la guía usa `cmd /c`.

La salida completa de cada paso está en `EVIDENCIA-ensayo-actualizacion.txt`
del ZIP de entrega.

**Lo que NO se verificó:** el estado real de `petshop_db`. No se leyó ni se
modificó en esta ronda. Por eso el paso 0 es obligatorio: dice qué le
falta a esa base en concreto.
