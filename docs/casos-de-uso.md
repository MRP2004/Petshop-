# Casos de uso

Los tres casos de uso comprometidos en `proposal.md` para regularidad y
aprobación: registrar una venta, cancelarla, y marcarla como enviada. Los
tres operan sobre la misma entidad (`Venta`) y están relacionados en
secuencia: una venta se registra, después puede cancelarse **o**
marcarse como enviada (no ambas), nunca al revés.

## 1. Registrar una venta

**Actor**: Cliente autenticado (compra pública) o personal (`vendedor`/
`administrador`, venta manual para un cliente elegido).

**Objetivo**: dejar constancia de una compra, descontar el stock vendido y
calcular el total a cobrar.

**Precondiciones**: el actor tiene sesión iniciada. Si es personal, el
cliente y todos los productos ya existen. El medio de pago elegido existe y
está habilitado.

**Pasos**:
1. El actor arma una lista de productos y cantidades (carrito en el
   frontend público, o el formulario de "Nueva venta" en el panel).
2. Elige medio de pago y método de entrega.
3. Confirma. El frontend manda `POST /api/ventas` con
   `{ idMedioPago, metodoEntrega, direccionEntrega?, detalles: [{idProducto, cantidad}, ...], idCliente?, descuento? }`
   (`idCliente` y `descuento`/`minimoMayorista` solo tienen efecto si es
   personal; si es cliente, el backend los ignora por completo — ver la
   corrección crítica más abajo — y usa el `idCliente` de la sesión).
4. El backend valida la forma del cuerpo, valida cada cantidad e importe,
   valida que `metodoEntrega` sea uno de los dos valores reconocidos y que
   `direccionEntrega` esté presente y sea razonable cuando corresponde
   ("envío a domicilio" no se puede confirmar sin domicilio), abre una
   transacción, bloquea cada producto involucrado (`SELECT ... FOR UPDATE`),
   verifica stock suficiente, recalcula precio/subtotal/total desde lo
   persistido (nunca confía en un precio que mande el cliente), descuenta el
   stock, crea la `Venta`, sus `DetalleVenta` y, si corresponde, la fila de
   `DireccionEntrega`, y confirma la transacción.
5. El frontend redirige al detalle de la venta recién creada y muestra el
   número de operación.

**Validaciones y alternativas de error**:
- Cuerpo/detalle con forma inválida, cantidades no enteras o ≤ 0, importes
  fuera del rango de `DECIMAL(10,2)` → `400`.
- Producto o cliente inexistente, medio de pago inexistente o
  deshabilitado → `400`.
- Stock insuficiente para algún producto → `409`, no se descuenta nada.
- `metodoEntrega` distinto de los dos valores reconocidos → `400`.
- "Envío a domicilio" sin `direccionEntrega` (o demasiado corta) → `400`,
  la venta no se registra.
- Sin sesión → `401`.

**Corrección crítica de esta etapa — un cliente no puede autodescontarse
nada**: antes, un cliente autenticado podía mandar `descuento` (o
`minimoMayorista`) en el cuerpo y el backend lo aplicaba igual: se
reprodujo una compra de $100 con `descuento: 100` que quedaba registrada
con total $0. Ahora, si quien compra es un cliente, esos dos campos se
ignoran por completo (ni se leen del cuerpo), sin importar qué se mande:
la venta se registra al precio de lista. Solo personal puede fijarlos
(venta manual). Ver [backend-autenticacion.md](backend-autenticacion.md) y
`test/ventaDescuentoAutorizacion.test.js`.

**Datos leídos**: `Producto` (precio, stock), `Cliente`, `MedioPago`.
**Datos modificados**: `Producto.stockActual` (resta), nuevas filas de
`Venta` y `DetalleVenta`.

**Funciones reutilizadas**: `prepararDetalles`, `calcularSubtotalCentavos`,
`acumularSubtotalGeneral`, `calcularTotalCentavos` (`ventaValidaciones.js`,
compartidas con las pruebas); `validarImportePersistido`,
`prepararImporteOpcional` (`validacion.js`, compartidas con el resto de los
CRUD). El frontend usa el **mismo** endpoint y servicio tanto para la
compra pública como para la venta manual del panel: la única diferencia
(de quién es el `idCliente`) la resuelve el backend según el rol del token,
no hay dos implementaciones de la regla de negocio.

**Transacción y bloqueo**: todo el registro ocurre dentro de
`sequelize.transaction`, bloqueando cada `Producto` con `LOCK.UPDATE` en el
momento de leer su stock. Esto evita que dos ventas concurrentes sobre el
mismo producto lean el mismo stock "viejo" y ambas lo descuenten sin
enterarse la una de la otra (sobreventa). Si cualquier paso falla, toda la
transacción revierte: no puede quedar un producto con el stock descontado
sin que la venta se haya creado, ni viceversa.

**Pruebas que lo demuestran**: `test/ventaEntradasInvalidas.test.js`
(validación, sin base), `test-integracion/ventaConcurrencia.integracion.js`
(persistencia real, stock insuficiente, dos ventas concurrentes sin
sobreventa — el bloqueo de privilegios de MySQL que impedía crear
`petshop_test` está resuelto, ver
[backend-base-de-datos.md](backend-base-de-datos.md); la ejecución real
depende de completar la contraseña local, ver
[estado-proyecto.md](estado-proyecto.md) para el resultado más reciente),
`e2e/recorrido-completo.spec.js` (extremo a extremo, contra la instancia
aislada de E2E, ver [frontend-pruebas.md](frontend-pruebas.md) — mismo
estado de ejecución que arriba).

**Ejemplo**: iniciar sesión como `cliente@petshop.demo`, agregar "Pelota de
goma resistente" al carrito, confirmar con "Efectivo" → la venta aparece en
"Mis compras" con estado `registrada` y el stock del producto baja en 1.

## 2. Cancelar una venta

**Actor**: personal (`vendedor`/`administrador`), sobre cualquier venta.
**Ya NO el cliente** (corrección — revisión de Mauro sobre la venta #20:
"el cliente ya no puede ejecutar una cancelación directa"): un cliente que
quiere cancelar su propia compra usa "Solicitar cancelación" (ver 2 bis,
más abajo), que el personal aprueba o rechaza.

**Objetivo**: revertir una venta registrada, restituyendo el stock vendido.

**Precondiciones**: la venta existe, está en estado `registrada` (no se
puede cancelar una ya cancelada o ya enviada), y el actor es personal.

**Pasos**:
1. Personal abre el detalle de la venta, confirma explícitamente ("¿Cancelar
   esta venta?...") y confirma "Cancelar venta".
2. `PATCH /api/ventas/:id/cancelar`.
3. El backend abre una transacción, bloquea la fila de `Venta`
   (`LOCK.UPDATE`), verifica el rol y el estado, recorre cada
   `DetalleVenta`, bloquea el `Producto` correspondiente y le suma de
   vuelta la cantidad vendida (verificando que no exceda el rango de
   `INTEGER`), y actualiza el estado de la venta a `cancelada`.

**Validaciones y alternativas de error**:
- Venta inexistente → `404`. El actor es un cliente (aunque sea el dueño de
  la venta) → `403`, tanto en la ruta (`requiereRol`) como en el servicio
  (defensa en profundidad). Estado distinto de `registrada` → `409`.
- Restituir el stock de algún producto superaría el máximo de `INTEGER`
  (caso extremo: entró muchísima mercadería mientras la venta seguía
  registrada) → `409`, no se cancela nada, ni a medias.

**Datos leídos**: `Venta`, sus `DetalleVenta`, cada `Producto` involucrado.
**Datos modificados**: `Producto.stockActual` (suma), `Venta.estado`.

**Funciones reutilizadas**: `venta.service.js#ejecutarCancelacionTransaccional`
(la restitución de stock y reversión de pago, factorizada aparte) es
compartida con la aprobación de una solicitud de cancelación (ver 2 bis) —
nunca dos implementaciones que puedan divergir; el mismo patrón de
transacción+bloqueo que `registrarVenta`.

**Transacción y bloqueo**: igual razón que al registrar, en sentido
inverso — si dos cancelaciones (o una cancelación y un envío, o una
cancelación y la aprobación de una solicitud) de la misma venta llegaran a
la vez, el bloqueo de la fila de `Venta` serializa todas: la segunda vuelve
a leer el estado ya actualizado por la primera y falla con `409` en vez de
aplicarse igual.

**Pruebas que lo demuestran**: `test/ventaEntradasInvalidas.test.js`,
`test/ventaAccesoAjeno.test.js` (un cliente, sea o no el dueño, recibe 403
en la ruta), `test-integracion/ventaConcurrencia.integracion.js` (cancelación
y restitución exacta, rollback real después de escrituras, doble
cancelación concurrente), `test-integracion/compra.integracion.js`
(el propio cliente NO puede cancelar directamente),
`e2e/recorrido-completo.spec.js` (el personal cancela una venta cargada
manualmente, con la confirmación explícita) — ver
[estado-proyecto.md](estado-proyecto.md) para el resultado más reciente.

**Ejemplo**: sobre una venta cargada manualmente por el personal, "Cancelar
venta" (con la confirmación aceptada) → el estado pasa a `cancelada` y el
stock del producto vendido vuelve a su valor original.

## 2 bis. Solicitar la cancelación (cliente) y resolverla (personal)

**Actor**: el cliente dueño de la venta (solicita); personal (aprueba o
rechaza).

**Objetivo**: dejar registrada la intención del cliente de cancelar su
propia compra, sin que la venta, el pago ni el stock cambien todavía —
distinto de una **devolución** de un pedido ya **entregado** (`enviada`),
que es un flujo posterior, documentado acá como pendiente, sin ninguna
función que lo implemente todavía (no confundir ambos: esta solicitud solo
aplica mientras la venta sigue `registrada`).

**Precondiciones (solicitar)**: la venta existe, pertenece al cliente que
solicita, está `registrada`, y no hay ya una solicitud `pendiente` para esa
misma venta.

**Pasos (solicitar)**:
1. El cliente abre el detalle de su compra y confirma "Solicitar
   cancelación" (sin diálogo de confirmación: a diferencia de cancelar,
   esta acción no cambia nada por sí sola).
2. `POST /api/solicitudes-cancelacion` (`{ idVenta }`).
3. El backend abre una transacción, bloquea la fila de `Venta` (mismo punto
   de serialización que `cancelarVenta`/`marcarVentaComoEnviada`), verifica
   pertenencia y estado, comprueba que no haya ya una solicitud pendiente, y
   crea la fila de `SolicitudCancelacion` (`estado: 'pendiente'`).

**Precondiciones (resolver)**: la solicitud existe y sigue `pendiente`; el
actor es personal. Para aprobar, además, la venta debe seguir `registrada`
(pudo haber cambiado desde que se pidió la solicitud).

**Pasos (resolver)**:
1. Personal ve la solicitud pendiente (en el detalle de la venta, y con un
   aviso en el listado de ventas) y confirma "Aprobar solicitud de
   cancelación" (con el mismo tipo de confirmación explícita que cancelar
   directamente) o "Rechazar solicitud de cancelación" (sin confirmación:
   no cambia nada de la venta).
2. `PATCH /api/solicitudes-cancelacion/:id/aprobar` o `/rechazar`.
3. Al aprobar: el backend bloquea la fila de `Venta` y, DESPUÉS, la de
   `SolicitudCancelacion` (orden fijo, documentado), comprueba que la
   solicitud siga `pendiente` y la venta siga `registrada`, y reutiliza
   EXACTAMENTE la misma `ejecutarCancelacionTransaccional` de "Cancelar una
   venta" (arriba) — nunca una segunda implementación. Al rechazar: solo
   actualiza la solicitud (`estado: 'rechazada'`, con un motivo opcional);
   la venta sigue `registrada`.

**Validaciones y alternativas de error**:
- Solicitar sobre la venta de otro cliente → `403`. Sobre una venta que no
  está `registrada` → `409`. Con una solicitud ya pendiente → `409` (sin
  solicitudes duplicadas).
- Resolver como cliente → `403`. Sobre una solicitud ya resuelta (aprobada
  o rechazada) → `409` (sin decisiones repetidas) — esto incluye el caso en
  que el personal canceló la venta directamente, o la marcó como enviada,
  mientras la solicitud seguía pendiente: esas dos operaciones cierran
  solas cualquier solicitud pendiente de esa venta (`'aprobada'` si terminó
  cancelada, `'rechazada'` con motivo si se marcó enviada), así que nunca
  queda una solicitud pendiente sin resolver ni se restituye el stock una
  segunda vez.

**Datos leídos/modificados**: `SolicitudCancelacion` (creación/decisión);
al aprobar, además, lo mismo que "Cancelar una venta".

**Transacción y bloqueo**: el mismo bloqueo de `Venta` que cancelar/enviar
serializa una solicitud nueva contra cualquier cambio de estado concurrente
de la misma venta; al resolver, el orden fijo Venta→SolicitudCancelacion
serializa dos resoluciones simultáneas de la misma solicitud (solo una
gana) sin arriesgar un interbloqueo con el resto de las operaciones sobre
`Venta`.

**Pruebas que lo demuestran**:
`test-integracion/solicitudCancelacion.integracion.js` (solicitar, aprobar,
rechazar, duplicados, decisiones repetidas, dos aprobaciones concurrentes,
solicitud simultánea con una cancelación directa del personal),
`frontend/src/pages/VentaDetalle.test.jsx`,
`e2e/recorrido-completo.spec.js` (recorrido real: cliente solicita,
personal aprueba, la venta pasa a `cancelada`).

**Ejemplo**: sobre una venta recién confirmada por el checkout, el cliente
pide "Solicitar cancelación" → el pedido sigue mostrando `registrada`, con
un aviso de "pendiente de revisión"; el vendedor abre esa misma venta,
confirma "Aprobar solicitud de cancelación" → el pedido pasa a `cancelada`
y el stock vuelve a su valor original, igual que con una cancelación
directa.

## 3. Marcar una venta como enviada

**Actor**: personal (`vendedor`/`administrador`). Un cliente no marca su
propio pedido como enviado.

**Objetivo**: reflejar que el pedido salió del negocio hacia el cliente.

**Precondiciones**: la venta existe y está en estado `registrada`.

**Pasos**:
1. Desde el panel, personal abre el detalle de una venta registrada y
   confirma "Marcar como enviada".
2. `PATCH /api/ventas/:id/enviar`.
3. El backend abre una transacción, bloquea la fila de `Venta`, vuelve a
   comprobar que sigue `registrada` (no que lo estaba cuando se cargó la
   pantalla), y actualiza el estado a `enviada`.

**Validaciones y alternativas de error**: venta inexistente → `404`;
estado distinto de `registrada` → `409`; sin rol de personal → `403`.

**Datos leídos/modificados**: `Venta.estado` únicamente (no toca stock).

**Transacción y bloqueo**: mismo mecanismo que `cancelarVenta`, sobre la
misma fila de `Venta`: así una cancelación y un envío concurrentes sobre la
misma venta no pueden tener éxito los dos (antes de esta corrección, sí era
posible — ver `docs/estado-proyecto.md`).

**Pruebas que lo demuestran**: `test-integracion/ventaConcurrencia.integracion.js`
(cancelar/enviar concurrentes con contención real confirmada),
`e2e/recorrido-completo.spec.js` (cargar una venta manual como vendedor y
marcarla como enviada) — mismo estado de ejecución que en "Registrar una
venta" arriba.

**Ejemplo**: como `vendedor@petshop-e2e.test` (E2E) o `vendedor@petshop.demo`
(desarrollo local), cargar una venta para "Cliente De Prueba" con
"Rascador para gatos" → "Marcar como enviada" → el estado pasa a
`enviada`.

## Cómo se relacionan entre sí

Los tres comparten la misma entidad y el mismo patrón (transacción +
bloqueo de fila de `Venta`), pero no se fuerza ninguna relación artificial
más allá de esa: registrar es el único que crea la venta; cancelar y enviar
son dos transiciones alternativas y mutuamente excluyentes desde
`registrada` (una venta cancelada no puede después enviarse, ni viceversa).
No hace falta relacionarlos de ninguna otra forma para que cada uno tenga
valor de negocio por sí solo.
