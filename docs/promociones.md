# Promociones

## Reglas de negocio

- `PromocionProducto.descuento` es un porcentaje entre 1 y 100, con hasta dos
  decimales.
- Una promoción corresponde a un único producto. Su categoría se obtiene del
  producto; la promoción no guarda `idCategoria`.
- Las fechas son días calendario completos, ambas inclusive, según
  `America/Argentina/Buenos_Aires`.
- Un mismo producto no puede tener promociones con períodos que se solapen.
  Una promoción que termina el 10 y otra que empieza el 11 no se solapan.
- La página pública muestra solo promociones vigentes. El panel administrativo
  muestra todas para permitir editar promociones futuras y vencidas.
- La promoción reduce primero el precio unitario del producto. En una venta
  manual, el descuento manual (un importe en pesos) se resta después del
  subtotal ya reducido por promociones.
- Tanto el checkout de clientes como las ventas manuales del personal aplican
  las promociones vigentes.

## Cálculo del precio

`cotizacion.service.js#cotizar` es el cálculo común de precios de ambos tipos
de venta. Para cada producto, `proveedorPrecioConPromocion.service.js` busca
la promoción activa para el mismo día local. Si no hay ninguna, devuelve el
precio de lista sin cambios. Si hay una, calcula el descuento unitario y el
precio final en centavos enteros.

El descuento monetario se redondea al centavo más cercano, con los medios
centavos hacia arriba. Por ejemplo, con precio de lista de `$10,00` y una
promoción del `12,5%`, el descuento es `$1,25` y el precio final `$8,75`.
Después se multiplica el precio final unitario por la cantidad.

La confirmación del checkout vuelve a cotizar dentro de su transacción; el
precio enviado por el navegador no es autoritativo. La venta manual también
vuelve a cotizar dentro de su transacción. En ella, el campo `Venta.descuento`
continúa representando solamente el descuento manual, aplicado después de
sumar los subtotales promocionados.

## Historial de venta

Cuando una línea tiene promoción, `detalleventapromocion` conserva el nombre
del producto, precio de lista, promoción, porcentaje y monto descontado al
momento de vender. El precio unitario y subtotal de `detalleventa` guardan el
precio ya promocionado. Así, cambiar o borrar una promoción no altera ventas
anteriores ni sus comprobantes.

## Administración y simultaneidad

Al crear o editar una promoción, el servicio bloquea la fila del producto
dentro de una transacción antes de buscar períodos coincidentes. Esto hace que
dos altas concurrentes para el mismo producto no puedan aprobar ambas una
superposición. El cálculo de una venta bloquea el producto antes de leer su
promoción, por lo que una edición de promoción y una venta simultáneas quedan
serializadas para ese producto.

Si por datos preexistentes hubiera más de una promoción vigente para un mismo
producto, el cálculo falla explícitamente en vez de escoger una al azar.

## Base de datos existente

`sequelize.sync()` no elimina columnas obsoletas. Para quitar `idCategoria`
de `promocionproducto`, respaldá la base y seguí la sección “Migración
adicional de promociones” de [actualizacion-base-existente.md](./actualizacion-base-existente.md).
