# CU-04 — Registrar una compra, procesar un pago simulado y gestionar la venta

Caso de uso de Mauro Pérez (checkout, cálculo de la compra, pago simulado,
comprobante e integración del recorrido), implementado sobre la base
verificada `feature/backend-inicial` @ `ffd33b8`. Esta rama de trabajo es
`feature/cu04-checkout-pago-simulado`, sin commits.

Este documento cubre las CUATRO rondas de trabajo acumuladas en la rama. La
segunda ronda corrigió defectos reales encontrados por Mauro tras probar la
primera entrega a mano (recuperación tras perder la respuesta, medios de
pago deshabilitados, estados de correo poco honestos, histórico del
comprador, límite monetario del total, contrato transaccional de precios, y
el diseño del comprobante). La tercera ronda corrigió 5 pendientes que dejó
una revisión independiente sobre esa segunda ronda (idempotencia cuando
falla la escritura en `localStorage`, un diagnóstico equivocado sobre la
zona horaria de la conexión a la base, el límite de tiempo HTTP no
cubriendo la lectura del cuerpo, paginación del PDF, y dos números
incorrectos en el informe de cierre). La cuarta ronda, tras confirmar en la
venta #20 que el correo automático llega de verdad con SMTP real
configurado, adjuntó el mismo PDF del comprobante a ese envío y quitó el
enlace a `localhost` que llevaba, y restringió la cancelación directa de
una venta al personal — el cliente ahora **solicita** la cancelación de su
propia compra, y el personal la aprueba o la rechaza — el detalle de qué
cambió en cada ronda está en
[cu04-informe-cierre.md](cu04-informe-cierre.md).

No reemplaza ni cambia el comportamiento de:

- **Carga manual de venta por el personal** (`venta.service.js#registrarVenta`,
  `PanelNuevaVenta.jsx`, `POST /api/ventas`): sigue funcionando exactamente
  igual, sin pago simulado ni tarjeta ficticia.
- **Cancelación** (`cancelarVenta`): se extendió con un solo paso adicional
  (revertir el pago simulado si existe), sin tocar su lógica de stock ni de
  permisos.
- **Envío** (`marcarVentaComoEnviada`): sin cambios.
- **CRUD de `PromocionProducto`**: sin cambios; sus reglas de aplicación
  siguen sin confirmar (ver "Contrato de precios para José" más abajo).

## 1. Qué quedó funcionando

- Cotización server-side (`POST /api/compras/cotizacion`): nunca confía en
  el precio que el navegador dice tener.
- Confirmación de compra atómica e idempotente (`POST /api/compras`):
  revalida stock, precio y medio de pago dentro de la misma transacción, y
  solo si el pago simulado se aprueba registra venta, detalle histórico,
  descuento de stock, comprobante numerado y pago.
- Un pago simulado rechazado **nunca** crea una venta ni toca stock.
- Reintentar la misma compra (misma clave, mismo contenido) devuelve la
  misma venta, sin duplicar nada — incluso si se reintenta después de
  recargar la página o de perder la respuesta.
- Reintentar con la misma clave pero otro contenido (otro producto, otra
  entrega) se rechaza. Cambiar de tarjeta o de medio de pago bajo la misma
  clave **no** cuenta como "otro contenido" (ver sección 6).
- Dos confirmaciones simultáneas con la misma clave producen una sola
  venta (verificado con concurrencia real, no simulada).
- **Recuperación tras perder la respuesta** (`GET /api/compras/intentos/:clave`,
  ronda 2): si el navegador nunca recibió la respuesta de una compra que el
  servidor sí llegó a confirmar (o a rechazar), el checkout la encuentra al
  volver a la página, sin generar una segunda compra ni exigir repetir los
  datos de pago — ver sección 6.
- **Medios de pago deshabilitados** (ronda 2): una compra nueva con un medio
  de pago simulado deshabilitado se rechaza (409), sin crear nada; una
  compra ya aprobada sigue siendo recuperable aunque su medio se
  deshabilite después.
- Cancelar una compra confirmada revierte el pago simulado (estado
  `revertido_simulado`) y restituye el stock, en la misma transacción.
- Comprobante numerado (`PS-<año>-<idVenta con 6 dígitos>`), con un diseño
  propio (encabezado, datos del comprador, tabla de productos con
  descuento, total destacado — ver sección 8), descargable en PDF y
  enviado por correo con estados honestos sobre qué pasó realmente (ver
  sección 8), y reenvío manual con límite de intentos.
- El histórico de cada línea (nombre del producto, precio de lista,
  descuento, promoción aplicada) es inmutable: editar o borrar el producto
  o la promoción después no cambia un comprobante ya emitido. Desde la
  ronda 2, también es inmutable el **nombre/apellido/correo del comprador**
  (ver sección 7): editar el perfil del cliente después de comprar no
  cambia un comprobante ya emitido.
- **Límite monetario del total** (ronda 2): un total que superaría el
  máximo de la columna `DECIMAL(10,2)` se rechaza, tanto al cotizar como al
  confirmar, aunque cada línea individual sea válida por separado.

## 2. Archivos y decisiones principales

**Decisión central**: todo lo nuevo que había que persistir se modeló como
**tablas nuevas** (`pago`, `comprobante`, `detalleventapromocion`,
`intentocompra`), nunca como columnas agregadas a `venta`/`detalleventa`/
`mediopago`. Es el mismo criterio ya usado para `direccionEntrega` e
`imagenProducto`: `sequelize.sync()` crea tablas que faltan sin tocar las
existentes, así que **no hizo falta ningún `ALTER TABLE`** — ver sección 4.

Backend nuevo (ronda 1):

- `src/models/{pago,comprobante,detalleVentaPromocion,intentoCompra}.model.js`
- `src/services/precios/proveedorPrecioSinPromocion.service.js` — contrato
  de precios (ver sección 3).
- `src/services/cotizacion.service.js` — cotiza contra la base real, con o
  sin transacción/bloqueo según quién lo llame.
- `src/services/pagoSimulado.service.js` — transferencia (siempre
  aprobada) y débito (tarjetas de demostración fijas, ver sección 5).
- `src/services/compra.service.js` — `confirmarCompra`: la transacción
  atómica e idempotente (ver sección 6).
- `src/services/correo.service.js` — envío del comprobante (ver sección 8).
- `src/services/comprobantePdf.service.js` — PDF con `pdfkit`.
- `src/routes/compra.routes.js` (`POST /api/compras/cotizacion`,
  `POST /api/compras`) + dos rutas nuevas agregadas a `venta.routes.js`
  (`GET /:id/comprobante/pdf`, `POST /:id/comprobante/reenviar-correo`).

Backend nuevo (ronda 2):

- `src/services/precios/proveedorPrecioActual.js` — único punto de
  configuración del proveedor de precios activo (ver sección 3).
- `src/utils/formato.js` — formato de importe/fecha-hora en es-AR,
  compartido por el PDF y el correo.
- `src/utils/estadosLegibles.js` — traducción de estados internos
  (`aprobado_simulado`, etc.) a etiquetas legibles, compartida por PDF,
  correo y (su copia equivalente) la pantalla.
- `compra.controller.js#consultarIntentoPorClave` +
  `compra.service.js#consultarIntento` + ruta
  `GET /api/compras/intentos/:clave` — recuperación tras perder la
  respuesta (ver sección 6).
- `scripts/migracionCU04Ronda2.js` (lógica), `migrarCU04Ronda2.js`
  (script que corre Mauro contra su base real),
  `verificarMigracionCU04Ronda2.js` (verificación contra base descartable)
  — ver sección 4.
- `scripts/generarPdfsDeMuestra.js` — genera 4 PDF de ejemplo (simple, con
  descuento, cancelada, varias páginas) sin necesitar base de datos, para
  revisar el diseño del comprobante.

Backend modificado (ronda 1, con moderación):

- `venta.service.js`: `relacionesVenta` ahora incluye `pago`/`comprobante`/
  `detalleventapromocion` (todas `required: false`); `cancelarVenta`
  revierte el pago simulado si existe. `prepararEntrega`/`esPropiaOPersonal`
  se movieron (sin cambiar su lógica) a `ventaValidaciones.js` para que
  `compra.service.js` los reutilice sin duplicarlos.
- `scripts/sembrarDatosDemo.js` / `sembrarDatosE2E.js`: agregan las dos
  filas de `MedioPago` simuladas (`buscarOCrear`/upsert, no destructivo).

Backend modificado (ronda 2):

- `compra.service.js`: `resolverMedioPagoSimulado` (lock + `habilitado`,
  antes de cotizar — ver sección 5); instantánea del comprador al crear el
  `Comprobante` (ver sección 7); `cotizacionEstaDesactualizada` compara
  también `precioListaCentavos`/`montoDescuentoCentavos` por línea, no solo
  el precio final (ver sección 3).
- `cotizacion.service.js`: límite `MAXIMO_IMPORTE_CENTAVOS` sobre el total
  acumulado; `instanteEvaluacion` único por cotización, pasado junto con la
  `transaction` al proveedor de precios (ver sección 3).
- `correo.service.js`, `comprobantePdf.service.js`: reescritos — ver
  sección 8.
- `medioPago.model.js`: `nombre` ahora `unique: true` (lo necesita el lock
  de `resolverMedioPagoSimulado`).
- `comprobante.model.js`: `estadoCorreo` con el ENUM nuevo (ver sección 8);
  3 columnas nuevas de instantánea del comprador (ver sección 7).
- `venta.service.js#registrarVenta`: mismo lock sobre `MedioPago` que
  `compra.service.js`, por coherencia (la carga manual del personal ya
  comprobaba `habilitado`, ahora también lo bloquea).
- `config/database.js`: `timezone: '+00:00'` explícito (revertido en la
  ronda siguiente — ver sección 8, "fecha y hora": el valor `'-03:00'` de
  esta ronda partía de un diagnóstico equivocado sobre cómo Sequelize
  transmite esta opción a `mysql2`).
- `app.js`: `cors({ exposedHeaders: ['Content-Disposition'] })` — sin esto,
  el nombre de archivo del PDF nunca llegaba a leerse desde el frontend
  (ver sección 8).

Dependencias nuevas (ronda 1, ninguna más se agregó en la ronda 2):
`pdfkit` (PDF, sin dependencias nativas) y `nodemailer` (correo) —
necesidad concreta, no hay forma razonable de generar un PDF o mandar un
correo sin alguna librería.

Frontend nuevo (ronda 1):

- `src/api/compras.api.js`, `src/utils/claveIdempotencia.js` (persistencia
  del intento en curso, ver sección 6), `src/utils/tarjetasSimuladas.js`.

Frontend nuevo (ronda 2):

- `src/utils/estadosLegibles.js` — copia equivalente de la del backend,
  usada en `VentaDetalle.jsx`.

Frontend modificado (ronda 1):

- `Checkout.jsx`: reescrito para el nuevo flujo (cotización real, elegir
  transferencia/débito simulados, reconfirmar si cambió la cotización).
- `VentaDetalle.jsx` (ya es "Mis compras" y el panel): agrega comprobante,
  estado del pago, descarga de PDF, reenvío de correo y el desglose de
  promoción por línea, todo condicional a que exista (una venta manual del
  personal se sigue viendo exactamente igual que antes).
- `httpClient.js`: los errores ahora llevan el cuerpo JSON completo
  (`error.datos`), no solo el mensaje — necesario para que el checkout lea
  `codigo`/`cotizacionVigente` de un 409; se agregó `solicitarBinario` para
  la descarga del PDF (no es JSON).

Frontend modificado (ronda 2):

- `Checkout.jsx`: recuperación de un intento en curso al montar (ver
  sección 6); la entrega (método/dirección) se prellena desde lo guardado,
  no se resetea a los valores por defecto.
- `claveIdempotencia.js`: reescrito — el intento guardado ahora se asocia a
  `idCliente` (no se mezcla entre cuentas del mismo navegador), incluye la
  entrega elegida, y usa una cadena de respaldo `localStorage` →
  `sessionStorage` → memoria si el nivel anterior no está disponible (ver
  sección 6).
- `VentaDetalle.jsx`: etiquetas legibles de estado (pago, correo); el
  nombre del comprador que se muestra usa la instantánea histórica cuando
  existe, igual que el PDF/correo.
- `httpClient.js`: límite de tiempo de 15s por pedido (`AbortController`) —
  antes, una conexión colgada podía dejar una pantalla (p. ej. la
  recuperación del checkout) esperando indefinidamente sin ningún mensaje.
  Corregido en la ronda siguiente (revisión independiente): el límite
  original solo cubría hasta recibir los ENCABEZADOS de la respuesta — un
  cuerpo que quedaba a mitad de camino después de eso (encabezados sí
  llegaron, el cuerpo nunca terminaba) no tenía ningún límite. Ahora el
  mismo `AbortController` cubre el pedido Y la lectura completa del
  cuerpo (`solicitar()`/`solicitarBinario()` no limpian el timeout hasta
  que el cuerpo terminó de leerse o falló); un abort durante la lectura del
  cuerpo se reporta igual que cualquier otro fallo de conexión recuperable.

## 3. Contrato de precios para José

`obtenerPrecioVigente(producto, contexto)` (async), en
`backend/src/services/precios/proveedorPrecioSinPromocion.service.js`,
recibe:

- `producto`: una instancia de `Producto` ya leída (y bloqueada, si
  corresponde) de la base.
- `contexto`: `{ transaction, instanteEvaluacion }` (agregado en la ronda 2
  — ver más abajo).

Y devuelve el precio vigente de **una unidad**, en **centavos enteros**:

```js
// Sin promoción (implementación actual, por defecto):
{
  precioListaCentavos: 1000000,   // $10.000,00
  idPromocionProducto: null,
  porcentajeDescuento: 0,
  montoDescuentoCentavos: 0,
  precioFinalCentavos: 1000000,
}

// Con promoción (forma que debería devolver tu implementación):
{
  precioListaCentavos: 1000000,   // $10.000,00
  idPromocionProducto: 7,
  porcentajeDescuento: 20,
  montoDescuentoCentavos: 200000, // $2.000,00
  precioFinalCentavos: 800000,    // $8.000,00
}
```

Reglas del contrato (no negociables desde el lado de la compra, validadas
en tiempo de ejecución por `cotizacion.service.js#validarPrecioVigente` —
un proveedor que las viola responde 500, no se deja pasar):

- Todo en **centavos enteros** (`Math.round(pesos * 100)`, ver
  `utils/validacion.js#pesosACentavos`) — nunca coma flotante en pesos.
- `precioFinalCentavos = precioListaCentavos - montoDescuentoCentavos`,
  siempre.
- Sin promoción vigente, `porcentajeDescuento`/`montoDescuentoCentavos` son
  `0` y `idPromocionProducto` es `null` — nunca se infiere una promoción
  "parcial" ni se acumula nada por defecto.
- Importes dentro del rango persistible (`DECIMAL(10,2)`); `porcentajeDescuento`
  finito y no negativo; `idPromocionProducto` un entero positivo válido o
  `null` — nunca un valor "casi cero" o negativo por redondeo.

**El segundo parámetro, `contexto` (ronda 2)**:

- `transaction`: la transacción activa de Sequelize cuando `cotizar()` se
  llama DENTRO de una confirmación de compra (con lock sobre los
  productos); `undefined` cuando es solo una cotización de lectura (el
  endpoint `POST /api/compras/cotizacion`, antes de que el cliente
  confirme nada). Úsala para leer o bloquear tus propias tablas de
  promoción de forma coherente con el resto de la operación (mismo
  criterio que ya usa `Producto` — bloqueo de fila dentro de la misma
  transacción).
- `instanteEvaluacion`: un `Date`, calculado **una sola vez** por llamada a
  `cotizar()` y reutilizado igual para todas las líneas de esa misma
  cotización/confirmación — así, si tu regla de vigencia depende de
  "ahora" (`fechaInicio <= ahora <= fechaFin`), todas las líneas de una
  misma operación se evalúan con el mismo "ahora", en vez de que el
  resultado dependa del orden en que se procesó cada producto.

**Punto único de configuración**: `cotizacion.service.js` importa el
proveedor activo desde `precios/proveedorPrecioActual.js` — hoy ese
archivo re-exporta el proveedor sin promoción; para enchufar tu
implementación real, editá ESE archivo (una sola línea), sin tocar
`cotizacion.service.js` ni `compra.service.js`. El mismo archivo alimenta
tanto la cotización de solo lectura como la confirmación — no hay dos
puntos de configuración por separado. Las pruebas de integración inyectan
un tercer proveedor, controlado, vía el parámetro `proveedorPrecios` (ver
`test-integracion/proveedorPrecioDePrueba.js`), sin tocar el archivo de
configuración.

**No se implementaron reglas de superposición/acumulación de
promociones** — siguen sin confirmar (ver `promocionProducto.model.js`) —
por eso el proveedor por defecto no aplica ninguna promoción real todavía,
aunque el resto del circuito (cotizar, comparar contra lo aceptado,
aplicar el descuento, guardarlo como histórico) ya está probado de punta a
punta con un proveedor de prueba controlado, incluida la propagación
correcta de `transaction`/`instanteEvaluacion` (ver
`test-integracion/compra.integracion.js`, "el proveedor de precios recibe
la transacción activa y el MISMO instante de evaluación").

**No interpretamos el campo `PromocionProducto.descuento` como
porcentaje automáticamente** — mantiene la reserva ya documentada en
`promocionProducto.model.js`.

**Reconfirmación por cambio de desglose (ronda 2)**: la comparación contra
la cotización aceptada (`compra.service.js#cotizacionEstaDesactualizada`)
mira `precioListaCentavos`, `montoDescuentoCentavos`, `precioFinalCentavos`
e `idPromocionProducto` de cada línea — si tu proveedor cambia CUALQUIERA
de esos valores (por ejemplo, sube el precio de lista y sube el descuento
en la misma proporción, dejando el precio final igual), igual se exige
reconfirmar: lo que el cliente aceptó es el desglose completo, no solo el
número final.

## 4. Base de datos: instalación nueva y actualización preservando datos

**Ronda 1** no necesitó ningún `ALTER TABLE`: las cuatro tablas nuevas
(`pago`, `comprobante`, `detalleventapromocion`, `intentocompra`) son eso,
tablas nuevas — el mismo `sequelize.sync()` que ya corre en cada arranque
de `server.js` las crea sin tocar ninguna tabla existente (mismo mecanismo
que ya usa `direccionEntrega`/`imagenProducto`, ver
[backend-base-de-datos.md](backend-base-de-datos.md)).

**Ronda 2 SÍ necesita una migración explícita**: a diferencia de la ronda
1, estos cambios ALTERAN tablas que ya existen en tu base (creadas por la
ronda 1) — `sync()` nunca hace eso, así que sin este paso tu backend
arrancaría contra un esquema desactualizado. Tres cambios, todos
idempotentes (podés correr el script más de una vez sin romper nada):

1. Índice único sobre `mediopago.nombre` (lo necesita el lock de
   `compra.service.js#resolverMedioPagoSimulado`).
2. `comprobante.estadoCorreo`: ENUM ampliado con los nuevos estados
   (`simulado`, `no_configurado`, `aceptado` — ver sección 8), migrando
   cualquier `'enviado'` previo a `'simulado'` (en este proyecto nunca hubo
   SMTP real configurado hasta ahora, así que esa suposición es segura —
   se documenta acá porque no se puede derivar de los datos mismos).
3. Tres columnas nuevas, NULLABLES, en `comprobante`
   (`nombreCompradorHistorico`, `apellidoCompradorHistorico`,
   `correoCompradorHistorico` — ver sección 7). `NULL` en comprobantes ya
   emitidos: no se inventa un valor histórico que nunca se guardó.

**Instrucciones exactas para actualizar tu entorno, preservando datos**:

```bash
cd backend
# 1. Traer este código (esta rama, sin commit todavía — copiar los
#    archivos, o hacer git fetch/checkout cuando corresponda).
npm install                          # pdfkit y nodemailer (sin cambios desde la ronda 1)

# 2. Migración de la ronda 2 — CON el backend DETENIDO, contra tu base real
#    (petshop_db, con las credenciales de tu .env de siempre):
node scripts/migrarCU04Ronda2.js               # dry-run: solo informa, no cambia nada
node scripts/migrarCU04Ronda2.js --confirmar    # aplica los 3 cambios de arriba

# 3. Reiniciar normalmente: sync() no tiene ninguna tabla nueva que crear
#    esta ronda (todos los cambios de arriba son ALTER, no tablas nuevas).
npm run dev
npm run sembrar:demo   # upsert no destructivo, sin cambios desde la ronda 1
```

Nada de esto se ejecutó contra `petshop_db` durante este trabajo (regla
explícita del pedido). Se verificó, en cambio, contra `petshop_test` (base
descartable), con DOS scripts complementarios:

```
# Ronda 1: instalación nueva + actualización sin las 4 tablas de CU-04
DOTENV_CONFIG_PATH=.env.test node scripts/verificarMigracionCU04.js
--- Paso 1: instalación NUEVA (esquema completo desde cero) ---
OK: las 16 tablas existen, incluidas las 4 nuevas de CU-04.
--- Paso 2: actualización de un esquema PREVIO (con datos ya cargados) ---
OK: las 4 tablas de CU-04 se crearon, y la venta/producto cargados ANTES de sync() siguen intactos.

# Ronda 2: actualización del esquema QUE YA TENÍA las 4 tablas de CU-04
# (primera entrega), con datos, al esquema final de esta ronda
DOTENV_CONFIG_PATH=.env.test node scripts/verificarMigracionCU04Ronda2.js
--- Preparando esquema PREVIO (primera entrega de CU-04), con datos ---
Datos previos cargados: venta #1, comprobante 'enviado'.
--- Aplicando la migración (primera vez) ---
OK: ENUM final, dato migrado (enviado→simulado), comprobante previo intacto,
    columnas de instantánea NULL (no inventadas), índice único creado.
--- Aplicando la migración de nuevo (debe ser un no-op seguro: idempotencia) ---
OK: ENUM final, dato migrado (enviado→simulado), comprobante previo intacto,
    columnas de instantánea NULL (no inventadas), índice único creado.
```

Ambos scripts reutilizan los mismos resguardos de nombre de base que
`test-integracion/` (comparación exacta de `DB_NAME`, habilitación
explícita), nunca corren contra `petshop_db`.

**Nota sobre el índice único de `mediopago.nombre`**: si en tu base real
ya existieran dos medios de pago con el mismo nombre (no debería, pero el
esquema anterior no lo impedía), el script se detiene con un error
explícito listando los nombres duplicados, sin aplicar nada — hay que
resolver ese duplicado a mano (decidir cuál fila conservar) antes de
reintentar.

**Rondas 3 y 4: sin migración nueva**. La ronda 3 no tocó el esquema. La
ronda 4 agrega una tabla nueva, `solicitudcancelacion` (1 a N con `venta`,
para la solicitud de cancelación del cliente — ver sección 7) — igual que
las cuatro tablas de la ronda 1, `sync()` la crea sola en el próximo
arranque, sin ningún `ALTER TABLE` ni script de migración: no altera
ninguna columna ni tabla existente, así que Mauro no necesita ejecutar nada
manual para esta ronda, más allá del `git pull`/copia de archivos y
reiniciar el backend normalmente.

## 5. Pago simulado

**Transferencia simulada**: siempre se aprueba (`aprobado_simulado`); no
pide ningún dato adicional. No es una pasarela real: es, literalmente, "se
considera transferido".

**Débito simulado**: tarjetas de demostración fijas y deterministas (ver
`backend/src/services/pagoSimulado.service.js`, espejadas para la interfaz
en `frontend/src/utils/tarjetasSimuladas.js`):

| Número | Resultado |
|---|---|
| `4000000000000002` | Aprobada |
| `4000000000000010` | Rechazada (banco, simulado) |
| `4000000000000028` | Rechazada (fondos insuficientes, simulado) |
| Cualquier otro número de 16 dígitos | Rechazada ("tarjeta no reconocida"), aunque el formato sea válido |

Formato validado en frontend (UX) **y** backend (fuente de verdad):
16 dígitos, vencimiento `MM/AA` no vencido, código de seguridad de 3-4
dígitos, titular no vacío. **Nunca se persiste el número completo ni el
código de seguridad** — ni en la base (`pago.ultimosCuatroDigitos` es lo
único que se guarda), ni en logs, ni en el hash de idempotencia (ver
sección 6), ni en `localStorage` del navegador.

Compatibilidad con ventas anteriores: una venta sin fila en `pago` (previa
a esta etapa, o cargada manualmente por el personal) **nunca** se muestra
como si tuviera un pago simulado aprobado — `VentaDetalle.jsx` y el PDF
condicionan explícitamente a que la fila exista.

**Medios de pago deshabilitados (ronda 2)**: `compra.service.js#resolverMedioPagoSimulado`
lee el `MedioPago` correspondiente con `SELECT ... FOR UPDATE` (dentro de
la transacción, antes de cotizar — mismo orden de locks documentado abajo)
y comprueba `habilitado`. Si no existe o está deshabilitado → 409, sin
crear venta, pago, comprobante ni descontar stock. El mismo lock se agregó
a `venta.service.js#registrarVenta` (carga manual del personal), por
coherencia. Una compra YA aprobada nunca vuelve a mirar esto: sigue siendo
recuperable (ver más abajo) aunque su medio de pago se deshabilite
después. El sembrado (`buscarOCrear`) nunca reactiva un medio ya
deshabilitado: solo fija `habilitado` al CREAR la fila, nunca al
encontrarla ya existente.

## 6. Idempotencia y recuperación tras perder la respuesta

Clave: `claveIdempotencia` (string, generada por el frontend con
`crypto.randomUUID()`, asociada al `idCliente` de la sesión y a una
"firma" del carrito — ver `frontend/src/utils/claveIdempotencia.js`).

**Persistencia del lado del navegador (ronda 2, lectura corregida en la
ronda siguiente)**: tres niveles, de mejor a peor:

1. `localStorage` — sobrevive recargas y cerrar/reabrir el navegador.
2. `sessionStorage` — sobrevive una recarga de la misma pestaña (alcanza
   para el caso que importa: perder la respuesta y recargar); útil cuando
   un navegador bloquea `localStorage` pero no `sessionStorage`.
3. Memoria (variable de módulo) — cobertura mínima, solo dentro de la
   misma carga de página, si ningún almacenamiento del navegador funciona.

Al **escribir**, se intenta cada nivel en orden y se usa el primero que
funciona; cada vez que un nivel superior escribe con éxito, se limpia
cualquier copia vieja que hubiera quedado en el nivel inferior (evita que
una escritura ANTERIOR, que tuvo que caer a `sessionStorage` por una falla
transitoria de `localStorage`, quede dando vueltas después de que
`localStorage` volvió a funcionar). `limpiarClave()` también limpia los
tres niveles siempre.

Al **leer** (defecto real corregido, revisión independiente: la versión
original de esta ronda solo bajaba de nivel si el anterior LANZABA, nunca
si respondía "vacío" — pero `localStorage.setItem` fallando con
`localStorage.getItem` funcionando es exactamente el caso de
`QuotaExceededError`, el más común en la práctica, y en ese caso
`localStorage.getItem` para esta clave siempre da `null`, nunca lanza, así
que la versión original nunca llegaba a mirar `sessionStorage` — dos
llamadas seguidas a `obtenerOCrearClave()` con el mismo carrito generaban
dos claves DISTINTAS, perdiendo la idempotencia justo cuando más hacía
falta): ahora se baja de nivel tanto si el nivel lanza como si responde
"vacío". Esto no resucita un intento viejo ya resuelto porque, por la
limpieza en la escritura descrita arriba, un nivel inferior solo tiene
contenido cuando es la única copia vigente — nunca una copia vieja
conviviendo con una más nueva en un nivel superior.

Esa limpieza en la escritura tuvo, a su vez, un defecto real propio
(encontrado por Codex en la revisión de esta misma corrección): al
principio solo limpiaba el nivel INFERIOR cuando un nivel superior ganaba
la escritura, no al revés. Si `localStorage` ya tenía guardado un intento
de un carrito ANTERIOR (a propósito no limpiado — p. ej. tras una
cotización desactualizada, que espera un reintento con la misma clave) y
DESPUÉS `localStorage.setItem` empezaba a fallar para un carrito NUEVO,
`guardar()` caía a `sessionStorage` con el intento nuevo, pero el resto
viejo seguía en `localStorage` — no vacío, así que `leerGuardado()` lo
devolvía como vigente, tapando el intento nuevo. `obtenerIntentoGuardado()`
igual lo descartaba (la firma del carrito no coincide), así que nunca
mezcló compras de carritos distintos, pero si la página se recargaba antes
de resolver el intento nuevo, ese intento (el que sí importaba) nunca
llegaba a mirarse. Corregido: cada escritura exitosa limpia TODOS los
demás niveles (no solo los inferiores) con `removeItem`, que no necesita
espacio libre y por eso normalmente funciona incluso en el mismo nivel
cuyo `setItem` acaba de fallar por cuota. Ver
`frontend/src/utils/claveIdempotencia.js` y sus pruebas dedicadas
(`claveIdempotencia.test.js`) para el detalle y la reproducción exacta de
los dos defectos.

Junto con la clave se guarda la **entrega elegida** (método + dirección,
NUNCA datos de pago): si hace falta reconstruir el formulario tras una
recarga, se prellena con la misma entrega, en vez de resetear a "retiro en
sucursal" por defecto — evita que un reintento legítimo choque con
"contenido distinto" solo porque el formulario volvió a sus valores
iniciales.

Cuándo se conserva o se renueva la clave:

- **Se conserva** mientras el carrito no cambie: recargar la página, o
  reintentar tras perder la respuesta, reutiliza la misma clave.
- **Se conserva** tras un 409 "cotización desactualizada": el backend
  revierte todo el intento (ver más abajo), así que la clave sigue libre
  para reintentar con la cotización nueva.
- **Se renueva** si cambia el contenido del carrito (otra firma).
- **Se renueva** explícitamente tras un rechazo simulado (402) recibido
  normalmente, o al elegir "Iniciar un nuevo intento" tras recuperar un
  rechazo que se había perdido (ver más abajo) — nunca automáticamente: un
  rechazo es un resultado final para esa clave, no algo para reintentar
  con otro contenido sin que la persona lo pida.

**Recuperación tras perder la respuesta (ronda 2)**: antes de exigir una
cotización nueva, si hay un intento guardado para el usuario y el carrito
actuales, el checkout consulta `GET /api/compras/intentos/:clave`
(`compra.service.js#consultarIntento` — autenticado, rol cliente,
`idCliente` **siempre** de la sesión, nunca de la URL: un cliente no puede
consultar el intento de otro). Es una lectura pura, SIN transacción ni
lock — **nunca reemplaza** el camino atómico de `confirmarCompra`, descrito
abajo; una confirmación real siempre vuelve a pasar por el patrón
INSERT...ON DUPLICATE KEY + SELECT...FOR UPDATE, nunca se salta ese camino
solo porque esta consulta no encontró nada.

- `aprobado` → se navega directo al comprobante, sin volver a cotizar ni
  pedir datos de pago (aunque el stock haya llegado a cero mientras
  tanto: la compra ya existe).
- `rechazado` → se muestra el motivo y un botón explícito "Iniciar un
  nuevo intento" (nunca automático).
- `procesando`, o no encontrado — **resultado ambiguo, nunca se interpreta
  como "no hay ningún conflicto posible"**: puede significar que el
  intento nunca existió, que se revirtió, o (en teoría) que la transacción
  que lo creó todavía no comiteó. Se sigue el flujo normal (cotizar, etc.)
  **reutilizando la misma clave guardada**, nunca generando una nueva a
  ciegas.

Mecanismo en el backend (`compra.service.js#confirmarCompra`, dentro de una
única transacción, orden de locks fijo — intento → medio de pago →
productos — para que ninguna transacción concurrente pueda esperarse en un
ciclo):

1. `INSERT ... ON DUPLICATE KEY UPDATE` (no-op) sobre `intentocompra`
   (clave única compuesta `claveIdempotencia` + `idCliente`), seguido de
   `SELECT ... FOR UPDATE` sobre esa misma fila. En InnoDB esto hace que
   una segunda solicitud concurrente con la misma clave **espere** a que
   esta transacción termine (commit o rollback) antes de poder leer nada
   — verificado con dos confirmaciones simultáneas reales (no simuladas),
   que terminan en una sola venta.
2. Si el hash de contenido no coincide con el guardado → 409 (clave usada
   con contenido distinto), sin tocar lo que ya existía.
3. Si el intento ya estaba resuelto (aprobado/rechazado) → se devuelve el
   mismo resultado, sin volver a mirar el medio de pago, sin reprocesar
   pago ni stock.
4. Si es un intento nuevo: se procesa el pago simulado, se resuelve y
   valida el medio de pago (ver sección 5), se cotiza de nuevo (con lock),
   y se compara contra la cotización aceptada; si difiere o venció (10
   minutos), se lanza un error que revierte TODA la transacción (incluido
   el insert del intento) — la clave queda libre. Si coincide, según el
   resultado del pago se registra el rechazo o se confirma la venta
   completa.

**Importante (corrección de una revisión independiente, ronda 2)**: el
pago se valida/procesa DENTRO de la transacción, y SOLO en la rama de un
intento nuevo (punto 4) — nunca antes de comprobar en el punto 3 si el
intento ya está resuelto. Si se validara antes, un reintento con el
formulario de pago reiniciado (típico tras recargar la página) con datos
de tarjeta incompletos o inválidos fallaría con 400 antes de siquiera
llegar a mirar la idempotencia, aunque la compra ya estuviera confirmada
de verdad — bloqueando exactamente la recuperación que esto existe para
resolver.

`hashContenido` (SHA-256) incluye **solo** productos+cantidades y entrega
— **nunca ningún dato de pago** (ni el tipo, ni el medio, ni el número de
tarjeta): cambiar de tarjeta o de medio de pago bajo la misma clave NO
cuenta como "contenido distinto" a propósito, para que reintentar con el
formulario de pago reiniciado (recargar la página) encuentre el intento ya
resuelto en vez de un falso "contenido distinto".

Errores de contención real de MySQL (deadlock / espera de lock agotada) se
traducen a un 409 explícitamente reintentable, no a un 500 genérico.

## 7. Histórico y cancelación

Cada línea de venta con promoción persiste, en `detalleventapromocion`:
nombre del producto al momento de comprar, precio de lista, porcentaje y
monto de descuento, y la referencia a la promoción — todos son valores ya
calculados, no una relectura en vivo, así que editar o borrar el producto
o la promoción después no cambia el comprobante ya emitido (verificado con
una prueba de integración real: se compra, se edita el producto, se
confirma que el detalle no cambió).

Cancelar una compra confirmada revierte el pago simulado a
`revertido_simulado` y restituye el stock, en la misma transacción — no se
amplió el flujo logístico más allá de lo que ya existía (`registrada` →
`cancelada`/`enviada`); los puntos de integración con el caso de uso de
Oriana (estado del pedido) no cambiaron.

**Cancelación restringida al personal + solicitud del cliente (ronda 4)**:
corrección real, tras la venta #20 — el cliente ya NO puede cancelar
directamente (`PATCH /api/ventas/:id/cancelar` ahora exige
`vendedor`/`administrador`, tanto en la ruta como en el servicio,
defensa en profundidad); en su lugar, "Solicitar cancelación"
(`POST /api/solicitudes-cancelacion`, exclusiva de `cliente`, sobre su
PROPIA venta) deja registrada la intención en una tabla nueva
(`solicitudcancelacion`, 1 a N con `Venta`) **sin tocar la venta, el pago
ni el stock**. El personal ve la solicitud pendiente (en el detalle de la
venta y con un aviso en el listado) y la aprueba o la rechaza
(`PATCH /api/solicitudes-cancelacion/:id/aprobar`/`/rechazar`):

- **Aprobar** reutiliza EXACTAMENTE la misma lógica transaccional que la
  cancelación directa (`venta.service.js#ejecutarCancelacionTransaccional`,
  factorizada aparte para esto — nunca dos implementaciones que puedan
  divergir), con la misma confirmación explícita en la pantalla que
  cancelar directamente (es igual de irreversible).
- **Rechazar** solo cambia el estado de la solicitud (con un motivo
  opcional, que el cliente ve); la venta sigue `registrada`, sin ningún
  otro efecto — sin confirmación, porque no es destructivo.
- **Sin duplicados**: una segunda solicitud mientras hay una `pendiente`
  para la misma venta se rechaza (409).
- **Sin decisiones repetidas**: una solicitud ya resuelta (aprobada o
  rechazada) nunca vuelve a decidirse (409).
- **Carreras con una cancelación/envío directo del personal**: la
  solicitud y la cancelación directa bloquean la MISMA fila de `Venta`
  (mismo punto de serialización que ya usaban cancelar/marcar como
  enviada), así que quedan serializadas entre sí; si el personal ya
  canceló (o envió) la venta directamente mientras la solicitud seguía
  pendiente, **aprobarla** después responde 409 explícito, sin restituir
  stock una segunda vez. Corrección real, sobre un hallazgo de una revisión
  independiente sobre esta misma corrección: la primera versión dejaba esa
  solicitud `pendiente` PARA SIEMPRE en ese caso (un estado de negocio
  confuso, aunque nunca duplicara stock ni pago) — ahora,
  `cancelarVenta`/`marcarVentaComoEnviada` cierran solas, en la MISMA
  transacción que cambia la venta, cualquier solicitud que hubiera quedado
  pendiente para esa venta: `'aprobada'` si terminó `cancelada` (el
  resultado que el cliente pedía SÍ ocurrió, solo que por la vía directa
  del personal) o `'rechazada'`, con un motivo explicativo, si se marcó
  `enviada` (ya no se puede cancelar) — nunca queda una solicitud sin
  resolver por una carrera de este tipo. Verificado con contención real
  (dos aprobaciones concurrentes de la misma solicitud; una solicitud y una
  cancelación directa simultáneas, confirmando al final que ninguna
  solicitud queda `pendiente`), no solo con `Promise.all` sin evidencia de
  que efectivamente compitieron.
- **Corrección adicional (post-entrega, ronda 4)**: el chequeo de permisos
  dentro del servicio (`cancelarVenta`) originalmente solo bloqueaba un rol
  `'cliente'` explícito, dejando pasar sin querer un `usuario` ausente
  (`undefined`) o cualquier rol desconocido, si algún llamador interno se
  saltara la ruta. Se cambió a una lista explícita de roles permitidos
  (`usuario?.rol !== 'vendedor' && usuario?.rol !== 'administrador'` →
  403), el mismo criterio que ya usaba `resolverSolicitudCancelacion`. Se
  agregaron 3 pruebas unitarias directas al servicio
  (`ventaCancelacionPermisos.test.js`: cliente, rol desconocido, sin
  usuario) y se actualizó `ventaConcurrencia.integracion.js` (pasaba
  `cancelarVenta` sin usuario en varias pruebas; ahora pasa un `vendedor`
  válido). Confirmado con Codex que el único llamador de producción
  (`venta.controller.js`) siempre pasa `req.usuario`, y que
  `solicitudCancelacion.service.js` no depende de `cancelarVenta` (reutiliza
  `ejecutarCancelacionTransaccional` con su propio guard de staff) — sin
  hallazgos adicionales.
- **No es una devolución**: una devolución de un pedido ya `enviada` (el
  cliente ya recibió el producto) es un flujo distinto y posterior, todavía
  sin implementar — no se agregó ningún botón ni ruta que sugiera que ya
  existe; "Solicitar cancelación" solo aparece mientras la venta sigue
  `registrada`.

**Instantánea histórica del comprador (ronda 2)**: `Comprobante.create`
(dentro de la misma transacción que confirma la venta) guarda
`nombreCompradorHistorico`/`apellidoCompradorHistorico`/`correoCompradorHistorico`,
tomados del `Cliente` ya leído en ese momento. El PDF, el correo y la
pantalla de detalle usan esta instantánea con prioridad; si es `NULL`
(comprobantes emitidos antes de esta corrección), usan el dato ACTUAL del
cliente como respaldo, marcado explícitamente como tal en el PDF ("dato
actual, no necesariamente el original"; ver sección 8) — nunca se
reconstruye ni se presenta un valor histórico que nunca se guardó.
Reenviar el correo siempre usa el correo histórico (o el actual, como
respaldo, para comprobantes viejos) — nunca una dirección arbitraria
mandada en la solicitud de reenvío, que no acepta ese campo.

La entrega (método/dirección) YA era histórica desde la ronda 1: se
persiste en su propia fila al crear la venta y nunca se vuelve a tocar, así
que no necesitó ningún cambio acá.

## 8. Comprobante, correo y PDF

Número: `PS-<año>-<idVenta con 6 dígitos>` (p. ej. `PS-2026-000015`) —
derivado de `idVenta` (ya único por ser clave primaria autoincremental), sin
necesitar ningún contador ni manejo de colisión aparte.

### Correo (`backend/src/services/correo.service.js`, reescrito en la ronda 2)

- Se envía **después** del commit de la venta — una falla de correo nunca
  revierte una compra ya confirmada. Nunca se reenvía automáticamente al
  recuperar una compra idempotente (solo en la confirmación original).
- Transporte por variables de entorno (`SMTP_HOST`/`SMTP_PORT`/
  `SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`/`CORREO_REMITENTE`, ver
  `.env.example`).
- **Estados honestos** en `comprobante.estadoCorreo` (ronda 2 — antes,
  tanto un envío real como uno simulado se guardaban igual como
  `'enviado'`, algo incorrecto para quien lee la pantalla):
  - `pendiente` — recién creado, todavía no se intentó enviar.
  - `simulado` — `CORREO_TRANSPORTE=prueba` explícito (usado por
    `.env.test`/`.env.e2e`: nunca hay un intento de envío real; así corren
    todas las suites automatizadas, sin mandar correos de verdad).
  - `no_configurado` — no hay `SMTP_HOST` y tampoco se pidió modo de
    prueba: el servicio de correo no está habilitado en este entorno (p.
    ej. desarrollo local recién clonado, sin `.env` completo).
  - `aceptado` — un servidor SMTP real aceptó el mensaje (no garantiza que
    llegó a la casilla del destinatario — eso esta capa no puede saberlo).
  - `fallido` — error de envío, tiempo de espera agotado (8s), o rechazo
    explícito del destinatario por el servidor SMTP.
  - `no_aplica` — el cliente no tiene correo electrónico cargado.
- El mensaje incluye el estado ACTUAL del pedido y del pago (no solo al
  confirmar): un reenvío después de cancelar la venta dice explícitamente
  que está cancelada, no "tu compra fue confirmada" sin más.
- El destinatario y el nombre usados son siempre la instantánea histórica
  del comprador (ver sección 7) — nunca el correo/nombre ACTUAL del
  cliente, que podría haber cambiado entre el commit y el envío (o en un
  reenvío mucho después).
- Reenvío manual (`POST /api/ventas/:id/comprobante/reenviar-correo`),
  protegido por la misma autorización que ver la venta, con límite de 5
  por hora por (usuario, venta).
- **PDF adjunto (ronda 4)**: el correo automático de la confirmación (y
  cualquier reenvío manual) adjunta el MISMO PDF que genera
  `comprobantePdf.service.js` para la descarga manual — se llama a
  `generarPdfComprobante(venta)` desde `correo.service.js` antes de armar el
  mensaje, nunca un diseño separado. Si la generación del PDF falla (datos
  inconsistentes, por ejemplo), se trata igual que cualquier otro fallo de
  envío: `estadoCorreo` queda `'fallido'`, sin un correo a medias ni volver
  a tocar la venta ya confirmada.
- **Sin enlaces a `localhost` (ronda 4)**: el mensaje incluía antes un
  enlace armado con `FRONTEND_URL` — la misma variable que usa CORS (ver
  `app.js`), que en desarrollo/pruebas SIEMPRE apunta a `localhost`, algo
  que nadie fuera de esta máquina podría abrir. Se agregó una variable
  NUEVA y separada, `URL_PUBLICA_FRONTEND` (vacía por defecto): sin
  configurarla, el correo simplemente omite el enlace — el resumen (número,
  fecha, total, estado del pedido y del pago) más el PDF adjunto ya
  alcanzan por sí solos para que el mensaje sea útil. Se valida además que
  la URL configurada no sea, ella misma, un `localhost`/`127.0.0.1`/`::1`
  (red de seguridad extra ante una variable mal cargada).
- **Entrega real de correo, CONFIRMADA (ronda 4)**: Mauro probó
  manualmente la venta #20 con credenciales SMTP reales configuradas — el
  servidor acepta el mensaje y efectivamente llega al cliente. Antes de
  esta ronda, sin esas credenciales, la entrega real quedaba documentada
  como pendiente de verificar (nunca declarada probada sin haberlo estado);
  ahora sí hay una confirmación manual real, aunque sigue siendo una
  prueba manual puntual, no parte de la suite automatizada (que sigue
  usando el transporte de prueba a propósito — "no envíen correos reales
  durante las pruebas"). Para habilitar el envío real en desarrollo local:
  completar `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD` en
  `backend/.env` (dejando `CORREO_TRANSPORTE` vacío) con las credenciales
  de un proveedor SMTP real (no se incluyen ni se inventan acá), confirmar
  una compra en desarrollo (`npm run dev` + `npm run sembrar:demo`) y,
  opcionalmente, completar `URL_PUBLICA_FRONTEND` si el frontend está
  desplegado en una URL pública real.

### Diseño del comprobante (PDF, `comprobantePdf.service.js`, rediseñado en la ronda 2)

`GET /api/ventas/:id/comprobante/pdf` (`pdfkit`), protegido por la misma
autorización que ver la venta ("propia o personal"). Mismos datos
históricos que se muestran en pantalla (venta ya cargada con sus
relaciones) — nada vuelve a consultar producto/promoción/cliente vigentes,
así que editarlos después no cambia un PDF ya generado.

- Encabezado: "PetShop" en el verde de marca existente
  (`--color-marca: #0ca678`, mismo color que ya usa el resto de la
  aplicación — no se inventó una identidad visual nueva), con el número de
  comprobante y la fecha.
- Datos del comprador (instantánea histórica, con nota "dato actual" si es
  un comprobante anterior a esa instantánea) y de la entrega.
- Tabla: cantidad, descripción, precio unitario de **lista**, descuento y
  subtotal **final** — con el encabezado de la tabla repetido en cada
  página nueva, y cada fila calculando su propia altura según cuánto ocupe
  la descripción envuelta (para no superponer texto con descripciones
  largas ni con varias páginas).
- Resumen: subtotal de lista, descuentos (si hay), y el total destacado en
  verde.
- Medio y estado del pago, estado del pedido, con etiquetas legibles
  (`estadosLegibles.js`): `aprobado_simulado` → "Aprobado — simulación",
  `revertido_simulado` → "Revertido — simulación", etc. — los valores
  internos del ENUM no cambian, esto es solo para lo que lee una persona.
- Formato argentino en todos los importes (`$25.000,00` — `utils/formato.js`,
  `Intl.NumberFormat('es-AR', ...)`, misma regla que usa la pantalla en el
  frontend, aunque son implementaciones separadas: backend y frontend son
  paquetes npm distintos sin código común).
- Pie: "Comprobante de demostración — sin validez fiscal" en cada página.
  No copia CUIT, condición tributaria ni domicilios de terceros: no se
  presenta como factura fiscal.

**Fecha y hora (corrección real, con un diagnóstico equivocado corregido en
la ronda siguiente)**: se reportó una diferencia de 12 horas entre lo que
mostraba la pantalla y el PDF. La causa NO era un desfasaje de zona
horaria en sí (Argentina es UTC-3 todo el año, sin horario de verano desde
2009 — nunca 12 horas), sino que `utils/formato.js` (backend) y el
formateador equivalente del frontend/`VentaDetalle.jsx` no fijaban
`timeZone`/`hour12` explícitos en sus `Intl.DateTimeFormat` — se corrigió
ahí, fijando `timeZone: 'America/Argentina/Buenos_Aires'` y
`hour12: false` explícitos en cada formateador (backend y frontend, misma
regla), para que pantalla y PDF usen el mismo reloj de 24 horas sin
depender de la configuración regional del dispositivo. Esa parte de la
corrección era correcta y se mantiene.

La ronda en la que se investigó este defecto TAMBIÉN cambió
`config/database.js` a `timezone: '-03:00'`, con una justificación
incorrecta: que Sequelize por defecto usa `'+00:00'` mientras que el
driver `mysql2` subyacente, sin este valor, interpreta esas mismas columnas
`DATETIME` según la zona horaria LOCAL del proceso — es decir, dos capas
con dos convenciones distintas. Una revisión independiente de la ronda
siguiente lo señaló como diagnóstico equivocado: Sequelize SÍ transmite
`timezone` a `mysql2`, y lo usa para las dos direcciones (escribir y leer),
así que ya era una única convención coherente en un único lugar. Cambiar
ese valor SIN convertir los datos ya guardados corría el riesgo real de
releer filas viejas con una convención distinta a la que se usó para
escribirlas (un desplazamiento de 3 horas) — riesgo confirmado con una
prueba puntual contra una base descartable (escribir con `'-03:00'`, releer
con `'+00:00'`: exactamente 3 horas de diferencia). Como este proyecto
nunca corrió con `'-03:00'` contra ninguna base real (nunca se hizo commit
de ese cambio, y `petshop_db` no se tocó en ninguna ronda), no había datos
reales que convertir: se revirtió `config/database.js` a `timezone:
'+00:00'` explícito — el mismo valor que ya regía por defecto antes de
toda esta corrección, ahora simplemente explícito en el archivo — sin
ninguna migración de datos. La causa real del defecto de 12 horas quedó,
como se explica arriba, en la capa de presentación, no en la conexión.

**Revisión visual real**: se generaron y revisaron a simple vista 4 PDF de
ejemplo (`node scripts/generarPdfsDeMuestra.js`) — compra simple, con
descuento, cancelada, y con suficientes líneas para ocupar 2 páginas. Esa
revisión encontró y corrigió, entre las dos rondas, tres defectos reales
que la sola generación del archivo no hubiera mostrado: una página en
blanco extra en todo comprobante de una sola página (el pie de página se
dibujaba justo en el borde del margen inferior, y pdfkit paginaba
automáticamente ese texto a una página nueva); un salto de línea extraño
en "Estado del pago: Aprobado — simulación" (el cursor horizontal de
pdfkit quedaba en un punto angosto, heredado de los importes alineados a
la derecha del resumen, sin resetear explícitamente antes de seguir con
texto de ancho completo); y, encontrado en la ronda siguiente al revisar
de nuevo el PDF multipágina, el resumen y el bloque de pago cayendo en una
página nueva encabezada por una tabla de productos VACÍA — la misma
función que paginaba las filas de productos (con su repetición de
encabezado de tabla) se reutilizaba también para el resumen/pago, que no
son parte de la tabla. Se separó en dos funciones: `asegurarEspacioProductos`
(repite el encabezado de tabla, para filas de productos) y
`asegurarEspacioResumen` (solo abre página nueva, sin dibujar ningún
encabezado de tabla, para el resumen y el bloque de pago).

## 9. Límite del total monetario (ronda 2)

Cada subtotal de línea ya se validaba contra el máximo de `DECIMAL(10,2)`
desde la ronda 1 (`calcularSubtotalCentavos`), pero el TOTAL acumulado de
la cotización solo se garantizaba representable como entero seguro, no
acotado a ese rango — se reprodujo con dos líneas de $60.000.000 cada una
(cada una individualmente válida), total $120.000.000, superior al máximo
de la columna. `cotizacion.service.js#cotizar` ahora rechaza (400) un
total que supere `MAXIMO_IMPORTE_CENTAVOS` (el mismo límite que
`DECIMAL(10,2)`, ya definido en `utils/validacion.js`), antes de persistir
nada — y como tanto el endpoint de cotización como `confirmarCompra` pasan
por esa misma función, un total fuera de rango se rechaza en los dos
puntos con un solo cambio. Probado con el límite exacto (se acepta), el
primer valor por encima (se rechaza, tanto al cotizar como al confirmar) y
varias líneas individualmente válidas que en conjunto siguen dentro del
límite.

## 10. Extensión futura: recordar una tarjeta

Fuera de alcance de esta ronda (según lo pedido). Si se implementa después:
un token ficticio (nunca el número real) + marca + últimos 4 dígitos,
guardado por cliente, reutilizable solo para prellenar el formulario — la
validación y el resultado simulado seguirían siendo los mismos de
`pagoSimulado.service.js` (la tabla `pago` ya guarda exactamente esos tres
datos por venta, así que el mismo patrón alcanzaría sin cambiar el
esquema).

## 11. Guía breve de prueba manual

```bash
# Terminal 1
cd backend && npm run dev
# Terminal 2 (una vez, o para reponer datos — y, la primera vez tras
#              actualizar a la ronda 2, DESPUÉS de correr la migración,
#              ver sección 4)
cd backend && npm run sembrar:demo
# Terminal 3
cd frontend && npm run dev
```

Con `cliente@petshop.demo` / `Demo1234Client` (credenciales de
demostración, no reales — ver `sembrarDatosDemo.js`):

1. Agregar un producto al carrito → Confirmar compra → se ve el resumen
   **recalculado por el backend** (no el precio del carrito).
2. Elegir "Transferencia (simulada)" → Confirmar y pagar → redirige al
   comprobante, con número `PS-...`, "Descargar comprobante (PDF)" y
   "Reenviar por correo".
3. Repetir con "Débito (simulado)" y el número `4000000000000002` → se
   aprueba igual. Con `4000000000000010` → se rechaza, mostrando el
   motivo, sin salir del checkout ni vaciar el carrito.
4. Desde "Mis compras", con la compra aprobada, hacer clic en "Solicitar
   cancelación" (ronda 4 — ya no hay un botón de "Cancelar venta" para el
   cliente): el pedido sigue mostrando `registrada`, con un aviso de
   "pendiente de revisión". Entrar como personal
   (`vendedor@petshop.demo`), abrir esa misma venta desde el panel (con un
   aviso de "Pendiente" en el listado) y confirmar "Aprobar solicitud de
   cancelación" → el estado del pago pasa a `revertido_simulado`, el stock
   se restituye, y el pedido pasa a `cancelada`.
5. Para ver el efecto de una cotización desactualizada: abrir el checkout
   en dos pestañas con el mismo producto, cambiar el precio del producto
   desde el panel (`vendedor@petshop.demo`) en una, y confirmar en la
   otra — debe pedir revisar el resumen nuevo, sin registrar la compra al
   precio viejo.
6. **Recuperación tras perder la respuesta (ronda 2)**: con las
   herramientas de desarrollador del navegador, poner la pestaña de Red en
   modo "Offline" justo después de hacer clic en "Confirmar y pagar" (o
   cerrar el proceso del backend en ese instante y volver a levantarlo),
   de forma que la respuesta nunca llegue. Recargar la página del
   checkout: debe navegar directo al comprobante (si la compra llegó a
   aprobarse en el servidor) o mostrar "Iniciar un nuevo intento" con el
   motivo (si se rechazó) — nunca duplicar la compra ni pedir los datos de
   pago de nuevo.
7. **Medio de pago deshabilitado (ronda 2)**: desde el panel de personal,
   deshabilitar "Transferencia bancaria (simulada)" en Medios de pago;
   intentar una compra nueva con transferencia → debe rechazarse con un
   mensaje explícito, sin registrar nada. Una compra hecha ANTES de
   deshabilitarlo debe seguir viéndose/recuperándose con normalidad.
8. **Estados de correo (ronda 2)**: sin `SMTP_HOST` configurado en
   `backend/.env`, el estado de correo de una compra nueva debe mostrar
   "No configurado", nunca "enviado" ni nada que sugiera un envío real.
9. **Correo con PDF adjunto (ronda 4)**: con `SMTP_HOST`/credenciales
   reales configuradas (y `CORREO_TRANSPORTE` vacío), confirmar una compra
   con un cliente cuyo correo sea una casilla real accesible → el mensaje
   debe llegar con el PDF adjunto (mismo diseño que "Descargar comprobante")
   y, si `URL_PUBLICA_FRONTEND` no está configurada, sin ningún enlace a
   `localhost`.
10. **Cancelación directa restringida (ronda 4)**: como cliente, en el
    detalle de una compra `registrada`, confirmar que NO aparece ningún
    botón "Cancelar venta" (solo "Solicitar cancelación"). Como personal,
    cargar una venta manual (`/panel/ventas/nueva`) y confirmar "Cancelar
    venta" → debe pedir una confirmación explícita antes de ejecutarla.
11. **Solicitud rechazada (ronda 4)**: como cliente, solicitar la
    cancelación de una compra; como personal, "Rechazar solicitud de
    cancelación" (sin necesitar confirmación) → la venta sigue `registrada`
    y el cliente ve el aviso de que su solicitud fue rechazada, con opción
    de solicitar de nuevo.

## 12. Resultados ejecutados (esta ronda, real, no antecedentes)

Ver el informe de cierre de esta ronda,
[cu04-informe-cierre.md](cu04-informe-cierre.md), para los números finales
(post-revisión de Codex) y el detalle de qué cubre cada suite.
