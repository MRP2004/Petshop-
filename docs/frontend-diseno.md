# Diseño del frontend

## Referencia visual

[Chewy](https://www.chewy.com/) se usó como referencia de **navegación y
recorrido de compra**, no de identidad visual: jerarquía de navegación
(marca + buscador + accesos rápidos en la barra superior, una segunda fila
de accesos por categoría/tipo de mascota debajo), organización del catálogo
en tarjetas de producto, y el recorrido catálogo → detalle → carrito →
confirmación. La marca, los textos, los precios (pesos argentinos) y las
imágenes son propios de PetShop; no se copió ningún activo gráfico de
Chewy.

## Punto de partida: rama `InicioFront`

El frontend arrancó con un boceto de la compañera Oriana en la rama
`InicioFront` (commit `c69a4e9`, "hicimos la pagina principal"):
`Navbar`, `Footer`, `ProductCard`, `Home` con estilos inline y datos
hardcodeados, y `categoryItem.jsx` vacío. Esa rama no estaba integrada a
`feature/backend-inicial` (que tenía el scaffold por defecto de Vite). Se
trajeron esos archivos a esta rama (mismo layout, paleta de color
`#0ca678`/verde-azulado y estructura de secciones) y se reescribieron con
clases CSS mobile-first en lugar de estilos inline (los estilos inline no
pueden llevar `@media`), conectados a la API real en vez de a datos de
ejemplo, y con `categoryItem.jsx` implementado como componente de filtro
reutilizable.

## Sistema de diseño mobile-first

`src/index.css` define variables de color/espaciado (`--color-marca`,
`--radio-borde`, etc.) y clases base reutilizables (`.boton`, `.campo`,
`.tarjeta`, `.contenedor`, `.estado-solicitud`). Cada componente/página
tiene su propio `.css` junto al `.jsx`, con reglas base para pantallas
chicas y `@media (min-width: 768px)` / `@media (min-width: 1024px)` para
adaptar a tablet (MD) y escritorio (LG) — los mismos tres breakpoints que
verifican las pruebas de extremo a extremo (ver
[frontend-pruebas.md](frontend-pruebas.md)).

## Componentes reutilizables

| Componente | Uso |
|---|---|
| `ProductCard` | Tarjeta de producto (Home, Catálogo, Promociones). |
| `CategoryItem` | Botón de filtro por categoría (Home, Catálogo). |
| `EstadoCarga` / `EstadoError` / `EstadoVacio` | Los tres estados de cualquier pantalla que depende de la API. |
| `GestionEntidad` | Tabla + formulario de alta/edición genéricos, parametrizados por entidad: lo usan las 6 pantallas de gestión del panel (clientes, proveedores, categorías, tipos de mascota, medios de pago, productos) y promociones, en vez de reescribir la misma tabla+formulario 7 veces. |
| `RutaProtegida` | Guarda de rutas por rol (ver [backend-autenticacion.md](backend-autenticacion.md): es solo UX, la autorización real la hace el backend). |
| `useCargaDatos` (hook) | Patrón repetido de pedir datos a la API y llevar cargando/error/datos/reintentar. |
| `Carrito` / `ItemCarrito` (`src/models/Carrito.js`) | Clases que modelan el carrito de compras: inmutables, encapsulan sus propias reglas (no duplicar líneas, calcular subtotales/total). Es el patrón de diseño orientado a objetos del frontend, con pruebas unitarias propias (`Carrito.test.js`). |

## Servicios (`src/api/`)

Un módulo por entidad (`productos.api.js`, `ventas.api.js`, etc.), todos
sobre un único cliente HTTP (`httpClient.js`) que centraliza la URL base, la
sesión y la traducción de errores del backend a mensajes legibles.
`crudGenerico.js` genera las cinco operaciones estándar
(listar/obtener/crear/actualizar/eliminar) una sola vez, para las entidades
que no necesitan nada especial.

**Corrección de esta etapa — sesión por cookies, no localStorage**: antes,
el frontend guardaba el JWT en `localStorage` y lo mandaba como
`Authorization: Bearer`. Ahora la sesión vive en una cookie HttpOnly que el
frontend nunca lee (ver [backend-autenticacion.md](backend-autenticacion.md)):
`httpClient.js` solo manda `credentials: 'include'` en cada pedido y agrega
el header `X-CSRF-Token` (leído de una segunda cookie, esa sí legible) en
las solicitudes que cambian estado. `AuthContext` ya no decodifica ningún
token: al cargar la página, pregunta "quién soy" con
`GET /api/usuarios/perfil`, y mientras espera esa respuesta
(`cargandoSesion`), `RutaProtegida` muestra un estado de carga en vez de
decidir de una vez si redirige a "Iniciar sesión" (evitaría un salto de
pantalla para quien sí tiene sesión válida).

## Imágenes de producto

No se fabricó ninguna foto de producto (seguiría siendo un dato inventado).
Lo que se agregó en esta corrección es la **capacidad** de cargar una real:
el panel de productos (`PanelProductos.jsx`) tiene un campo opcional "URL
de imagen" — el personal puede pegar ahí el enlace a una foto real que ya
publique un proveedor, por ejemplo — que el backend valida (debe empezar
con `http://` o `https://`, hasta 300 caracteres,
`producto.service.js#prepararUrlImagen`) y persiste en una tabla nueva
relacionada (`imagenproducto`, ver
[backend-base-de-datos.md](backend-base-de-datos.md)), no en el modelo
`Producto` en sí.

`ImagenProducto.jsx` (componente compartido por `ProductCard` y
`ProductoDetalle`) decide qué mostrar, en este orden:

1. Si el producto tiene una URL de imagen cargada, se muestra esa imagen.
2. Si no tiene ninguna, **o si la URL cargada deja de cargar** (enlace
   roto, servidor externo caído — un estado que antes no se contemplaba:
   antes de esta corrección no existía ninguna imagen real, así que este
   caso no podía darse), cae al ícono por categoría
   (`src/utils/iconoProducto.js`: 🍖 alimento, 🎾 juguetes, 🧴 higiene, 🐾
   por defecto) que ya existía como alternativa — se distingue visualmente
   por tipo en vez de un mismo ícono genérico para cualquier producto, más
   parecido a cómo Chewy separa sus secciones.

Como no hay fotos reales cargadas en los datos de demostración actuales,
el catálogo sigue mostrando íconos por categoría en la práctica hasta que
alguien cargue una URL real desde el panel — la diferencia de esta
corrección es que ahora existe cómo hacerlo, sin inventar ninguna imagen.

## Manejo de eventos, errores y estado

- Eventos de usuario: formularios controlados (`onChange`/`onSubmit`),
  clics (agregar al carrito, cancelar venta, marcar como enviada),
  búsqueda.
- Errores: cada pantalla que depende de la API maneja el estado de error
  explícitamente (`EstadoError`, con reintentar) en vez de dejar que una
  falla de red rompa la interfaz sin avisar.
- Reactividad: `AuthContext` y `CarritoContext` son la fuente de verdad
  compartida (sesión y carrito); cualquier componente que los consume se
  actualiza automáticamente cuando cambian (ver la prueba de `ProductCard`
  que verifica esto).

## Lo que no se hizo (a propósito)

- No se muestran reseñas, estrellas ni "productos recomendados" con datos
  inventados: esos requisitos (voluntario) no están implementados.
- No se calcula ni se muestra un precio con descuento de promoción
  aplicado: ver [estado-proyecto.md](estado-proyecto.md).
- No hay pasarela de pago: elegir un medio de pago no implica que se haya
  cobrado nada, solo registra la venta con ese medio.
