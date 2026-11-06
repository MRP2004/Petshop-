# Propuesta TP DSW

## Grupo
### Integrantes
* 52167 – Pérez, Mauro
* 50269 – Carrión Lescano, Leandro
* 52243 – Paz, José


### Repositorios
* [monorepo](http://hyperlinkToGihubOrGitlab)

## Tema
### Descripción
Sistema web orientado a la gestión de productos para mascotas, clientes y ventas. Permite administrar el stock, registrar ventas y consultar historiales de consumo, mejorando la organización y control del negocio. 

### Modelo
![Modelo de Dominio](docs/Petshop_MD_v2.png)


## Alcance Funcional 

### Alcance Mínimo

Regularidad:
|Req|Detalle|
|:-|:-|
|CRUD simple|1. CRUD Cliente<br>2. CRUD Proveedor<br>3. CRUD Producto<br> 4. CRUD TipoMascota|
|CRUD dependiente|1. CRUD Producto {depende de} CRUD Categoría y CRUD TipoMascota<br>2. CRUD PromocionProducto {depende de} CRUD Producto |
|Listado<br>+<br>detalle|1. Listado de productos filtrado por Categoría o TipoMascota, muestra nombre, precio y stock ⇒ detalle muestra información completa del producto<br>2. Listado de ventas filtrado por cliente o proveedor, muestra fecha, cliente, estado y total ⇒ detalle muestra información completa de la venta y productos asociados|
|CUU/Epic|1. Registrar una venta.<br>2. Cancelar una venta.


Adicionales para Aprobación
|Req|Detalle|
|:-|:-|
|CRUD|1. CRUD Cliente<br>2. CRUD Proveedor<br>3. CRUD Producto<br> 4. CRUD TipoMascota<br>5. CRUD Categoria<br>6. CRUD MedioPago<br>7. CRUD PromocionProducto|
|CUU/Epic|1. Registrar una venta. Ya sea mediante la compra online del cliente o mediante una venta cargada por personal.<br>2. Cancelar una venta. Mediante solicitud del cliente y resolución del personal.<br>3. Marcar como enviada una venta que corresponda a envío a domicilio.<br>4. Integración de sistema de pago. Pasarela de prueba a través de Checkout de Mercado Pago.|


### Alcance Adicional Voluntario

*Nota*: El Alcance Adicional Voluntario es opcional, pero ayuda a que la funcionalidad del sistema esté completa y será considerado en la nota en función de su complejidad y esfuerzo.

|Req|Detalle|
|:-|:-|
|Listados |1. Listado de productos con stock por debajo del mínimo definido|
|CUU/Epic|1. Administrar productos favoritos del cliente: agregarlos, quitarlos y consultar la lista<br>2. Administrar una tienda de vendedor independiente: solicitar el alta, publicar productos y consultar las ventas asociadas a su tienda<br>3. Generar pdf de Comprobante de compra y envío al correo del cliente|
|Otros|1. Visualización de alertas de stock bajo en productos<br> 2. Enviar recordatorio de pedido no pagado luego de un determinado tiempo|
