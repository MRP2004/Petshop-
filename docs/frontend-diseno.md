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

`src/index.css` define variables de color/espaciado/tipografía
(`--color-marca`, `--radio-borde`, `--fuente-titulo`, etc. — paleta e
identidad actuales descritas en "Ronda 1 de rediseño visual" más abajo) y
clases base reutilizables (`.boton`, `.campo`, `.tarjeta`, `.contenedor`,
`.estado-solicitud`). Cada componente/página
tiene su propio `.css` junto al `.jsx`, con reglas base para pantallas
chicas y `@media (min-width: 768px)` / `@media (min-width: 1024px)` para
adaptar a tablet (MD) y escritorio (LG) — los mismos tres breakpoints que
verifican las pruebas de extremo a extremo (ver
[frontend-pruebas.md](frontend-pruebas.md)).

## Ronda 1 de rediseño visual (identidad propia PetShop)

Reemplaza la paleta verde-azulado genérica de `InicioFront` por una
identidad propia, cálida: fondo crema `#FBF7F0`, texto marrón oscuro
`#2B2420`, verde `#3C9A6E` para acciones/precios y terracota `#D97757`
reservado exclusivamente para promociones (nunca para una acción genérica,
para que "terracota" siga significando "oferta" en toda la app). Tipografía
Baloo 2 (títulos) + Manrope (cuerpo), cargadas desde Google Fonts en
`index.html`, con la pila del sistema como resguardo si no llegan a cargar.
Todo vive en las variables de `src/index.css` (`--color-*`, `--fuente-*`),
así que cambia una sola vez y se propaga a Catálogo, Detalle de producto,
Carrito, Checkout, Mi cuenta, Ingreso/Registro y el panel sin tocar esos
archivos — es la misma mecánica de variables descrita arriba, aplicada a un
rediseño real.

**Encabezado y navegación** (`Navbar.jsx`): además de identidad/buscador/
cuenta/carrito, ahora arma dos desplegables reales (`NavDropdown.jsx`) para
"Perros" y "Gatos", cuyos ítems son las categorías que devuelve
`GET /api/categorias` combinadas con el tipo de mascota fijo del menú
(`/catalogo?mascota=perro&idCategoria=…`) — nunca una lista hardcodeada.
Soportan mouse (hover) y teclado (Enter/flechas/Escape, con foco devuelto al
botón que abrió el menú). En pantallas chicas se reemplazan por un botón de
menú (☰) que abre un panel con acordeones táctiles (`<details>`) para el
mismo contenido. Las rutas `/iniciar-sesion` y `/registro` muestran un
encabezado reducido (solo logo + "Volver a la tienda"), sin buscador,
categorías ni carrito.

**Lo que el boceto original pedía y NO se implementó, por falta de datos
reales detrás** (instrucción explícita de esta ronda: nunca armar un menú o
promesa sin contenido real):

- *"Otras especies"*: hoy `TipoMascota` solo tiene `Perro` y `Gato`
  sembrados (ver `backend/scripts/sembrarDatosDemo.js`) — ningún registro de
  peces, aves, roedores ni reptiles. Cuando se carguen esos tipos desde el
  panel, agregar sus enlaces a la navegación es un cambio de una línea (los
  desplegables ya son genéricos).
- *"Marcas"*: no existe ningún modelo de marca en el backend. `Proveedor`
  es una entidad B2B (distribuidor), no una marca de cara al público, y hoy
  solo hay uno sembrado — no alcanza para armar un menú real.
- *Nombre del usuario en el encabezado*: el payload de sesión
  (`GET /api/usuarios/perfil`, ver `usuario.service.js#generarToken`) solo
  trae `idUsuario`, `rol` e `idCliente` — ni siquiera el email, mucho menos
  el nombre del `Cliente` asociado. El encabezado sigue mostrando "Mi
  cuenta"/"Panel (rol)" en vez de inventar un nombre que el backend no
  entrega todavía.
- Barra informativa superior: dice únicamente lo que el checkout real
  ofrece hoy — envío a domicilio o retiro en sucursal, sin cargo adicional
  (`Checkout.jsx`: ninguna de las dos opciones agrega un costo de envío) —
  no un umbral de envío gratis (`"compras superiores a $40.000"`) que no
  existe en ninguna regla de negocio implementada.

**Footer**: las columnas "Comprar por mascota"/"Categorías" son enlaces
reales a los mismos filtros del catálogo (no texto suelto); "Ayuda" enlaza
solo a páginas que existen (Catálogo, Promociones, Ingresar, Crear cuenta).
No hay enlaces sociales ni newsletter: ninguno de los dos existe.

**Home** (`Home.jsx`): el hero reemplaza el recuadro vacío del boceto por
una composición propia (SVG de huella, ilustrado para esta ronda, sin
descargar nada de terceros) con dos productos reales flotando encima
(nombre, precio, imagen si el producto tiene una cargada) — mismos datos
que "Productos destacados", no una maqueta aparte. El CTA "Ofertas del mes"
solo aparece si `GET /api/promociones` devuelve al menos una promoción
activa. "Productos destacados" filtra cualquier nombre con "prueba" (p.
ej. "Alimento de prueba"): sigue apareciendo en el catálogo completo, pero
no se ofrece como vidriera de la tienda. Las "categorías rápidas" muestran
mascota (Perro/Gato, pastel) + las categorías reales del backend, todas
enlazando a filtros funcionales.

**Tarjetas de producto** (`ProductCard.jsx`): el chip "Poco stock" reutiliza
`stockMinimo`, un campo que el backend ya devolvía en el listado público
(no es un dato nuevo): mismo umbral que usa el personal para reponer
(`producto.service.js#obtenerProductosConStockBajo`). Usa `--color-peligro`
(no terracota): es un aviso de stock, no una promoción — ver corrección de
Codex abajo.

**Corrección real de contraste (Codex, ver
[estado-proyecto.md](estado-proyecto.md), "Décima corrección")**: la
revisión de esta ronda calculó contraste WCAG real (no a ojo) para los
pares de color nuevos y encontró que blanco sobre `--color-marca` da
~3.48:1 y blanco/texto sobre `--color-acento` da ~3.12:1 — ambos por debajo
de AA (4.5:1) para texto normal. Corregido: `.boton-primario` usa
`--color-marca-oscuro` (~5:1); el link "Promociones" de la navegación usa
un nuevo token `--color-acento-oscuro` (`#AE5F46`, ~4.64:1) en vez de
`--color-acento` puro. Los tokens claros (`--color-marca`,
`--color-acento`) quedan para superficies/bordes o texto sobre fondos
donde ya daban buen contraste, no para texto sobre sí mismos. También se
corrigió un hueco de hover en `NavDropdown` (el menú se cerraba solo al
bajar el mouse en línea recta desde el botón, por un `margin-top` que
dejaba una franja sin ningún elemento debajo del cursor) y un selector CSS
huérfano (`[data-abierto='true']` sin su atributo correspondiente en el
JSX).

**Verificación de esta ronda**: `npm test` (frontend, 50/50), `npm run
lint` (sin hallazgos) y `npm run build` corridos de verdad; recorrido
manual con Playwright contra el servidor de desarrollo en las tres
resoluciones (390×844, 834×1112, 1440×900) cubriendo home → búsqueda →
catálogo → detalle → carrito, encabezado reducido en ingreso/registro,
navegación por teclado en los desplegables y el menú móvil; y la suite
completa `npm run test:e2e` contra el entorno aislado `petshop_e2e`
(36/36, en las tres resoluciones configuradas), sin tocar `petshop_db`.

## Ronda 2 de rediseño visual, Etapa 1 (identidad más verde + correcciones de honestidad)

Primera etapa de un pedido más amplio (buscador predictivo, cuenta con
nombre real, dirección argentina, favoritos, avisos, estados de pedido,
marketplace — cada uno en su propia etapa). Esta etapa es puramente
visual/frontend, sin cambios de esquema.

**Paleta**: fondo `#EEF6F0` (antes `#FBF7F0`), nuevo token
`--color-fondo-suave` (`#E3F0E8`) para separar secciones sin depender de
bordes, texto `#193D2E` (antes `#2B2420` — menos marrón, más verde, pedido
explícito de esta ronda). Verde de acciones/precios y terracota de
promociones sin cambios. `--color-texto-suave` recalculado (~5.9:1 sobre
el fondo nuevo, ~6.5:1 sobre blanco).

**Corrección de honestidad — Footer**: se sacó la columna "Contacto"
(domicilio/teléfono/correo eran datos de demostración inventados desde la
ronda 1, nunca un canal real de PetShop). No se inventó reemplazo; la
columna "Ayuda" sigue cubriendo los canales reales.

**Corrección de honestidad — Home**: la etiqueta del hero pasó de "Envío a
todo el país" (afirmaba cobertura nacional sin validar) a "Retirá en
sucursal o recibí en tu domicilio" (lo que el checkout soporta hoy). El
botón "Ofertas del mes" se sacó del hero: se mostraba con que existiera
*cualquier* registro en `PromocionProducto`, sin chequear vigencia ni si
el descuento se aplica al pagar — confirmado en `venta.service.js` que
las promociones hoy son CRUD puro, sin efecto en el total de una venta.
Queda como punto de integración explícito para cuando el compañero a
cargo de promociones cablee vigencia + descuento real en el checkout; la
página `/promociones` (con su propio disclaimer) sigue accesible desde el
footer.

**Hero más completo** (pedido explícito: "no debe quedar como un gran
recuadro con una huella y dos productos sin foto"): los dos productos
destacados del hero ahora se eligen priorizando los que tengan foto real
cargada (`producto.imagen.url`) sobre los que no, en vez de tomar
ciegamente los dos primeros publicables — sigue siendo el mismo dato real,
solo reordenado, nunca una imagen de terceros. El recuadro del hero suma
dos huellas SVG decorativas más (antes había una sola, centrada) a
distinto tamaño/opacidad/rotación, más un degradé de fondo en vez de
blanco liso, para que no se lea como espacio vacío cuando ninguno de los
productos elegidos tiene foto.

**Corrección real de Codex (ver
[estado-proyecto.md](estado-proyecto.md), "Undécima corrección")**: 2
hallazgos reales sobre contraste, ambos corregidos:

1. `--color-borde` (recalculado para el fondo nuevo) no llega a 3:1 contra
   blanco/los fondos nuevos (WCAG 1.4.11, límite de un control
   interactivo) — alcanza para bordes decorativos pero no para el único
   límite visual de un input, una píldora de filtro/categoría clicable o
   un enlace del panel. Se agregó `--color-borde-interactivo` (`#4F8A6C`,
   ~3.3-4:1) para esos casos puntuales; el resto sigue con
   `--color-borde`.
2. `.navbar__boton-buscar` (botón de búsqueda de la barra) repetía el
   mismo patrón de contraste insuficiente ya corregido dos veces esta
   ronda (`background: var(--color-marca)` + blanco, ~3.48:1) — pasó a
   `--color-marca-oscuro`.

**Verificación de esta etapa**: `npm test` (50/50), `npm run lint` (sin
hallazgos), `npm run build` sin errores; recorrido manual con Playwright
contra el servidor de desarrollo en las tres resoluciones (home, catálogo,
detalle, carrito, encabezado reducido). No se re-corrió la suite E2E
completa (esta etapa no cambia ningún flujo que esos casos ejerzan de
forma distinta); se re-ejecutará al cierre de una etapa que sí toque
flujos de usuario.

## Ronda 2 de rediseño visual, Etapa 2 (buscador predictivo)

`BuscadorPredictivo.jsx` (nuevo) reemplaza el `<form>` de búsqueda que
vivía inline en `Navbar.jsx`, con el mismo placeholder/`aria-label`/botón
(los selectores de los que depende `frontend/e2e/recorrido-completo.spec.js`
no cambiaron). Sugerencias desde la primera letra
(`GET /api/productos/sugerencias?q=...`, backend nuevo y separado del
listado general que usan los compañeros del catálogo): hasta 6 productos
reales con imagen/nombre/precio, excluyendo por nombre cualquier producto
de prueba (mismo criterio que "Productos destacados" de Home). Debounce de
250ms; un contador de secuencia descarta cualquier respuesta que ya no
corresponda al texto actual.

Patrón ARIA: combobox con listbox emergente (`role="combobox"` en el
input, `aria-autocomplete`/`aria-expanded`/`aria-controls`/
`aria-activedescendant`; el `role="listbox"` contiene solo `role="option"`,
sin estados de carga/error mezclados adentro). El foco nunca sale del
`<input>` — la sugerencia "activa" se marca solo con
`aria-activedescendant`, no moviendo el foco real. Teclado: flechas sin
wrap, Escape cierra sin borrar el texto, Enter con una sugerencia activa
navega a su ficha de producto, Enter sin selección conserva el
comportamiento anterior (abre `/catalogo?buscar=...`).

**Corrección real de Codex (ver
[estado-proyecto.md](estado-proyecto.md), "Duodécima corrección")**: 3
hallazgos, los 3 corregidos — una condición de carrera real en el
descarte de respuestas viejas (el contador de secuencia se invalida ahora
apenas cambia el texto, no recién cuando dispara el debounce), comodines
de `LIKE` (`%`/`_`) sin escapar en el backend, y un patrón ARIA
incompleto/mezclado (faltaba `role="combobox"`, y el listbox tenía
estados y un `<Link>` focosable anidados). Arreglar ese último punto
(sacar el `<Link>` de cada opción) introdujo, de rebote, un bug de clic
real que encontré yo mismo al escribir la prueba correspondiente: sin un
elemento focosable dentro de la opción, el clic le sacaba el foco al
input antes de llegar, cerrando el panel a mitad de camino — resuelto con
`onMouseDown` + `preventDefault()` en el listbox (la técnica estándar para
este problema, la misma razón por la que `NavDropdown.jsx` de la ronda 1
sí usa `<Link>`s reales dentro de su menú).

## Ronda 2 de rediseño visual, Etapa 3 (nombre real, menú de cuenta, diálogos reutilizables)

**Nombre real**: `GET /api/usuarios/perfil` pasó a consultar la base
(Usuario + Cliente) en vez de devolver el payload del token — el token
sigue sin llevar nombre/email (`utils/token.js` sin cambios). `AuthContext.
jsx` no necesitó ningún cambio: el shape de `usuario` que ya manejaba
(login/perfil) ahora simplemente trae más campos.

**ConfirmDialog** (`frontend/src/components/ConfirmDialog.jsx`, nuevo):
diálogo de confirmación genérico — reemplaza los 3 `window.confirm` que
quedaban. `role="alertdialog"`, foco inicial en el botón no destructivo,
Tab/Shift+Tab atrapados dentro (`utils/atraparTab.js`, compartida con
`AjustarStockDialog`), Escape cierra salvo `cargando`, error de la acción
mostrado adentro sin cerrar el diálogo.

**AjustarStockDialog** (`frontend/src/components/AjustarStockDialog.jsx`,
nuevo): reemplaza `window.prompt`/`window.alert` de "Ajustar stock" —
stock actual + resultado en vivo antes de guardar. Se monta
condicionalmente con una `key` que cambia en cada apertura (en vez de un
efecto o una comparación de ref contra la prop anterior para resetear el
campo: el lint de este proyecto rechaza los dos patrones), así cada
apertura es una instancia de componente nueva, con su estado ya limpio.

**CuentaMenu** (`frontend/src/components/CuentaMenu.jsx`, nuevo):
desplegable de cuenta en el encabezado, mismo patrón de accesibilidad que
`NavDropdown.jsx` (mouse + teclado). Disparador: nombre real del cliente o
"Panel (rol)" para el personal. Adentro: un único destino real por rol +
"Salir" (que ahora abre un `ConfirmDialog`, no cierra sesión directo).

**Corrección real de Codex (ver
[estado-proyecto.md](estado-proyecto.md), "Decimotercera corrección")**: 2
hallazgos — falta de trampa de foco en ambos diálogos modales (Tab podía
escaparse hacia el fondo con el overlay abierto) y falta de
`aria-describedby` en `ConfirmDialog` (el mensaje con la consecuencia real
no estaba asociado al diálogo para lectores de pantalla).

**Hallazgo propio (no de Codex)**: al escribir la prueba de clic con mouse
de `CuentaMenu` encontré que el patrón "`onMouseEnter` abre + `onClick`
alterna" (heredado de `NavDropdown.jsx` de la ronda 1) se rompe con mouse:
el hover ya abre el menú antes de que el clic llegue a dispararse, y
alternar lo cierra de inmediato. Corregido en los dos componentes (el
clic ahora abre, no alterna) — es un bug real que estuvo en `NavDropdown`
desde la ronda 1 sin que ninguna prueba lo cubriera (no tenía test propio).

## Ronda 2, Etapa 4 (dirección argentina estructurada + Georef)

`DireccionForm.jsx` (nuevo): provincia (`<select>`, 24 opciones estáticas
reales) + localidad (combobox con filtro "empieza con" **local**, no
contra Georef por tecla — la API real de Georef no hace prefijo,
confirmado contra la API real antes de diseñar esto: `nombre=R`/`nombre=
Ros` en Santa Fe no encuentran "Rosario", recién con 6 letras aparece; el
backend cachea la lista completa por provincia y este componente filtra
sobre esa lista ya cargada) + calle/número (obligatorios) + piso/
indicaciones (opcionales). Mismo patrón de combobox accesible que
`BuscadorPredictivo.jsx` (role=combobox/listbox/option,
aria-activedescendant, mousedown-preventDefault para que un clic no
pierda el foco antes de tiempo).

Usado en tres lugares, sin duplicar el formulario:
- `Registro.jsx`: paso SEPARADO después de crear la cuenta (no se puede
  anidar un `<form>` dentro de otro `<form>`), con "Completar más tarde"
  como salida real — el pedido es explícito: la dirección es opcional acá.
- `MiCuenta.jsx`: nueva sección "Mi dirección" (resumen + "Editar
  dirección", o el formulario directo si todavía no hay ninguna guardada)
  — la vía real para que una cuenta ya existente complete su dirección.
- `Checkout.jsx`: el wrapper espera la dirección guardada (o `null` si
  falla/no hay ninguna — nunca bloquea el checkout) y la usa para
  PRE-LLENAR el campo de texto libre `direccionEntrega` que ya existía,
  formateada en un solo string editable. Cero cambios en la validación de
  checkout: "permitir corregir o elegir otra" se resuelve dejando ese
  texto totalmente editable, no con una lista de direcciones.

**Diseño de datos revisado con Codex ANTES de migrar** (ver
[estado-proyecto.md](estado-proyecto.md), "Decimocuarta corrección"):
tabla nueva `direccioncliente` (1 dirección por cliente, `idCliente` como
PK 1:1), cero cambios en `cliente`/`venta`/`direccionentrega`. Aprobado
con una salvedad ya resuelta: usar Georef `/localidades` (BAHRA), no
`/localidades-censales`.

**Corrección real de Codex** (revisión de la implementación): condición de
carrera en la cache de Georef (pedidos concurrentes a la misma provincia
podían disparar fetches duplicados, y uno fallar con 503 aunque el otro ya
hubiera dejado cache fresca) — corregido deduplicando en una única
promesa en vuelo; `DireccionForm` podía sugerir localidades de la
provincia anterior si fallaba la carga de la nueva — corregido
deshabilitando el campo y descartando las sugerencias mientras haya error;
falta de validación de forma en la respuesta de Georef — corregido
descartando entradas sin `id`/`nombre` reales y tratando una respuesta
malformada como fallo.

**Hallazgo propio** (verificación visual con Playwright, no de Codex):
`.campo--linea` (compartida con `Checkout.jsx`) nunca ponía calle/número
en fila de verdad — bug real de la ronda de CU-04, arrastrado sin notar
hasta esta verificación. Corregido con `flex-direction: row` explícito.

## Ronda 2, Etapa 5 (favoritos)

Tabla nueva `favorito` (gratis vía `sync()`: `idCliente`+`idProducto` con
índice único compuesto — sin ninguna revisión de esquema previa a migrar,
a diferencia de la Etapa 4: es de bajo riesgo, una tabla nueva sin tocar
ninguna existente). Backend: `GET/POST /api/favoritos`,
`DELETE /api/favoritos/:idProducto`, siempre sobre el `idCliente` de la
sesión (mismo criterio "nunca por :id ni por el cuerpo" que
`/api/clientes/direccion`). Agregar un favorito repetido o quitar uno que
ya no está son operaciones idempotentes (`findOrCreate`/`destroy` sin
error), la garantía real anti-duplicado es el índice único, no solo la
capa de aplicación.

**`FavoritosContext`** (`frontend/src/context/FavoritosContext.jsx`,
nuevo): a diferencia del carrito (estado local en `localStorage`, sin
dueño, previo a la compra), los favoritos son datos propios del cliente —
se guardan en el backend, no en el navegador, para persistir entre
dispositivos. Se recargan cada vez que cambia de cliente (login/logout, o
alternar entre una cuenta de cliente y una de personal) y se vacían sin
llamar a la API cuando no hay cliente logueado. `alternarFavorito` es
optimista (refleja el cambio antes de que responda el servidor) con
reversión automática si el backend rechaza el pedido.

**`BotonFavorito`** (`frontend/src/components/BotonFavorito.jsx`, nuevo):
toggle reutilizable (corazón lleno/vacío), usado en `ProductCard` (sobre
la imagen) y en `ProductoDetalle` (junto al título). Sin sesión de
cliente queda deshabilitado, con `aria-label`/`title` explicando por qué,
en vez de desaparecer — el pedido de esta etapa pide explícitamente ese
estado, no ocultarlo. Mientras haya un pedido pendiente para ESE producto
(agregar o quitar todavía en vuelo), también queda deshabilitado — ver
"Corrección real de Codex" más abajo.

**`Favoritos.jsx`** (página nueva, ruta `/mis-favoritos`, protegida para
rol `cliente`): reutiliza `ProductCard` y la misma grilla del catálogo —
no es una vista nueva, es el mismo listado filtrado por lo que el cliente
marcó. Acceso desde `CuentaMenu` y desde un enlace en `MiCuenta`.

**`CuentaMenu` generalizado**: el prop único `enlace` pasó a ser un
arreglo `enlaces` (ahora "Mi cuenta" + "Mis favoritos" para clientes,
"Ir al panel" para personal), con navegación por teclado (flechas/Escape)
que funciona igual con 1 o con N ítems + "Salir" al final — se actualizó
`CuentaMenu.test.jsx` en el mismo paso, agregando casos con dos ítems.

**Corrección real de Codex** (revisión de la implementación, ver
[estado-proyecto.md](estado-proyecto.md), "Decimoquinta corrección"): 4
hallazgos, los 4 corregidos — favoritos "filtrados" entre cuentas si un
cliente cerraba sesión y otro iniciaba sesión SIN recargar la SPA (el
efecto de `FavoritosContext` solo dependía de `esCliente`, no de QUÉ
cliente; ahora también depende de `usuario?.idCliente` y limpia la lista
antes de pedir la nueva); condición de carrera real en el toggle
optimista sobre el MISMO producto (dos clics rápidos —agregar y quitar—
podían resolverse en cualquier orden y dejar la UI desincronizada del
servidor de forma persistente; ahora un producto con un pedido en curso
ignora un nuevo toggle hasta que termina); `eliminarProducto` podía
fallar por la FK de `favorito` aunque el producto no tuviera ninguna
venta (mismo criterio que ya existía para `ImagenProducto`: un favorito
no es un dato de negocio que deba bloquear el borrado — corregido
borrándolos primero, dentro de la misma transacción); y controles
interactivos anidados (`ProductCard` tenía dos `<button>` dentro de un
único `<Link>`, HTML inválido) — corregido separando el `<Link>`
(imagen+nombre+precio+stock) de los botones ("Agregar al carrito" y
favorito, ahora hermanos del enlace, no anidados adentro).

**Hallazgo real de lint (no de Codex) al escribir `manejarTeclaItem`**:
una función currificada (`(indice) => (evento) => ...`) invocada
directamente en el JSX (`onKeyDown={manejarTeclaItem(indice)}`) dispara
`react-hooks/refs` ("Cannot access refs during render"), aunque la lectura
real de `.current` está diferida al cierre devuelto — el linter no
distingue esto de una lectura real en render. Corregido envolviendo la
llamada en una arrow function inline (`onKeyDown={(evento) =>
manejarTeclaItem(evento, indice)}`), que solo crea una closure durante el
render sin invocar nada todavía.

**Hallazgo real de E2E (no de Codex)**: agregar `BotonFavorito` a
`ProductCard` rompió un selector de `capturas.spec.js` que asumía un solo
`<button>` por tarjeta (`'.product-card').first().locator('button')`,
ahora resuelve a dos). Corregido apuntando al botón específico por su
nombre accesible (`getByRole('button', { name: 'Agregar al carrito 🛒' })`).

## Ronda 2, Etapa 6 (avisos in-app)

Tabla nueva `aviso` (gratis vía `sync()`): `idUsuario` destinatario,
`tipo`, `mensaje`, `enlace` opcional, `leido`. Generados por el backend en
5 puntos reales, siempre dentro de la MISMA transacción que la acción que
los origina — ver [estado-proyecto.md](estado-proyecto.md),
"Decimosexta corrección" para el detalle completo de cada uno.

**`AvisosContext`** (`frontend/src/context/AvisosContext.jsx`, nuevo): a
diferencia de `FavoritosContext` (solo `cliente`), acá cualquier rol
autenticado tiene sus propios avisos — el personal recibe "nueva
solicitud de cancelación", los clientes reciben el resto. Recarga cuando
cambia `usuario?.idUsuario` (no solo cuando cambia si hay sesión o no):
esta vez el criterio correcto se aplicó desde el principio, en vez de
repetir el hallazgo real de Codex sobre `FavoritosContext` en la Etapa 5.
Un polling simple cada 30 segundos mientras hay sesión mantiene el
contador actualizado sin necesitar WebSocket.

**`Campana`** (`frontend/src/components/Campana.jsx`, nuevo): campana con
contador de no leídos en el `Navbar`, panel desplegable con la lista de
avisos (más reciente primero), cada uno con su fecha. Un aviso con enlace
es un `<Link>` real: al hacer clic, navega Y lo marca como leído en el
mismo gesto. "Marcar todas como leídas" en el encabezado del panel.

**Corrección real de Codex** (revisión de la implementación): `Escape`
solo se manejaba en el botón de la campana, no en el panel ni en sus
ítems internos — tabular hacia un aviso y presionar Escape no cerraba
nada. Corregido moviendo el manejo de Escape al contenedor completo (el
evento burbujea desde cualquier hijo hasta ahí), que también devuelve el
foco al botón al cerrar.

## Ronda 2, Etapa 7 (estados de pedido: retiro vs. envío)

`venta.estado` pasó de 3 a 5 valores posibles (`registrada`, `cancelada`,
`enviada`, `lista_para_retirar`, `entregada` — ver
[estado-proyecto.md](estado-proyecto.md), "Decimoséptima corrección" para
el diseño de esquema revisado con Codex antes de migrar). El personal ve
un botón distinto según `estado`+`metodoEntrega` en `VentaDetalle.jsx`:
"Marcar lista para retirar" (retiro en sucursal) o "Marcar como enviada"
(envío a domicilio, o una venta legada sin este campo) cuando la venta
está `registrada`; "Marcar como entregada" cuando está `enviada` o
`lista_para_retirar`; ninguna acción de transición cuando ya está
`entregada`/`cancelada`.

**`etiquetaEstadoVenta`** (nueva en `frontend/src/utils/estadosLegibles.js`,
mismo archivo que ya tenía `etiquetaEstadoPago`/`etiquetaEstadoCorreo`,
mismo patrón de "copia sincronizada con el equivalente del backend"):
`VentaDetalle.jsx` dejó de mostrar el ENUM crudo (`registrada` en vez de
"Registrada") y `MiCuenta.jsx` reemplazó su propio mapa de etiquetas
duplicado por este import compartido — una sola fuente de verdad en vez
de tres copias divergentes (backend, `MiCuenta.jsx`, `VentaDetalle.jsx`
sin ninguna).

**Hallazgo real de E2E (no de Codex)**: una prueba existente cargaba una
venta manual desde el panel (que arranca en "retiro en sucursal" por
defecto) y esperaba el botón viejo "Marcar como enviada" — sin darse
cuenta, esa prueba verificaba el defecto exacto que esta etapa corrige.
Se actualizó para reflejar el recorrido correcto: registrada → lista
para retirar → entregada.

## Ronda 2, Etapa 8 (marketplace de vendedores independientes)

Un cuarto rol, `vendedor_independiente`, distinto de `vendedor` (personal
interno con acceso global, sin cambios) — conserva `idCliente` (sigue
siendo comprador: checkout, favoritos, mis compras funcionan igual que
para cualquier `cliente`) y suma `idTienda`. `AuthContext` expone
`esVendedorIndependiente` y `esComprador` (`cliente` O
`vendedor_independiente`) — `esPersonal` sigue significando exclusivamente
personal interno.

**`/panel` compartido, menú completamente distinto**: `PanelLayout.jsx`
muestra "Mi tienda"/"Mis ventas" para un vendedor independiente en vez del
menú completo de gestión interna (Clientes, Proveedores, Medios de pago,
etc.) — cada sección interna sigue exigiendo su propio rol explícito en
`App.jsx` (un vendedor independiente que entra por URL directa a
`/panel/clientes` queda afuera igual, el backend la bloquea de todas
formas). `PanelIndice.jsx` decide qué mostrar en la ruta índice según el
rol. `Navbar.jsx` deja de mostrar buscador/carrito/categorías dentro de
`/panel` — antes se compartían sin distinción con el sitio público
(pedido explícito de esta etapa, confirmado leyendo `App.jsx`/
`PanelLayout.jsx` antes de tocar nada).

**"Quiero ser vendedor"** (`SolicitudVendedor.jsx`, solo `cliente`): CUIL
(persona física) o CUIT (empresa, + razón social), con una nota explícita
de que solo se valida formato y dígito verificador, no existencia fiscal
real. `PanelSolicitudesVendedor.jsx` (admin, aprobar/rechazar con
`ConfirmDialog`) y `PanelTiendas.jsx` (admin, suspender/reactivar) siguen
el mismo patrón que el resto del panel.

**`PanelMiTienda.jsx`**: reutiliza `GestionEntidad` (el mismo componente
genérico que el panel interno) con un `servicio` mixto — listar trae SOLO
los productos de esta tienda (`GET /api/tiendas/propia/productos`), pero
crear/editar/eliminar/ajustar stock son los MISMOS endpoints de
`/api/productos` que ya usa el personal interno (la autorización real por
tienda vive en el backend, no acá). **`PanelMisVentas.jsx`** muestra el
DTO sanitizado que arma el backend — nunca el total real de la compra, el
medio de pago, el comprobante ni la dirección completa (ver
[estado-proyecto.md](estado-proyecto.md), "Decimoctava corrección": este
fue uno de los dos cambios que Codex exigió antes de aprobar el diseño).

**Catálogo/detalle de producto**: badge "Vendido por: X" cuando el
producto tiene tienda (`ProductCard.jsx`/`ProductoDetalle.jsx`) — nada se
muestra para el catálogo propio de PetShop.

## Componentes reutilizables

| Componente | Uso |
|---|---|
| `ProductCard` | Tarjeta de producto (Home, Catálogo, Promociones, Favoritos), incluye `BotonFavorito`. |
| `BotonFavorito` | Toggle de favorito reutilizable (`ProductCard`, `ProductoDetalle`). |
| `CuentaMenu` | Desplegable accesible de cuenta (nombre real/"Panel (rol)" + destinos reales por rol + "Salir" con confirmación). |
| `Campana` | Notificaciones in-app: contador de no leídos + panel desplegable con la lista. |
| `CategoryItem` | Botón de filtro por categoría (Home, Catálogo). |
| `NavDropdown` | Desplegable accesible (mouse + teclado) para "Perros"/"Gatos" en `Navbar`, armado con categorías reales. |
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
