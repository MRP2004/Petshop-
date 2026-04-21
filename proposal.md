# Propuesta TP DSW

## Grupo
### Integrantes
* 52167 – Pérez, Mauro
* 50269 – Leandro Carrión Lescano
* 52243 – Paz, José
* 48170 – Natalicchio, Oriana


### Repositorios
* [frontend app](http://hyperlinkToGihubOrGitlab)
* [backend app](http://hyperlinkToGihubOrGitlab)
*Nota*: si utiliza un monorepo indicar un solo link con fullstack app.

## Tema
### Descripción
Sistema web orientado a la gestión de productos para mascotas, clientes y ventas. Permite administrar el stock, registrar ventas asociadas opcionalmente a mascotas de los clientes y consultar historiales de consumo, mejorando la organización y control del negocio.

### Modelo
![Modelo de Dominio](https://acortar.link/3VJe85)

## Alcance Funcional 

### Alcance Mínimo

Regularidad:
|Req|Detalle|
|:-|:-|
|CRUD simple|1. CRUD TipoCategoria<br>2. CRUD TipoMascota<br>3. CRUD MedioPago<br>4. CRUD Cliente|
|CRUD dependiente|1. CRUD Producto {depende de} CRUD Categoría y CRUD TipoMascota<br>2. CRUD Mascota {depende de} CRUD Cliente y CRUD TipoMascota|
|Gestión|1. Registrar Venta {depende de} CRUD Cliente, CRUD MedioPago y CRUD Producto<br>&nbsp;&nbsp;&nbsp;- Permite asociar opcionalmente una mascota del cliente<br>&nbsp;&nbsp;&nbsp;- Incluye uno o varios Detalles de Venta, donde se especifican productos, cantidades y precios unitarios|
|Listado<br>+<br>detalle|1. Listado de productos filtrado por categoría o tipo de mascota, muestra nombre, precio y stock ⇒ detalle muestra información completa del producto<br>2. Listado de ventas filtrado por cliente o mascota, muestra fecha, cliente, mascota y total ⇒ detalle muestra información completa de la venta y productos asociados|
|CUU/Epic|1. Registrar una venta de productos para un cliente, pudiendo asociarla opcionalmente a una de sus mascotas<br>2. Actualizar automáticamente el stock de productos luego de una venta<br>3. Validar stock disponible antes de confirmar una venta|


Adicionales para Aprobación
|Req|Detalle|
|:-|:-|
|Funcionalidades|1. Cancelar una venta registrada, actualizando su estado y restaurando el stock de los productos involucrados<br>2. Consultar historial de compras de un cliente<br>3. Consultar historial de compras de una mascota|
|CUU/Epic|1. Visualizar detalle completo de ventas con productos asociados|


### Alcance Adicional Voluntario

*Nota*: El Alcance Adicional Voluntario es opcional, pero ayuda a que la funcionalidad del sistema esté completa y será considerado en la nota en función de su complejidad y esfuerzo.

|Req|Detalle|
|:-|:-|
|Listados |1. Listado de productos con stock por debajo del mínimo definido|
|CUU/Epic|1. Consultar productos recomendados según el tipo de mascota|
|Otros|1. Visualización de alertas de stock bajo en productos|
