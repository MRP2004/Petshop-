# Informe de cierre — CU-04 (checkout, pago simulado, gestión de venta)

Rama `feature/cu04-checkout-pago-simulado`, desde `feature/backend-inicial`
@ `ffd33b8`. Sin commits, sin push. Las secciones 1 a 10 de este documento
cierran la **ronda 2** (corrección de defectos reales encontrados por
Mauro tras probar a mano la primera entrega). La **sección 11** cierra la
**ronda 3** (5 pendientes que dejó una revisión independiente sobre la
ronda 2). La **sección 12** cierra la **ronda 4** (adjuntar el PDF al
correo automático, quitar el enlace a `localhost`, y restringir la
cancelación directa al personal con una solicitud de cancelación para el
cliente — tras confirmar en la venta #20 que el correo llega de verdad con
SMTP real). Ver [cu04-checkout-pago.md](cu04-checkout-pago.md) para el
detalle técnico completo de las cuatro rondas y el contrato para José.

## 1. Resumen de las correcciones, por hallazgo

| # | Hallazgo (reportado por Mauro) | Corrección |
|---|---|---|
| 1 | Recuperación de una compra tras perder la respuesta bloqueada (Checkout exigía cotizar de nuevo; la entrega se reseteaba) | `GET /api/compras/intentos/:clave` (lectura pura, nunca reemplaza el camino atómico); clave asociada a `idCliente`, con la entrega guardada junto a ella; cadena de respaldo `localStorage` → `sessionStorage` → memoria |
| 2 | `obtenerIdMedioPagoSimulado` no comprobaba `habilitado` | `resolverMedioPagoSimulado`: `SELECT...FOR UPDATE` + chequeo de `habilitado`, antes de cotizar; mismo lock agregado a la carga manual del personal; una compra ya aprobada nunca vuelve a mirarlo |
| 3 | `estadoCorreo` "enviado" no distinguía envío real de simulado | ENUM nuevo: `pendiente/simulado/no_configurado/aceptado/fallido/no_aplica`; el mensaje refleja el estado actual del pedido/pago (incluida una cancelación) |
| 4 | PDF/correo usaban el dato ACTUAL del cliente, no el histórico | Instantánea (`nombreCompradorHistorico`, etc.) en `Comprobante`, completada una sola vez al confirmar; PDF/correo/pantalla la usan con prioridad, con respaldo explícito para comprobantes anteriores |
| 5 | El total acumulado no se validaba contra `DECIMAL(10,2)` (dos líneas válidas podían sumar un total inválido) | `cotizar()` rechaza (400) un total fuera de rango, antes de persistir nada |
| 6 | El proveedor de precios no recibía transacción ni un instante de evaluación coherente | Firma `obtenerPrecioVigente(producto, { transaction, instanteEvaluacion })`; único punto de configuración (`proveedorPrecioActual.js`); reconfirmación si cambia el desglose aunque el total final coincida |
| 7 | Diseño del comprobante a mejorar (formato, estados legibles, fecha/hora, paginación) | PDF rediseñado: encabezado con marca, tabla con descuento, formato AR, etiquetas legibles, zona horaria explícita, paginación con encabezado repetido |
| 8 | Actualización de esquema sin perder datos | `migracionCU04Ronda2.js`: índice único, ENUM ampliado→migrado→angostado, columnas nuevas — todo idempotente, verificado contra una base descartable en los dos escenarios (esquema previo con datos, y ya migrado) |

## 2. Archivos modificados y decisiones relevantes

Ver [cu04-checkout-pago.md](cu04-checkout-pago.md) §2 para la lista
completa. Decisiones que vale la pena resaltar acá:

- El pago se sigue procesando **dentro** de la transacción (ver §6),
  ahora explícitamente solo en la rama de un intento nuevo — moverlo antes
  de comprobar la idempotencia rompía la recuperación de una compra ya
  aprobada cuyo formulario de pago se reinició con datos inválidos.
- `hashContenido` de la clave de idempotencia **nunca** incluyó datos de
  pago desde la corrección de la ronda 1 — el documento anterior lo
  describía mal (decía que incluía el medio de pago y los últimos 4
  dígitos); ya está corregido en `cu04-checkout-pago.md`.
- El índice único de `mediopago.nombre` se verifica por EXISTENCIA de un
  índice único sobre la columna, no por un nombre fijo — una instalación
  nueva (vía `sync()`, que ya usa `unique: true` en el modelo) crea ese
  índice con un nombre autogenerado distinto del que usa el script de
  migración; buscar solo por nombre fijo hacía que el script no fuera
  realmente idempotente contra una base ya sincronizada con los modelos
  actuales (encontrado durante la verificación de la migración).

## 3. Resultados ejecutados y alcance real

```
cd backend && npm test                                           → 227/227 (sin base, mockeada/interceptada)
cd frontend && npm test                                          → 35/35 (sin base)
cd frontend && npm run lint / npm run build                      → sin errores

DOTENV_CONFIG_PATH=.env.test npm run test:integracion (backend)  → 61/61, REAL contra petshop_test
npx playwright test (frontend, contra petshop_e2e real)          → 33/33 (11 casos × 3 viewports), REAL,
                                                                     re-ejecutado después de todas las correcciones
```

Los números de la entrega anterior (backend 220/220, integración 48/48,
frontend 32/32, E2E 18/18) son antecedentes de la ronda 1, no de esta.
Todo lo de arriba se ejecutó de verdad en esta ronda, con las correcciones
ya aplicadas.

Desglose de lo nuevo en esta ronda:

- Backend, sin base (+7 sobre la ronda 1): `compraLogicaPura.test.js`
  sumó 1 prueba (desglose de precio/descuento en la reconfirmación);
  `correo.service.test.js` se rehízo por completo (10 pruebas, antes 4) —
  cubre los 6 estados nuevos, el correo/nombre histórico, y una venta
  cancelada.
- Backend, integración real (+13 sobre la ronda 1, ahora 61 en total, todos en `compra.integracion.js`, que pasó de 18 a 31 casos):
  medio de pago deshabilitado (nuevo/ya aprobado/sembrado), límite
  monetario (límite exacto/por encima/varias líneas válidas), contexto
  transaccional del proveedor de precios, instantánea del comprador
  inmutable, `consultarIntento` (aprobado/rechazado/no encontrado/ajeno),
  recuperación con envío a domicilio.
- Frontend (+3 sobre la ronda 1, de 32 a 35 en total): recuperación de un
  intento aprobado/rechazado/incierto en `Checkout.test.jsx`.
- E2E (de 6 a 11 casos sobre la ronda 1 — 5 casos nuevos × 3 viewports = 15
  ejecuciones adicionales, de 18 a 33 en total): débito aprobado, débito
  rechazado (con reintento inmediato Y con la respuesta perdida),
  descarga real y verificada del PDF (no solo que el botón exista),
  recuperación real de una compra tras perder la respuesta (intercepción
  de red genuina, no simulada en el sentido de "inventada": el servidor sí
  procesa la compra).

Verificación de migración de esquema, contra `petshop_test` descartable
(dos scripts complementarios, uno por ronda — ver
[cu04-checkout-pago.md](cu04-checkout-pago.md) §4 para la salida completa):
instalación nueva, actualización desde el esquema de la ronda 1 (sin
tablas de CU-04), y actualización desde el esquema de la primera entrega
de CU-04 (con las 4 tablas, sin los cambios de esta ronda) — las tres
preservando los datos ya cargados, y la migración de la ronda 2 verificada
como idempotente (correrla dos veces no rompe nada).

PDF de ejemplo: 4 generados y revisados visualmente (no solo generados) —
compra simple, con descuento, cancelada, y una con 18 líneas para forzar
paginación — encontrando y corrigiendo, en esa revisión, una página en
blanco espuria y un salto de línea incorrecto (ver
[cu04-checkout-pago.md](cu04-checkout-pago.md) §8).

## 4. Hallazgos de Codex y cómo se resolvieron

Revisión real (Codex CLI, no simulada), en dos etapas:

**Diseño, antes de implementar** (foco: recuperación/idempotencia,
concurrencia del nuevo lock sobre `MedioPago`, extensión del contrato de
precios): aprobado en lo central, con dos ajustes incorporados desde el
principio: (a) `mediopago.nombre` necesitaba un índice único real para que
el `SELECT...FOR UPDATE` del lock tuviera sentido — no existía hasta esta
ronda; (b) fijar explícitamente el orden de locks (intento → medio de pago
→ productos) y aplicar el mismo lock también en `registrarVenta` (carga
manual), por coherencia.

**Diff final ya implementado**, enfocada en atomicidad/concurrencia,
autorización del nuevo endpoint de consulta, el contrato transaccional de
precios, los estados de correo, la migración, la instantánea del
comprador, y posibles regresiones:

| # | Hallazgo | Severidad | Resolución |
|---|---|---|---|
| 1 | Con `localStorage` bloqueado Y la página recargada, el respaldo en memoria de la clave se perdía — la idempotencia del lado del cliente dejaba de proteger contra una segunda compra en ese caso | Media/alta | Cadena de respaldo de 3 niveles: `localStorage` → `sessionStorage` (sí sobrevive una recarga de la misma pestaña) → memoria |
| 2 | `httpClient.js` no tenía límite de tiempo: una conexión colgada podía dejar la recuperación del checkout esperando indefinidamente, sin mensaje ni forma de reintentar | Media | Límite de 15s por pedido con `AbortController`, tratado como cualquier otro fallo de conexión |
| 3 | La migración validaba el índice único de `mediopago.nombre` solo por nombre — una instalación ya sincronizada con los modelos actuales (índice autogenerado, otro nombre) no era detectada, y el script agregaba un índice redundante | Baja/media | Se verifica por existencia de CUALQUIER índice único sobre la columna, no por nombre fijo (encontrado y corregido durante la propia verificación de la migración, además del hallazgo de Codex) |
| 4 | `VentaDetalle.jsx` seguía mostrando el nombre ACTUAL del cliente, mientras que el PDF/correo ya usaban la instantánea histórica — inconsistencia visible si el cliente edita su perfil | Baja | La pantalla usa la misma instantánea histórica, con el mismo respaldo para comprobantes sin ella |

Además, una prueba E2E nueva (descarga real del PDF, no solo que el botón
exista) encontró un quinto defecto real, independiente de la revisión de
Codex: `Content-Disposition` no estaba expuesto en la configuración de
CORS, así que el navegador nunca podía leer el nombre de archivo real del
comprobante en un pedido cross-origin — la descarga funcionaba, pero
siempre con el nombre genérico de respaldo del frontend. Corregido
agregando `exposedHeaders: ['Content-Disposition']` a la configuración de
`cors()` en `app.js`.

Ningún hallazgo implicó ampliar el alcance pedido; todas las correcciones
son defensivas/de robustez sobre lo ya implementado. Todas las
correcciones se reverificaron con la suite completa (backend 227/227,
integración 61/61, frontend 35/35, E2E 33/33) después de aplicarlas.

## 5. Procedimiento exacto para actualizar la base existente

Ver [cu04-checkout-pago.md](cu04-checkout-pago.md) §4. Resumen: con el
backend detenido, `node scripts/migrarCU04Ronda2.js --confirmar` contra tu
`.env` real (índice único + ENUM ampliado/migrado/angostado + 3 columnas
nuevas, todo idempotente), después reiniciar normalmente. Nada de esto se
ejecutó contra `petshop_db` en este trabajo — se verificó, dos veces
(incluida la corrección del hallazgo #3 de Codex), contra `petshop_test`.

## 6. Guía breve de prueba manual para Mauro

Ver [cu04-checkout-pago.md](cu04-checkout-pago.md) §11 — incluye los 3
escenarios nuevos de esta ronda (recuperación tras perder la respuesta,
medio de pago deshabilitado, estado de correo sin SMTP configurado),
además de los ya documentados en la ronda 1.

## 7. Contrato actualizado para José

Ver [cu04-checkout-pago.md](cu04-checkout-pago.md) §3 — firma nueva
(`{ transaction, instanteEvaluacion }`), punto único de configuración
(`precios/proveedorPrecioActual.js`), y la regla de reconfirmación por
cambio de desglose (no solo por cambio del precio final).

## 8. PDF de ejemplo revisados visualmente

Ver sección 3 de este informe y
[cu04-checkout-pago.md](cu04-checkout-pago.md) §8 — 4 PDF generados con
`node scripts/generarPdfsDeMuestra.js`, revisados uno por uno (no solo
generados), con dos defectos reales encontrados y corregidos en esa
revisión.

## 9. Pendientes o verificaciones bloqueadas

- **Entrega real de correo**: sin credenciales SMTP, sigue sin verificar
  más allá del transporte de prueba (usado en toda la suite automatizada)
  — ahora, al menos, el estado persistido (`no_configurado`/`simulado`)
  nunca finge un envío real que no ocurrió. No bloqueado — solo pendiente
  de credenciales, que no corresponde inventar ni pedir en este informe.
- **Reglas reales de promoción (José)**: contrato extendido (transacción +
  instante de evaluación) y probado de punta a punta con un proveedor de
  prueba controlado; ninguna promoción se aplica todavía de forma
  automática a una compra real.
- **Guardar una tarjeta**: fuera de alcance por pedido explícito
  (mantenido también en esta ronda), extensión documentada.
- **Confirmar con los docentes** si CU-04 cubre el casillero de "cuarto
  caso de uso" del equipo — decisión académica, no algo que se resuelva
  acá (ver "Pendientes de alcance" en `estado-proyecto.md`).

## 10. Estado final de Git

```
Rama:      feature/cu04-checkout-pago-simulado (desde ffd33b8)
Commits:   ninguno
petshop_db: sin escrituras durante esta ronda (toda escritura de prueba
            fue contra petshop_test/petshop_e2e; la migración de esquema
            se aplicó y verificó solo contra esas dos bases descartables)
```

## 11. Ronda 3 — 5 pendientes de una revisión independiente sobre la ronda 2

Sin commits ni push, misma rama, misma base (`ffd33b8`). Ningún cambio de
esquema en esta ronda (no hizo falta correr ni tocar la migración).

### 11.1 Resumen por hallazgo

| # | Hallazgo (revisión independiente) | Corrección |
|---|---|---|
| 1 | `claveIdempotencia.js`: `leerGuardado()` solo bajaba de nivel de almacenamiento si el nivel anterior LANZABA, nunca si respondía "vacío" — pero `localStorage.setItem` fallando (cuota) con `localStorage.getItem` funcionando normalmente es exactamente ese caso, y es el más común en la práctica: dos llamadas seguidas a `obtenerOCrearClave()` con el mismo carrito generaban dos claves DISTINTAS | Cascada de lectura corregida (baja de nivel también si responde "vacío"); cada escritura exitosa limpia TODOS los demás niveles con `removeItem` (no solo los inferiores — ver hallazgo de Codex más abajo); `respaldoEnMemoria` ya no se escribe "por las dudas" en cada llamada, solo cuando de verdad es el nivel usado |
| 2 | `database.js`: `timezone: '-03:00'` de la ronda 2 partía de un diagnóstico equivocado (que mysql2 ignora el `timezone` de Sequelize) | Revertido a `timezone: '+00:00'` explícito — el valor por defecto de siempre, nunca corrido contra una base real, así que no hizo falta convertir ningún dato. Verificado con un script descartable contra `petshop_test` (ver 11.3) |
| 3 | `httpClient.js`: el límite de tiempo de 15s solo cubría hasta recibir los ENCABEZADOS — un cuerpo que quedaba a mitad de camino después de eso no tenía ningún límite | Un único `AbortController` (`conLimiteDeTiempo`) cubre el pedido Y la lectura completa del cuerpo en `solicitar()`/`solicitarBinario()` |
| 4 | `comprobantePdf.service.js`: el PDF multipágina de ejemplo dejaba el resumen y el bloque de pago en una página nueva encabezada por una tabla de productos VACÍA | Paginación separada: `asegurarEspacioProductos` (repite encabezado de tabla) para filas, `asegurarEspacioResumen` (sin tabla) para resumen/pago. Verificado regenerando y revisando visualmente los 4 PDF de muestra |
| 5 | Este informe (sección 3, ronda 2): "frontend +5 sobre la ronda 1" (32 a 35 es +3, no +5); "E2E +15 casos × 3 viewports" redactado de forma ambigua | Corregido a "+3" y a "de 6 a 11 casos (+5 casos × 3 viewports = 15 ejecuciones adicionales)" |

### 11.2 Codex — revisión real, con fricción de entorno honesta

Se intentó un diff review real (`codex exec --sandbox read-only`) contra
los 6 archivos tocados. El entorno tuvo dos problemas reales, reportados
acá tal cual ocurrieron (no simulados ni maquillados):

- `git diff`/`git status` fallaron dentro del sandbox de Codex con
  "detected dubious ownership" (el proceso de Codex corre con otro usuario
  de Windows que el dueño del repo) — Codex lo resolvió leyendo los
  archivos completos directamente (no vía diff), más lento pero igual de
  válido para encontrar hallazgos reales.
- La primera corrida se extendió mucho (archivos completos leídos varias
  veces) y terminó sin un veredicto final sintetizado para los 5 puntos —
  sí alcanzó a señalar, a mitad de camino, un hallazgo real y concreto
  (ver abajo) antes de quedarse sin más antes de cerrar.

**Hallazgo real de Codex**: en `claveIdempotencia.js`, la limpieza de
niveles al escribir (hallazgo #1 de la tabla de arriba) solo limpiaba el
nivel INFERIOR al ganar un nivel superior, no al revés. Si `localStorage`
ya tenía un intento VIEJO de otro carrito (a propósito no limpiado, p. ej.
tras una cotización desactualizada) y DESPUÉS `localStorage.setItem`
empezaba a fallar para un carrito nuevo, ese resto viejo en `localStorage`
(no vacío) tapaba el intento nuevo guardado en `sessionStorage` — si la
página se recargaba antes de resolver ese intento nuevo, se perdía
exactamente la protección que esta cadena de 3 niveles existe para dar.
Corregido: cada escritura exitosa limpia TODOS los demás niveles (con
`removeItem`, que no necesita espacio y por eso funciona incluso en el
mismo nivel cuyo `setItem` acaba de fallar). Se agregó una prueba dedicada
que reproduce el escenario exacto y pasa con la corrección.

Una segunda consulta (sesión nueva de Codex, sin releer los archivos —
limitación reconocida: confirmó el razonamiento descrito, no re-verificó
el código de forma independiente) no encontró más hallazgos sobre los
otros 3 puntos (timezone, httpClient, paginación del PDF).

### 11.3 Resultados ejecutados

```
cd frontend && npx vitest run              → 43/43 (35 de la ronda 2 + 7 de
                                                claveIdempotencia.test.js nuevo +
                                                1 de httpClient.test.js nuevo)
cd frontend && npm run lint / npm run build → sin errores

cd backend && npm test                     → 227/227, sin cambios de esta ronda

DOTENV_CONFIG_PATH=.env.test npm run test:integracion (backend)
                                            → 61/61, REAL contra petshop_test,
                                              re-ejecutado tras el revert de timezone

npx playwright test (frontend, contra petshop_e2e real)
                                            → 33/33 (11 casos × 3 viewports), REAL,
                                              re-ejecutado tras los cambios de
                                              httpClient.js y comprobantePdf.service.js
```

Verificación puntual del revert de timezone, contra `petshop_test`
descartable (tabla temporal, eliminada al final, ver
[cu04-checkout-pago.md](cu04-checkout-pago.md) §8): escribir y releer con
`'+00:00'` (la configuración revertida) da el mismo instante exacto;
escribir con `'-03:00'` y releer con `'+00:00'` desplaza exactamente 3
horas — confirma el riesgo señalado por la revisión independiente, ya
evitado al no haber corrido nunca `'-03:00'` contra una base real.

PDF de ejemplo: los 4 se regeneraron y revisaron visualmente de nuevo tras
la corrección de paginación — confirmado que la página 2 del ejemplo
multipágina ahora arranca directo con "Subtotal (precio de lista) / Total
/ Pago", sin ninguna tabla de productos vacía antes.

### 11.4 Estado final de Git (ronda 3)

```
Rama:      feature/cu04-checkout-pago-simulado (desde ffd33b8)
Commits:   ninguno
petshop_db: sin escrituras (toda escritura de prueba, incluida la de la
            verificación de timezone, fue contra petshop_test/petshop_e2e)
```

## 12. Ronda 4 — correo con PDF adjunto y cancelación restringida al personal

Sin commits ni push, misma rama, misma base (`ffd33b8`). Sin cambios de
esquema que requieran migración (una tabla NUEVA, `solicitudcancelacion` —
`sync()` la crea sola, igual que las cuatro tablas de la ronda 1).

### 12.1 Contexto

Mauro probó manualmente la **venta #20** con credenciales SMTP reales
configuradas: el correo automático de compra efectivamente se acepta y
llega al cliente — la primera confirmación real de entrega de correo en
todo este trabajo (antes, sin esas credenciales, quedaba documentado como
pendiente de verificar). A partir de esa prueba manual, pidió dos
correcciones puntuales.

### 12.2 Resumen por hallazgo

| # | Hallazgo (pedido por Mauro) | Corrección |
|---|---|---|
| 1 | El correo automático de compra no adjuntaba el comprobante en PDF | `correo.service.js` llama a `generarPdfComprobante(venta)` (la MISMA función que usa la descarga manual) antes de armar el mensaje, y lo adjunta — nunca un segundo diseño |
| 1b | El correo incluía un enlace armado con `FRONTEND_URL`, que siempre es `localhost` en los tres entornos configurados | Enlace movido a una variable nueva y separada, `URL_PUBLICA_FRONTEND` (vacía por defecto): sin configurarla, el correo omite el enlace — el resumen + el PDF adjunto ya alcanzan. Se valida además que la URL configurada no sea, ella misma, `localhost`/`127.0.0.1`/`::1` |
| 2 | El cliente podía cancelar directamente su propia compra | `PATCH /api/ventas/:id/cancelar` ahora exige `vendedor`/`administrador`, tanto en la ruta (`requiereRol`) como en el servicio (defensa en profundidad) |
| 3 | Sin una forma de que el cliente pida cancelar y el personal decida | `POST /api/solicitudes-cancelacion` (cliente, sobre su propia venta `registrada`, sin tocar venta/pago/stock) + `PATCH /api/solicitudes-cancelacion/:id/aprobar`/`/rechazar` (personal) — aprobar reutiliza EXACTAMENTE la misma cancelación transaccional que la directa (`venta.service.js#ejecutarCancelacionTransaccional`, factorizada para esto) |

### 12.3 Archivos modificados y decisiones relevantes

Ver [cu04-checkout-pago.md](cu04-checkout-pago.md) §7 y §8 para el detalle
técnico completo. Decisiones que vale la pena resaltar acá:

- Un fallo de `generarPdfComprobante` DENTRO de `enviarComprobantePorCorreo`
  se trata igual que cualquier otro fallo de envío (`estadoCorreo:
  'fallido'`) — nunca un correo sin adjunto ni un estado a medias.
- `URL_PUBLICA_FRONTEND` se lee con `process.env` DENTRO de la función que
  la usa (`obtenerEnlaceValido`), no en una constante de módulo — un primer
  intento la leyó como constante y quedó congelada con el valor que tenía
  al importarse la primera vez, ignorando cualquier cambio posterior; el
  bug se encontró con las propias pruebas nuevas (una de ellas cambia esa
  variable entre llamadas) antes de llegar a la revisión de Codex.
- `ejecutarCancelacionTransaccional` (antes, lógica inline dentro de
  `cancelarVenta`) se extrajo a una función compartida, asumiendo que quien
  llama YA bloqueó la fila de `Venta` y verificó que sigue `registrada` —
  tanto `cancelarVenta` como `resolverSolicitudCancelacion` hacen esas dos
  cosas antes de invocarla, nunca la propia función.
- `SolicitudCancelacion` es 1 a N con `Venta` (no 1 a 1, a diferencia de
  `Pago`/`Comprobante`): una venta puede tener más de una solicitud a lo
  largo del tiempo (una rechazada y, después, una nueva).
- Orden fijo de locks al resolver una solicitud: `Venta` primero (mismo
  punto de serialización que `cancelarVenta`/`marcarVentaComoEnviada`),
  `SolicitudCancelacion` después — nunca al revés, para no arriesgar un
  interbloqueo con el resto de las operaciones que ya bloqueaban `Venta`
  primero.
- `cancelarVenta`/`marcarVentaComoEnviada` cierran solas, en la MISMA
  transacción, cualquier solicitud que hubiera quedado `pendiente` para esa
  venta (ver §12.5 — hallazgo real de Codex): sin esto, una carrera legítima
  entre una solicitud del cliente y una acción directa del personal dejaba
  esa solicitud `pendiente` para siempre.
- Dos pruebas de `test/sesionYCsrf.test.js` (genéricas, de CSRF/sesión, no
  específicas de CU-04) usaban `PATCH /api/ventas/:id/cancelar` como una
  ruta mutable cualquiera alcanzable por un cliente autenticado, para
  demostrar que la solicitud pasaba la autenticación y llegaba al
  servicio — dejó de ser alcanzable por un cliente, así que se migraron a
  `POST /api/solicitudes-cancelacion`, que sigue siéndolo.

### 12.4 Resultados ejecutados

```
cd backend && npm test                                           → 236/236 (sin base)
cd frontend && npx vitest run                                     → 50/50
cd frontend && npm run lint / npm run build                       → sin errores

DOTENV_CONFIG_PATH=.env.test npm run test:integracion (backend)  → 74/74, REAL contra petshop_test
                                                                     (12 casos nuevos en
                                                                     solicitudCancelacion.integracion.js,
                                                                     incluidas 2 pruebas de contención
                                                                     real confirmada)
npx playwright test (frontend, contra petshop_e2e real)          → 36/36 (12 casos × 3 viewports),
                                                                     real, re-ejecutado tras todas
                                                                     las correcciones
```

Desglose de lo nuevo en esta ronda:

- Backend, sin base (+9 sobre la ronda 3, de 227 a 236): 6 pruebas nuevas
  en `correo.service.test.js` (adjunto con firma `%PDF`, fallo de
  generación de PDF, con/sin/mal-configurada `URL_PUBLICA_FRONTEND`) + 3
  pruebas nuevas en `ventaCancelacionPermisos.test.js` (corrección
  adicional post-entrega, ver 12.10).
- Backend, integración real (+13 sobre la ronda 3, de 61 a 74): 12 casos
  nuevos en `solicitudCancelacion.integracion.js` (solicitar, aprobar,
  rechazar, duplicados, decisiones repetidas, cierre automático de una
  solicitud pendiente al cancelar/enviar directamente, y dos escenarios de
  concurrencia real) + 1 caso nuevo en `compra.integracion.js` ("el propio
  cliente NO puede cancelar directamente") — el caso que antes probaba lo
  contrario se corrigió para usar un usuario `vendedor`, no se sumó como
  nuevo.
- Frontend (+7 sobre la ronda 3, de 43 a 50): `VentaDetalle.test.jsx`,
  nuevo — cliente ve "Solicitar cancelación" y nunca "Cancelar venta",
  solicitud reflejada sin tocar la venta, solicitud rechazada con motivo,
  personal con confirmación antes de cancelar directamente o aprobar, y
  rechazo sin confirmación.
- E2E (+3 casos sobre la ronda 3, de 11 a 12 — ×3 viewports = 9 ejecuciones
  adicionales, de 33 a 36): el caso de "registrar y cancelar" se reescribió
  al recorrido real completo (cliente solicita → personal aprueba, con el
  diálogo de confirmación manejado de verdad); caso nuevo de cancelación
  directa del personal con confirmación.

### 12.5 Hallazgos de Codex y cómo se resolvieron

Revisión real (`codex exec --sandbox read-only`), misma fricción de
entorno que la ronda 3: `git diff`/`git status` bloqueados por "dubious
ownership" (el sandbox de Codex corre con otro usuario de Windows que el
dueño del repo) — resuelta leyendo los archivos completos en su lugar. La
corrida se extendió explorando varios archivos (correo, rutas, middleware
de autenticación, enrutamiento del frontend) sin llegar a un veredicto
final sintetizado para los 5 puntos pedidos — mismo patrón que en la ronda
3 — pero sí señaló, a mitad de camino, un hallazgo real y concreto antes
de seguir explorando sin cerrar:

**Hallazgo real de Codex**: si el personal cancelaba una venta
directamente (o la marcaba como enviada) mientras había una solicitud de
cancelación del cliente todavía `pendiente` para esa misma venta, esa
solicitud quedaba `pendiente` PARA SIEMPRE — nunca se resolvía sola, ni
había ninguna otra vía para cerrarla más que un rechazo manual que nadie
tenía por qué recordar hacer. No duplicaba stock ni pago (ya estaba
cubierto por las pruebas de contención), pero sí dejaba un estado de
negocio confuso y una fila que ningún flujo de la interfaz volvía a
mostrar como accionable de forma clara. Corregido: `cancelarVenta` y
`marcarVentaComoEnviada` ahora cierran solas, en la MISMA transacción que
cambia la venta, cualquier solicitud que hubiera quedado pendiente para
esa venta (`venta.service.js#cerrarSolicitudesPendientesPorCambioDirecto`)
— `'aprobada'` si la venta terminó cancelada (el resultado que el cliente
pedía SÍ ocurrió, solo que por la vía directa), `'rechazada'` con un
motivo explicativo si se marcó enviada. Se actualizaron las dos pruebas de
concurrencia real existentes en `solicitudCancelacion.integracion.js` para
verificar esto explícitamente (ninguna solicitud queda `pendiente` al
final, sin importar el orden de la carrera), y se agregó una prueba
directa para cada una de las dos funciones.

Una segunda consulta (sesión nueva de Codex, sin releer los archivos —
misma limitación reconocida que en la ronda 3: confirmó el razonamiento
descrito, no re-verificó el código de forma independiente) no encontró más
hallazgos: ni sobre la corrección del hallazgo de arriba, ni sobre el resto
de la ronda 4 (correo con PDF adjunto, `URL_PUBLICA_FRONTEND` leída
dinámicamente, permisos separados de cancelación directa vs. solicitud,
orden de locks `Venta`→`SolicitudCancelacion` al resolver una solicitud).

### 12.6 Procedimiento para actualizar el entorno existente

Sin migración: `solicitudcancelacion` es una tabla nueva, `sync()` la crea
sola en el próximo arranque del backend (`npm run dev`), sin tocar ninguna
tabla ni columna existente — igual que las cuatro tablas de la ronda 1. No
hace falta ejecutar ningún script sobre `petshop_db` para esta ronda.

Variable de entorno nueva, opcional, en `backend/.env`: `URL_PUBLICA_FRONTEND`
(vacía por defecto — completar solo si el frontend está desplegado en una
URL pública real, ver `.env.example`).

### 12.7 Guía breve de prueba manual para Mauro

Ver [cu04-checkout-pago.md](cu04-checkout-pago.md) §11, pasos 9 a 11
(correo con PDF adjunto, cancelación directa restringida al personal,
solicitud rechazada).

### 12.8 Pendientes o verificaciones bloqueadas

- **Devolución de un pedido ya entregado**: distinta de la solicitud de
  cancelación de esta ronda (que solo aplica mientras la venta sigue
  `registrada`) — queda documentada como un flujo posterior, sin ninguna
  función ni botón que sugiera que ya existe.
- El resto de los pendientes de la ronda 3 (entrega real de correo — ahora
  parcialmente resuelto, ver 12.1 — reglas reales de promoción, tarjeta
  guardada, confirmación docente del "cuarto caso de uso") sigue igual, ver
  §11 y `estado-proyecto.md`.

### 12.9 Estado final de Git (ronda 4)

```
Rama:      feature/cu04-checkout-pago-simulado (desde ffd33b8)
Commits:   ninguno
petshop_db: sin escrituras (toda escritura de prueba fue contra
            petshop_test/petshop_e2e)
```

### 12.10 Corrección adicional post-entrega: permisos de `cancelarVenta`

Pedido puntual de Mauro después de entregada la ronda 4: el chequeo de
permisos DENTRO del servicio (`venta.service.js#cancelarVenta`) solo
rechazaba con 403 un `usuario?.rol === 'cliente'` explícito — un `usuario`
`undefined` o un rol desconocido no coincidían con esa condición y hubieran
pasado, si algún llamador interno (actual o futuro) se saltara la ruta (que
sí exige `requiereRol('vendedor', 'administrador')`, por lo que en la
práctica esto era defensa en profundidad incompleta, no un hueco explotable
hoy).

**Corrección**: la condición pasó de negativa (bloquear solo `'cliente'`) a
positiva (permitir solo `'vendedor'`/`'administrador'`, rechazar cualquier
otra cosa con 403 "No tiene permisos para cancelar esta venta") — el mismo
criterio de lista explícita que ya usaba
`solicitudCancelacion.service.js#resolverSolicitudCancelacion`
(`!['vendedor', 'administrador'].includes(usuario?.rol)`).

**Pruebas agregadas**: `backend/test/ventaCancelacionPermisos.test.js`
(nuevo, 3 casos: rol `'cliente'`, rol desconocido `'repositor'`, `usuario`
`undefined` — los tres esperan 403 sin necesitar base de datos, porque el
chequeo ocurre antes de abrir la transacción). Se actualizó
`ventaConcurrencia.integracion.js`, que llamaba a `cancelarVenta` en varias
pruebas sin pasar usuario (antes pasaba igual, porque solo se bloqueaba
`'cliente'`): se agregó `usuarioVendedor` y se lo pasó a las 8 llamadas
afectadas.

**Resultados reales**: `npm test` → 236/236 (233 + 3 nuevas). Integración
real contra `petshop_test` (`DOTENV_CONFIG_PATH=.env.test npm run
test:integracion`) → 74/74 sin cambios de cantidad (mismos casos, ahora con
un usuario válido).

**Revisión de Codex** (`codex exec --sandbox read-only`, acotada a este
cambio puntual — no a toda la ronda 4, ya revisada aparte): confirmó que el
único llamador de producción (`venta.controller.js`) siempre pasa
`req.usuario`; que la ruta ya exige `requiereRol('vendedor',
'administrador')` antes del controller; que
`solicitudCancelacion.service.js` no depende de `cancelarVenta` (reutiliza
`ejecutarCancelacionTransaccional` con su propio guard de staff, así que no
se ve afectado); y que no hay scripts, seeds ni otros servicios en el
backend que llamen a `cancelarVenta` sin un usuario de personal válido. Sin
hallazgos accionables.
