# Contrato de API del backend

Base: `http://localhost:PORT/api` (`PORT` según `.env`). Todas las
respuestas de error tienen la forma `{ "error": "mensaje" }`.

## `GET /api/health`

Público, sin autenticación. `{ status: "ok", message: "...", entorno }`.
`entorno` (agregado en esta corrección) es `"desarrollo"` si la variable
`ENTORNO` no está definida, o su valor literal si lo está (`"e2e"` en
`backend/.env.e2e`) — no es un secreto, solo identifica contra qué
configuración corre esa instancia. Lo usa
`frontend/e2e/globalSetupAislamiento.js` para confirmar, antes de correr
cualquier prueba E2E, que el backend en el puerto configurado es de verdad
la instancia aislada y no la de desarrollo (ver
[frontend-pruebas.md](frontend-pruebas.md)).

## Autenticación

Ver [backend-autenticacion.md](backend-autenticacion.md) para el detalle
completo (roles, matriz de permisos, usuarios de prueba). Resumen rápido:

- `POST /api/usuarios/registro` — público, crea Cliente + Usuario (rol
  `cliente` siempre). Limitado a 5 solicitudes por hora por IP+email.
- `POST /api/usuarios/login` — público, devuelve `{ usuario, csrfToken }` y
  deja la sesión en una cookie HttpOnly (el JWT **no** viaja en el cuerpo).
  Limitado a 8 intentos cada 15 minutos por IP+email.
- `POST /api/usuarios/logout` — limpia la sesión (cookies).
- `GET /api/usuarios/perfil` — requiere sesión, devuelve lo codificado en el
  token (`{ idUsuario, rol, idCliente }`).
- `POST /api/usuarios` — requiere rol `administrador`, crea cuentas
  `vendedor`/`administrador`.
- La sesión viaja por cookie (navegador) o `Authorization: Bearer <token>`
  (scripts/herramientas). Sin sesión: `401 { "error": "Se requiere iniciar sesión" }`.
  Con sesión pero sin el rol necesario: `403 { "error": "No tiene permisos para realizar esta acción" }`.
  Solicitudes que cambian estado (`POST`/`PUT`/`PATCH`/`DELETE`) autenticadas
  por cookie exigen además el header `X-CSRF-Token` (ver
  [backend-autenticacion.md](backend-autenticacion.md)): sin él, o si no
  coincide, `403 { "error": "Token CSRF inválido o ausente" }`.

## Productos

| Ruta | Acceso | Notas |
|---|---|---|
| `GET /api/productos` | Público | Acepta `?idCategoria=` y/o `?idTipoMascota=` (filtro, no búsqueda de texto). |
| `GET /api/productos/:id` | Público | |
| `GET /api/productos/stock-bajo` | `vendedor`/`administrador` | Productos con `stockActual < stockMinimo` (alcance voluntario). |
| `POST /api/productos` | `vendedor`/`administrador` | `stockActual` es el stock inicial. |
| `PUT /api/productos/:id` | `vendedor`/`administrador` | Si el cuerpo incluye la clave `stockActual` (cualquier valor), responde `400 { "error": "El stock no se modifica por esta vía: use PATCH /api/productos/:id/stock" }`. |
| `DELETE /api/productos/:id` | `vendedor`/`administrador` | |
| `PATCH /api/productos/:id/stock` | `vendedor`/`administrador` | Único endpoint habilitado para cambiar `stockActual` de un producto existente. |

**`urlImagen` (opcional, `POST`/`PUT`, corrección de esta etapa)**: si se
manda, debe ser una cadena que empiece con `http://` o `https://` (hasta
300 caracteres) — cualquier otra cosa responde `400`. Se persiste en una
tabla relacionada (`imagenproducto`, ver
[backend-base-de-datos.md](backend-base-de-datos.md)), no como columna de
`producto`. Mandar una cadena vacía en un `PUT` **borra** la imagen ya
cargada (mismo criterio que el resto de los campos opcionales del
formulario: el valor actual del cuerpo siempre reemplaza al anterior, no
es un parche disperso). La respuesta de cualquier endpoint que devuelva un
producto incluye `imagen: { idProducto, url } | null`.

**`PATCH /api/productos/:id/stock`** — cuerpo `{ "cantidad": 5 }`:
`cantidad` es un **delta entero** (no un valor absoluto), positivo para una
entrada de mercadería y negativo para un ajuste/corrección; distinto de
cero y dentro del rango de `INTEGER` firmado. Si el resultado sería negativo
o fuera de rango: `409 { "error": "El movimiento dejaría el stock en un valor inválido (negativo o fuera de rango)" }`.
Usa el mismo bloqueo de fila (`LOCK.UPDATE`) que `registrarVenta`/
`cancelarVenta`, así que es seguro frente a una venta concurrente sobre el
mismo producto.

## Categorías, tipos de mascota, medios de pago

`GET` (listado y `/:id`) es público (navegación/catálogo/checkout); crear,
editar y borrar requieren `vendedor`/`administrador`. Mismas rutas que
antes: `/api/categorias`, `/api/tipos-mascota`, `/api/medios-pago`.

## Proveedores y clientes

`GET`/`POST`/`PUT`/`DELETE /api/proveedores` — todo requiere
`vendedor`/`administrador` (información interna del negocio, no de
navegación pública).

`GET /api/clientes` (listado completo) y `POST`/`DELETE /api/clientes/:id`
requieren `vendedor`/`administrador`. `GET`/`PUT /api/clientes/:id` los
puede usar también el propio cliente autenticado, solo sobre su propio
`idCliente` (comparado contra el del token); sobre cualquier otro id
responde `403`. El alta de un cliente **con cuenta propia** no se hace por
`POST /api/clientes` sino por `POST /api/usuarios/registro` (crea ambos
juntos); este endpoint sirve para que el personal cargue/edite clientes.

## Ventas

| Ruta | Acceso |
|---|---|
| `GET /api/ventas` | Cualquier sesión. Un `cliente` ve solo las suyas (el backend fuerza el filtro, ignora `?idCliente=`/`?idProveedor=` de la query). Personal ve todas y puede filtrar con `?idCliente=` y/o `?idProveedor=`. |
| `GET /api/ventas/:id` | Cualquier sesión. `403` si un cliente pide una venta que no es suya. |
| `POST /api/ventas` | Cualquier sesión. Si es `cliente`, `idCliente` se ignora en el cuerpo y se usa el de la sesión (no se puede comprar "como" otro cliente). Si es personal, `idCliente` sí viene del cuerpo (venta manual). |
| `PATCH /api/ventas/:id/cancelar` | Cualquier sesión, mismas reglas de pertenencia que ver el detalle. |
| `PATCH /api/ventas/:id/enviar` | Solo `vendedor`/`administrador`. |

**Filtro `?idProveedor=` en `GET /api/ventas`**: interpretación propuesta,
pendiente de confirmación (`Venta` no tiene relación directa con
`Proveedor`): devuelve las ventas que incluyen al menos un producto de ese
proveedor. Ver [estado-proyecto.md](estado-proyecto.md).

**`PATCH /api/ventas/:id/cancelar`**, caso de conflicto adicional: si
restituir el stock de un producto superaría el rango de `INTEGER` firmado,
la cancelación completa se rechaza (`409`) sin dejar nada a medio aplicar:
```
409 { "error": "Restituir el stock del producto <nombre> superaría el máximo permitido" }
```

### `descuento` y `minimoMayorista`: solo personal

Corrección crítica de esta etapa (ver
[backend-autenticacion.md](backend-autenticacion.md)): si el body de
`POST /api/ventas` incluye `descuento` o `minimoMayorista` y quien compra
tiene rol `cliente`, **se ignoran por completo** (la venta se registra al
precio de lista, sin error). Antes se aplicaban igual, permitiendo que un
cliente se autodescontara cualquier monto. Personal sí puede fijarlos
(venta manual).

### `metodoEntrega` y `direccionEntrega`

`metodoEntrega` acepta exactamente dos valores: `"retiro en sucursal"` o
`"envío a domicilio"` (cualquier otro valor responde `400`). Cuando es
`"envío a domicilio"`, `direccionEntrega` es **obligatoria** (cadena de
texto, 8 a 200 caracteres); sin ella, o demasiado corta, la venta completa
se rechaza (`400`) — no se puede confirmar un envío a domicilio sin
domicilio. Para `"retiro en sucursal"` cualquier `direccionEntrega` que se
mande se ignora (no se persiste, no es un error).

El domicilio se guarda en una tabla propia (`direccionentrega`, 1 a 1 con
`venta`), no en una columna de `venta`: ver
[backend-base-de-datos.md](backend-base-de-datos.md) para por qué. Se
refleja en las respuestas que incluyen la venta completa como
`direccionEntrega: { idVenta, direccion } | null`.

## Promociones (`PromocionProducto`)

CRUD completo en `/api/promociones` (lectura pública, escritura
`vendedor`/`administrador`), reutilizando la tabla `promocionproducto` que
ya existía en la base de desarrollo. Campos: `idProducto` (obligatorio),
`idCategoria` (opcional), `fechaInicio`/`fechaFin` (`AAAA-MM-DD`),
`descuento` (número, rango de `DECIMAL(5,2)`).

**Importante**: esta etapa solo administra el catálogo de promociones. Las
reglas de aplicación (si el descuento es porcentual o fijo, cómo se combina
con el descuento manual de una venta, comportamiento ante promociones
superpuestas) todavía no están confirmadas por Mauro, así que **ninguna
promoción se aplica automáticamente** al registrar una venta — ver
[estado-proyecto.md](estado-proyecto.md). El frontend público
(`/promociones`) muestra un aviso explícito de esto, para no anunciarle al
comprador un descuento que en realidad no se aplica al pagar.

`fechaInicio`/`fechaFin` se validan contra el calendario real, no solo el
formato: `"2026-02-30"` (30 de febrero, no existe) responde
`400 { "error": "La fecha de inicio no es una fecha de calendario válida" }`
en vez de aceptarse y normalizarse en silencio a otro día (que es lo que
hace `new Date()` de JavaScript con una fecha así, si no se valida
explícitamente).

## Política de campos de texto opcionales (cliente, proveedor, producto, etc.)

`telefono`, `email`, `direccion`, `CUIT`, `mail`, `descripcion`: `undefined`,
`null` y cadena vacía se tratan como ausencia (se guarda `null`). Cualquier
otro valor que no sea una cadena de texto (booleano, número, objeto,
arreglo) se rechaza con `400 { "error": "<campo> no es válido" }`, en vez
de tratarse silenciosamente como ausencia.

## Forma general

Todos los cuerpos de creación/edición deben ser un objeto JSON (no `null`,
no un arreglo, no un valor primitivo); si no lo son, responden
`400 { "error": "El cuerpo de <entidad> no es válido" }`.

No hay búsqueda de texto en el backend (`Catalogo.jsx` en el frontend filtra
por nombre del lado del cliente, sobre la página ya filtrada por categoría/
tipo de mascota).
