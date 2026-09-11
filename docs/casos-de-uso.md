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

**Actor**: el cliente dueño de la venta, o personal (cualquier venta).

**Objetivo**: revertir una venta registrada, restituyendo el stock vendido.

**Precondiciones**: la venta existe, está en estado `registrada` (no se
puede cancelar una ya cancelada o ya enviada), y el actor tiene permiso
sobre ella (es su propia venta, o es personal).

**Pasos**:
1. El actor abre el detalle de la venta y confirma "Cancelar venta".
2. `PATCH /api/ventas/:id/cancelar`.
3. El backend abre una transacción, bloquea la fila de `Venta`
   (`LOCK.UPDATE`), verifica pertenencia y estado, recorre cada
   `DetalleVenta`, bloquea el `Producto` correspondiente y le suma de
   vuelta la cantidad vendida (verificando que no exceda el rango de
   `INTEGER`), y actualiza el estado de la venta a `cancelada`.

**Validaciones y alternativas de error**:
- Venta inexistente → `404`. No pertenece al actor (cliente) → `403`.
  Estado distinto de `registrada` → `409`.
- Restituir el stock de algún producto superaría el máximo de `INTEGER`
  (caso extremo: entró muchísima mercadería mientras la venta seguía
  registrada) → `409`, no se cancela nada, ni a medias.

**Datos leídos**: `Venta`, sus `DetalleVenta`, cada `Producto` involucrado.
**Datos modificados**: `Producto.stockActual` (suma), `Venta.estado`.

**Funciones reutilizadas**: la misma comprobación de pertenencia
(`esPropiaOPersonal`) que usan listar y ver el detalle; el mismo patrón de
transacción+bloqueo que `registrarVenta`.

**Transacción y bloqueo**: igual razón que al registrar, en sentido
inverso — si dos cancelaciones (o una cancelación y un envío) de la misma
venta llegaran a la vez, el bloqueo de la fila de `Venta` serializa ambas:
la segunda vuelve a leer el estado ya actualizado por la primera y falla
con `409` en vez de aplicarse igual.

**Pruebas que lo demuestran**: `test/ventaEntradasInvalidas.test.js`,
`test-integracion/ventaConcurrencia.integracion.js` (cancelación y
restitución exacta, rollback real después de escrituras, doble cancelación
concurrente), `e2e/recorrido-completo.spec.js` (cancelar la compra recién
confirmada, ver el estado cambiar a `cancelada` en el detalle y en "Mis
compras") — mismo estado de ejecución que en "Registrar una venta" arriba,
ver [estado-proyecto.md](estado-proyecto.md) para el resultado más
reciente.

**Ejemplo**: sobre la venta del ejemplo anterior, "Cancelar venta" → el
estado pasa a `cancelada` y el stock de "Pelota de goma resistente" vuelve
a su valor original.

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
