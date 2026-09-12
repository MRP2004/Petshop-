# Autenticación y niveles de acceso

## Resumen

El backend usa **JWT** (biblioteca `jsonwebtoken`) para sesiones sin estado y
**scrypt** (`node:crypto`, sin agregar una dependencia nueva de hashing) para
almacenar contraseñas. Hay tres roles:

| Rol | Quién | Qué puede hacer |
|---|---|---|
| `cliente` | Cualquier persona que se registra públicamente | Comprar y consultar **únicamente sus propias** ventas; ver/editar su propio registro de Cliente. |
| `vendedor` | Cuenta interna, creada por un administrador | Gestionar catálogo (productos, categorías, tipos de mascota, proveedores, medios de pago, promociones), stock, y **todas** las ventas (crear para cualquier cliente, cancelar, marcar como enviada). |
| `administrador` | Cuenta interna, creada por otro administrador (o la primera, manualmente) | Todo lo de `vendedor`, más: crear cuentas internas (`vendedor`/`administrador`) vía `POST /api/usuarios`. |

**"Ocultar botones no es autorización"**: el frontend usa el rol codificado
en el token solo para decidir qué mostrar (mejor UX), pero la autorización
real ocurre en el backend, en cada endpoint, con los middlewares
`requiereAutenticacion` / `requiereRol` (`src/middlewares/autenticacion.middleware.js`).
Un intento de acceder a una acción no permitida responde `401` (sin sesión)
o `403` (sesión válida, pero sin el rol necesario), nunca solo se "esconde"
del lado del cliente.

## Modelo `Usuario`

`backend/src/models/usuario.model.js`: `idUsuario`, `email` (único),
`contrasenaHash` (`"sal_hex:hash_hex"`, nunca la contraseña en texto plano),
`rol` (`ENUM('cliente','vendedor','administrador')`), `idCliente` (FK
opcional y única a `Cliente`; obligatoria solo cuando `rol='cliente'`).

Un usuario `cliente` siempre está vinculado 1 a 1 con un `Cliente`. Los
usuarios `vendedor`/`administrador` no tienen `Cliente` asociado: no
compran, gestionan el negocio.

## Registro público vs. alta interna

- **`POST /api/usuarios/registro`** (público): crea un `Cliente` y un
  `Usuario` con `rol='cliente'` **en la misma transacción**. El cuerpo nunca
  se interpreta como si pudiera traer un `rol`: `usuario.service.js` fuerza
  `'cliente'` sin leer nada del cuerpo para ese campo, así que no hay forma
  de registrarse como `vendedor`/`administrador` por esta vía, se mande lo
  que se mande.
- **`POST /api/usuarios`** (protegido, requiere rol `administrador`): crea
  una cuenta `vendedor` o `administrador`, sin `Cliente` asociado.

Ambas reutilizan la misma validación de datos de Cliente
(`prepararDatosCliente`, exportada desde `cliente.service.js`) que usa el
CRUD administrativo de clientes: no hay dos copias de esas reglas.

## Estrategia de sesión: cookies HttpOnly, no localStorage

**Corrección de esta etapa**: antes, `POST /api/usuarios/login` devolvía el
JWT en el cuerpo de la respuesta y el frontend lo guardaba en
`localStorage`, mandándolo como `Authorization: Bearer <token>` en cada
pedido. Un JWT en `localStorage` es legible por **cualquier** script que
corra en la página (es el vector clásico de robo de sesión vía XSS: basta
una dependencia comprometida o un `dangerouslySetInnerHTML` mal usado).
Ahora la sesión vive en una cookie **HttpOnly** (`petshop_sesion`,
`src/utils/sesion.js`): el JavaScript del frontend nunca puede leerla, ni
falta que la lea — el navegador la adjunta solo en cada pedido al backend.

**`POST /api/usuarios/login`** con `{ email, password }` devuelve
`{ usuario, csrfToken }` (sin el JWT: viaja únicamente en la cookie) y deja
dos cookies:

| Cookie | HttpOnly | Contenido | Duración |
|---|---|---|---|
| `petshop_sesion` | Sí | El JWT (`{ idUsuario, rol, idCliente }`, sin email — ver más abajo) | 8 horas |
| `petshop_csrf` | No (a propósito) | Un valor aleatorio, para la protección CSRF (ver siguiente sección) | 8 horas |

`GET /api/usuarios/perfil` devuelve el mismo payload decodificado del
token: es cómo el frontend recupera "quién está logueado" al cargar la
página (no puede leer la cookie directamente). El objeto `usuario` que
devuelve el login es a propósito idéntico en forma al que devuelve
`perfil` (`{ idUsuario, rol, idCliente }`, sin `email`): así el estado de
sesión en React no cambia de forma según si vino de loguearse recién o de
una recarga de página.

`POST /api/usuarios/logout` limpia ambas cookies (`res.clearCookie`).

**Nombre con sufijo por entorno** (`utils/sesion.js`): si `ENTORNO` está
definida (`backend/.env.e2e`: `ENTORNO=e2e`), ambas cookies quedan
`petshop_sesion_e2e`/`petshop_csrf_e2e` en vez de sin sufijo — necesario
porque el navegador comparte el mismo frasco de cookies entre puertos
distintos del mismo host (`localhost:3000` y `localhost:3001` **no** son
orígenes de cookies separados), así que dos backends en la misma máquina
sin este sufijo podrían pisarse la sesión entre sí. **Corrección
encontrada en una revisión independiente**: el frontend
(`frontend/src/api/httpClient.js`) tenía el nombre de la cookie de CSRF
fijo en `'petshop_csrf'`, sin este mismo sufijo — contra el backend E2E,
`leerCookieCsrf()` nunca encontraba la cookie (nombre distinto: buscaba
`petshop_csrf` y la cookie real era `petshop_csrf_e2e`), nunca mandaba el
header `X-CSRF-Token`, y **cualquier** `POST`/`PUT`/`PATCH`/`DELETE` contra
la instancia E2E hubiera respondido `403` — habría roto todo el camino de
escritura de la suite E2E (confirmar una compra, cancelar, cargar una
venta manual, gestionar el catálogo) sin que ninguna prueba anterior lo
hubiera detectado, porque ninguna llegó a ejecutarse contra un backend E2E
real todavía. Se corrigió leyendo el mismo `VITE_ENTORNO` en el frontend
(`frontend/.env.e2e`) para armar el nombre de la cookie con el mismo
criterio que el backend. Probado en `frontend/src/api/httpClient.test.js`
(3 casos: sin sufijo, con sufijo, y que una cookie de desarrollo sin
sufijo no se confunda con la de E2E cuando el frontend espera el sufijo) y
verificado además contra el build real (`vite build --mode e2e`): el
nombre `petshop_csrf_e2e` queda compilado en el bundle, coincidiendo
exactamente con lo que genera el backend.

Compatibilidad: las rutas protegidas también aceptan
`Authorization: Bearer <token>` (usado por `backend/test/*.test.js` y por
herramientas/scripts que no tienen navegador ni cookies). Un Bearer
explícito no es vulnerable a CSRF — ver más abajo — así que no se le exige
el token CSRF.

## Protección CSRF (double-submit cookie)

Con sesión por cookie, cualquier solicitud que el navegador arme hacia el
backend adjunta la cookie automáticamente — incluida una que un sitio
atacante logre disparar (por ejemplo, un `<form>` enviado desde otra
página). Eso es exactamente lo que CSRF explota. Mitigación implementada
(`requiereAutenticacion`, `src/middlewares/autenticacion.middleware.js`):

1. Al iniciar sesión, además de la cookie `petshop_sesion` (HttpOnly), se
   deja `petshop_csrf` (**no** HttpOnly, a propósito) con un valor
   aleatorio.
2. El frontend lee esa cookie (sí puede: es de su propio origen) y la manda
   de vuelta como header `X-CSRF-Token` en toda solicitud que cambia estado
   (`POST`/`PUT`/`PATCH`/`DELETE`).
3. El backend exige que el header coincida (comparación en tiempo
   constante, `utils/csrf.js`) con la cookie — pero **solo** cuando la
   credencial vino de la cookie de sesión, no cuando vino de un
   `Authorization: Bearer` explícito.

Un sitio atacante puede lograr que el navegador mande la cookie, pero no
puede **leerla** (pertenece al origen del backend, no al suyo) para copiar
su valor al header: sin eso, la solicitud falsificada llega con la cookie
pero sin el header correcto, y se rechaza con `403`. Probado en
`test/sesionYCsrf.test.js` (sesión válida sin header → 403; con header
incorrecto → 403; con header correcto → pasa la autenticación; un Bearer
explícito nunca lo exige).

`app.js` habilita `cors({ credentials: true })` (necesario para que el
navegador mande/reciba las cookies en un pedido cross-origin, ya que
frontend y backend corren en puertos distintos) y `secure` en las cookies
se activa solo con `NODE_ENV=production` (en desarrollo, HTTP sobre
`localhost`, exigir HTTPS impediría que el navegador las guarde).

## Expiración, cierre de sesión y fallos de almacenamiento

- **Expiración**: el JWT vence a las 8 horas (`DURACION_TOKEN`,
  `utils/token.js`). Cualquier pedido con una cookie vencida responde `401`
  ("La sesión no es válida o expiró"); el frontend registra un manejador
  (`registrarManejadorSesionInvalida`, `httpClient.js`) que limpia el
  estado de sesión en React apenas ve un `401`, así que la interfaz refleja
  "sin sesión" sin esperar a que el usuario recargue la página.
- **Cierre de sesión**: `AuthContext` llama a `POST /api/usuarios/logout`.
  **Corrección de una revisión posterior**: la versión anterior atrapaba el
  error de red pero limpiaba el estado local de todas formas — le mostraba
  a quien usa la app que ya no tenía sesión cuando en los hechos su cookie
  seguía activa en el servidor (un cierre que no había ocurrido,
  presentado como si hubiera ocurrido). Ahora el estado local **solo** se
  limpia en dos casos:
  1. El servidor confirma el cierre (`204`).
  2. El servidor ya no reconoce la sesión (`401`: no hay nada que cerrar).

  Cualquier otro fallo (de red, o un error del servidor) **no** limpia el
  estado: `AuthContext` expone `errorCierreSesion` (un mensaje) y
  `cerrandoSesion` (para deshabilitar el botón mientras está en curso);
  `Navbar.jsx` muestra ese mensaje sin ocultarlo y deja el mismo botón
  "Salir" para reintentar (`cerrarSesion` nunca relanza el error: todo el
  resultado queda en el estado del contexto, así que no hay ningún rechazo
  de promesa sin atrapar). Si el usuario recarga la página después de un
  fallo, `AuthProvider` vuelve a preguntarle al backend quién está logueado
  (`GET /api/usuarios/perfil`) y, como el cierre nunca se confirmó, la
  cookie sigue viva y la sesión vuelve a aparecer — coherente con que
  nunca se afirmó que se hubiera cerrado. Ver
  `frontend/src/context/AuthContext.test.jsx` (cierre exitoso, fallo
  visible sin relanzar el error, reintento exitoso después de un fallo,
  sesión ya inválida tratada como éxito, y recarga después de un fallo).
- **Fallos de almacenamiento**: la sesión ya no depende de `localStorage`
  (evita ese modo de falla para la sesión en sí). El carrito sí sigue en
  `localStorage` por conveniencia de UX (no es información sensible); su
  lectura/escritura está en `try/catch` (`models/Carrito.js`,
  `CarritoContext.jsx`) para funcionar igual, solo sin persistencia entre
  recargas, si el navegador lo bloquea (navegación privada, cuota agotada).

## Límite de intentos (login y registro)

`middlewares/limiteIntentos.middleware.js`, con **dos capas encadenadas**
por ruta (`routes/usuario.routes.js`), no una sola:

| Capa | Clave | Login | Registro |
|---|---|---|---|
| Por IP sola | `ip:<ruta>:<ip>` | 30 cada 15 min | 15 por hora |
| Por IP+email | `<ip>:<email>` | 8 cada 15 min | 5 por hora |

Los dos máximos de login (no los de registro) son configurables vía
`LIMITE_LOGIN`/`LIMITE_LOGIN_POR_IP` (`routes/usuario.routes.js`), sin
cambiar los valores por defecto de la tabla en ningún `.env` salvo
`backend/.env.e2e` (**corrección de una revisión independiente**: la
suite Playwright corre en serie, sin reiniciar el backend, contra 2
cuentas fijas para 3 viewports — de verdad más intentos legítimos que los
límites de producción, no un ataque — ver
[frontend-pruebas.md](frontend-pruebas.md) para el detalle completo de
cómo se encontró y se confirmó corregido corriendo la suite dos veces
seguidas).

**Origen de las dos capas**: al principio solo existía la de IP+email, con
un punto ciego real: cada email distinto arranca su propio contador en
cero, así que alguien que prueba muchos emails distintos desde la misma IP
(fuerza bruta de credenciales contra cuentas ajenas, o alta masiva de
cuentas con emails descartables) nunca llega al máximo, sin importar
cuántos intentos haga. La capa por IP sola cierra ese hueco: es más laxa a
propósito (para no bloquear una oficina/NAT compartida haciendo uso
legítimo), pero pone un techo real independiente del email usado.

**Corrección de una revisión posterior**: la primera versión de la capa
por IP namespaceaba las claves con un prefijo (`"login:"`, `"registro:"`)
para compartir un único `Map` a nivel de módulo entre las cuatro
instancias del middleware. Namespacear las claves no alcanzaba: la
limpieza periódica de una instancia (`limpiarVencidos`, cada 200 pedidos)
recorría el `Map` **entero** y filtraba cada entrada con **su propia**
ventana, sin importar de qué instancia fuera esa entrada — una limpieza
disparada por tráfico de login (ventana de 15 min) podía borrar intentos
de registro todavía vigentes (ventana de 60 min), simplemente por usar el
umbral equivocado. Ahora **cada instancia de `limitarIntentos` tiene su
propio `Map`**, creado en su propio closure: no hay ningún estado
compartido entre limitadores, así que la limpieza de uno nunca puede tocar
las entradas de otro.

Implementación en memoria, sin agregar una dependencia nueva — limitación
conocida y documentada: no sobrevive un reinicio del proceso, ni se
comparte entre varias instancias del backend si se escalara
horizontalmente. Suficiente para esta etapa (un único proceso); si el
proyecto necesitara escalar a varias instancias, este límite tendría que
moverse a un almacenamiento compartido (Redis u otro).

Probado en `test/sesionYCsrf.test.js` (9 intentos seguidos con el mismo
email contra la ruta real → el noveno responde `429`, capa IP+email) y en
`test/limiteIntentosPorIp.test.js` (prueba unitaria del middleware, aislada
de la ruta real): cambiar de email no evita el límite general por IP;
login y registro no comparten conteos; **la limpieza de una ventana corta
no borra intentos vigentes de una ventana más larga** (reproduce con
`node:test`'s `mock.timers` el escenario exacto del bug ya corregido); y
la recuperación tras vencer la ventana funciona.

## Cómo una compra usa la identidad de la sesión

`registrarVenta` (`venta.service.js`) recibe el `usuario` decodificado del
token además del cuerpo de la solicitud:

- Si `usuario.rol === 'cliente'`, el `idCliente` de la venta se toma
  **siempre** de `usuario.idCliente`, ignorando cualquier `idCliente` que
  venga en el cuerpo. Así, modificar el JSON de la solicitud no permite
  comprar "como" otro cliente.
- Si el rol es `vendedor`/`administrador`, el `idCliente` sí se toma del
  cuerpo (una venta manual necesita poder elegir el cliente).

### Corrección crítica: campos comerciales reservados a personal

**Hallazgo de la revisión independiente**: `registrarVenta` leía
`descuento` y `minimoMayorista` del cuerpo de la solicitud sin importar
quién la mandara. Se reprodujo por HTTP (con persistencia simulada, sin
MySQL real) una compra de $100 con `descuento: 100` que respondía `201`
con `total: 0` — cualquier cliente autenticado podía descontarse lo que
quisiera de su propia compra.

**Corrección** (`venta.service.js#registrarVenta`): cuando
`usuario.rol === 'cliente'`, esos dos campos se ignoran por completo —ni
siquiera se leen del cuerpo—, igual que ya se hacía con `idCliente`. Si
vienen en la solicitud, no producen ni un error ni un descuento: la venta
se registra igual, al precio de lista completo. Cuando el rol es
`vendedor`/`administrador`, sí se leen y se aplican (es una venta manual,
con un cliente presente o por teléfono que puede negociar un descuento).
Prueba de regresión: `test/ventaDescuentoAutorizacion.test.js`.

La misma distinción se aplica a **listar** (`GET /api/ventas`: un cliente
solo ve las suyas, sin importar qué filtros mande en la query), **ver el
detalle** (`GET /api/ventas/:id`: 403 si no es propia y no es personal) y
**cancelar** (`PATCH /api/ventas/:id/cancelar`). "Marcar como enviada" es
exclusivo de personal: un cliente no marca su propio pedido como enviado.

## Matriz de rutas protegidas

| Ruta | Público | `cliente` | `vendedor` / `administrador` |
|---|:-:|:-:|:-:|
| `GET /api/productos`, `/api/categorias`, `/api/tipos-mascota`, `/api/medios-pago`, `/api/promociones` (y `/:id`) | ✅ | ✅ | ✅ |
| `GET /api/productos/stock-bajo` | ❌ | ❌ | ✅ |
| Escritura de productos/categorías/tipos de mascota/medios de pago/promociones | ❌ | ❌ | ✅ |
| `GET`/`PUT /api/proveedores`, `/api/clientes` (listado completo) | ❌ | ❌ | ✅ |
| `GET`/`PUT /api/clientes/:id` | ❌ | Solo el propio (`idCliente` del token) | ✅ (cualquiera) |
| `POST /api/ventas`, `GET /api/ventas`, `GET /api/ventas/:id`, `PATCH /:id/cancelar` | ❌ | ✅ (solo las propias) | ✅ (cualquiera) |
| `PATCH /api/ventas/:id/enviar` | ❌ | ❌ | ✅ |
| `POST /api/usuarios/registro`, `POST /api/usuarios/login` | ✅ | ✅ | ✅ |
| `GET /api/usuarios/perfil` | ❌ | ✅ | ✅ |
| `POST /api/usuarios` (alta interna) | ❌ | ❌ | Solo `administrador` |

## Usuarios de prueba

`backend/scripts/sembrarDatosDemo.js` (`npm run sembrar:demo`) crea tres
cuentas de desarrollo con contraseñas ficticias, impresas en la consola al
ejecutarlo — **no son credenciales reales** y no se versionan en ningún
archivo:

- `admin@petshop.demo` (administrador)
- `vendedor@petshop.demo` (vendedor)
- `cliente@petshop.demo` (cliente, con un `Cliente` asociado)

## Lo que NO se implementó (fuera de alcance por ahora)

- Recuperación de contraseña / verificación de email.
- Refresh tokens (el JWT expira a las 8h y requiere volver a iniciar sesión).
- Auditoría de accesos.
- Límite de intentos compartido entre instancias (ver la limitación
  documentada arriba: en memoria, por proceso).
