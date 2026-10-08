# Pruebas del frontend

Dos suites, con propósitos distintos.

## 1. Pruebas unitarias y de componentes (Vitest + Testing Library)

No requieren backend ni base de datos: prueban lógica pura y componentes
aislados (con contextos reales pero sin red — no hacen `fetch`).

```bash
cd frontend
npm test
```

| Archivo | Qué cubre |
|---|---|
| `src/models/Carrito.test.js` | Lógica del modelo `Carrito` (agregar, actualizar cantidad, quitar, total, inmutabilidad, conversión a detalles de venta, lectura de `localStorage` corrupto/inválido). |
| `src/components/ProductCard.test.jsx` | Renderizado (nombre, precio formateado, disponibilidad), reactividad ante un evento de usuario (clic en "Agregar al carrito" actualiza el contador del carrito vía contexto compartido) y estado deshabilitado sin stock. |
| `src/utils/iconoProducto.test.js` | Selección del ícono del producto según su categoría (ver [frontend-diseno.md](frontend-diseno.md), revisión visual de la corrección anterior). |
| `src/context/AuthContext.test.jsx` | **Corrección de una revisión posterior** (logout fallido, reescrita): `cerrarSesion` **solo** limpia el estado local si el servidor confirma el cierre o ya no reconoce la sesión — un fallo de red u otro error deja la sesión activa, expone un mensaje y permite reintentar (5 casos: cierre exitoso, fallo visible, reintento exitoso, sesión ya inválida, recarga después de un fallo). |
| `src/components/ImagenProducto.test.jsx` | Muestra la imagen real cuando el producto la tiene, cae al ícono por categoría cuando no, y también cae al ícono si la imagen real falla al cargar. |
| `src/api/httpClient.test.js` | **Corrección de una revisión posterior** (nombre de cookie CSRF por entorno): con `VITE_ENTORNO=e2e`, lee `petshop_csrf_e2e` (no `petshop_csrf`) para el header `X-CSRF-Token` — reproduce el bug real que esto corrige (ver [backend-autenticacion.md](backend-autenticacion.md)). |

**Resultado real** (último `npm test` ejecutado en esta corrección):

```
Test Files  6 passed (6)
     Tests  27 passed (27)
```

## 2. Pruebas de extremo a extremo (Playwright) — aisladas de desarrollo

**Corrección de esta etapa**: las dos correcciones anteriores corrían esta
suite contra `petshop_db` (desarrollo) porque no había alternativa — el
bloqueo de privilegios de MySQL impedía crear una base aislada. Ese bloqueo
está resuelto (ver [backend-base-de-datos.md](backend-base-de-datos.md)):
ahora E2E corre contra una instancia del backend y del frontend
completamente separadas de las de desarrollo, con su propia base
(`petshop_e2e`), su propio puerto y sus propias cookies.

### Aislamiento, en cuatro capas (no una sola)

1. **Base de datos distinta**: `petshop_e2e`, no `petshop_db` ni
   `petshop_test`. `scripts/sembrarDatosE2E.js` verifica el nombre de base
   y el usuario de conexión EFECTIVOS antes de borrar o escribir nada
   (aborta si no coinciden — ver el script).
2. **Puertos distintos y estrictos**: backend E2E en el 3001 (no el 3000 de
   desarrollo), frontend E2E en el 5183 (no el 5173 de desarrollo). Ambos
   con `--strictPort`/manejo explícito de `EADDRINUSE`: si el puerto ya
   está ocupado, **abortan** en vez de arrancar en otro puerto en
   silencio (verificado: ver más abajo).
3. **Cookies con nombre distinto**: los puertos por sí solos NO separan
   cookies entre sí (el navegador comparte el mismo frasco de cookies
   entre puertos del mismo host `localhost`). `ENTORNO=e2e` en
   `backend/.env.e2e` le agrega un sufijo a las cookies de sesión/CSRF
   (`petshop_sesion_e2e`/`petshop_csrf_e2e`, ver `utils/sesion.js`), así
   que no pueden colisionar con una sesión de desarrollo abierta en la
   misma máquina. **El frontend necesita el mismo sufijo**:
   `frontend/.env.e2e` trae `VITE_ENTORNO=e2e`, que
   `frontend/src/api/httpClient.js` usa para saber que la cookie de CSRF
   que tiene que leer es `petshop_csrf_e2e`, no `petshop_csrf` (corrección
   de una revisión independiente: sin esto, `leerCookieCsrf()` nunca
   encontraba la cookie contra el backend E2E, nunca mandaba
   `X-CSRF-Token`, y toda escritura respondía `403` — ver
   [backend-autenticacion.md](backend-autenticacion.md) para el detalle
   completo y la prueba que lo confirma).
4. **Verificación automática antes de correr cualquier prueba, en DOS
   pasos, no uno**: `playwright.config.js` define un `globalSetup`
   (`e2e/globalSetupAislamiento.js`) que **aborta toda la corrida** (antes
   de que cualquier prueba llegue a escribir algo) si no puede confirmar
   dos cosas por separado:
   1. **El backend está aislado de verdad**: llama a `GET
      /api/health/aislamiento` (ver
      [backend-base-de-datos.md](backend-base-de-datos.md)) — endpoint que
      consulta `SELECT DATABASE()`/`CURRENT_USER()` reales y compara
      contra `petshop_e2e`/`petshop_e2e_app@localhost` de forma exacta.
      **Habilitado SOLO cuando `ENTORNO=e2e`** (corrección de una revisión
      posterior): fuera de ese entorno responde `404` sin llegar siquiera
      a consultar la base — no expone nombre de base ni usuario de
      conexión en desarrollo ni en ninguna otra instancia. Probado en
      `backend/test/app.test.js` (2 casos: `404` sin `ENTORNO=e2e` y sin
      consultar la base — sin ningún mock de `sequelize`, así que si
      llegara a consultarla la prueba fallaría igual; `200` con
      `ENTORNO=e2e`, con `sequelize.query` reemplazado por uno fijo, mismo
      patrón que `productoImagen.test.js`, para no necesitar MySQL real en
      esta suite).
   2. **El frontend REALMENTE SERVIDO habla con ese backend** (corrección
      de una revisión posterior, el chequeo que faltaba): releer
      `frontend/.env.e2e` no alcanza si el proceso de Vite ya está
      corriendo con otra configuración (por ejemplo, `VITE_API_URL`
      pisada a mano por una variable de entorno del shell al arrancar
      `npm run dev:e2e`) — un archivo dice una cosa, el proceso vivo puede
      estar haciendo otra. `globalSetup` abre un navegador real (el mismo
      motor que usan las pruebas), navega a la página de inicio del
      frontend servido, espera la petición real que esa página hace al
      cargar (`GET .../api/productos`, ver `src/pages/Home.jsx`) y compara
      el origen de **esa petición real** contra el backend ya confirmado
      en el paso 1 — no contra lo que dice ningún archivo de
      configuración. **Verificado con los dos resultados posibles, no
      solo el que pasa**: con la configuración correcta, confirma y sigue
      (`[globalSetup] Frontend servido en http://localhost:5183
      confirmado pidiendo el catálogo de verdad a http://localhost:3001.`);
      arrancando el frontend a propósito con `VITE_API_URL` pisada al
      puerto de desarrollo (`VITE_API_URL=http://localhost:3000/api npm
      run dev:e2e`), aborta antes de que aparezca siquiera "Running N
      tests" — ninguna prueba llega a correr, mucho menos a escribir.
      **Corrección de una revisión independiente (Codex)**: el filtro de
      la petición esperada exige además `método === 'GET'`, no solo el
      `pathname` — `httpClient.js` manda `Content-Type: application/json`
      incluso en un `GET`, lo que lo hace "no simple" para CORS y dispara
      un preflight `OPTIONS` al mismo `pathname` antes del pedido real; sin
      filtrar por método, la espera se podía resolver con ese `OPTIONS` en
      vez de con el `GET` real (mismo origen en ambos casos, así que no
      cambiaba el resultado del chequeo, pero sí lo que literalmente
      probaba).

   Los tres casos de aborto del paso 1 (sin backend corriendo, backend de
   desarrollo respondiendo, `VITE_API_URL` sin definir en
   `frontend/.env.e2e`) siguen probados igual que antes.

### Cómo correrlas

```bash
# Terminal 1: backend AISLADO de E2E (puerto 3001, base petshop_e2e)
cd backend
npm run dev:e2e

# Terminal 2 (una sola vez, o cuando se quiera reiniciar el estado de
# petshop_e2e a uno conocido): borra todo lo que hubiera y vuelve a
# sembrar el mismo catálogo/cuentas fijas — así cada corrida de Playwright
# parte del mismo punto, sin depender de qué dejó la corrida anterior.
cd backend
npm run sembrar:e2e

# Terminal 3: frontend AISLADO de E2E (puerto 5183, habla con el backend
# del puerto 3001)
cd frontend
npm run dev:e2e

# Terminal 4
cd frontend
npx playwright install chromium   # una sola vez
npm run test:e2e
```

Requiere `backend/.env.e2e` con la contraseña de `petshop_e2e_app`
completa (ver [backend-base-de-datos.md](backend-base-de-datos.md),
"Completar las contraseñas locales") — sin eso, `npm run dev:e2e` del
backend no llega a conectarse, y el `globalSetup` de arriba aborta la
corrida de Playwright con un mensaje explicando exactamente qué falta.

`playwright.config.js` corre cada prueba en tres proyectos con distinto
viewport (`sm-mobile` 390×844, `md-tablet` 820×1180, `lg-desktop`
1440×900), cubriendo el requisito de verificar la app en tres tamaños de
pantalla sin triplicar el código de las pruebas.

**Seis casos de prueba distintos** (no seis funcionalidades del sistema:
cada uno ejercita un recorrido puntual, no una cobertura exhaustiva de esa
pantalla), cada uno corrido en los 3 viewports (`sm-mobile`/`md-tablet`/
`lg-desktop`) — 6 × 3 = **18 ejecuciones**, la cifra que se cita como
"18/18" en el resto de esta documentación:

| # | Caso cubierto | Archivo |
|---|---|---|
| 1 | Sin sesión, entrar a `/panel` redirige a iniciar sesión | `e2e/recorrido-completo.spec.js` |
| 2 | Iniciar sesión (cliente), buscar un producto, agregar al carrito, confirmar la compra, ver el número de operación, solicitar la cancelación y ver que el personal la apruebe (corregido en CU-04, ronda 4 — el cliente ya no cancela directamente, ver [cu04-checkout-pago.md](cu04-checkout-pago.md) §7) | ídem |
| 3 | Credenciales incorrectas muestran un mensaje de error claro, sin redirigir | ídem |
| 4 | Un cliente autenticado no puede entrar al panel de personal (redirige a "/") | ídem |
| 5 | Un vendedor carga una venta manual para un cliente existente y la marca como enviada | ídem |
| 6 | Capturas de solo lectura del catálogo, detalle, promociones, carrito, checkout y panel (no confirma ninguna compra) | `e2e/capturas.spec.js` |

No cubre (fuera de este alcance, ver "Pendientes de alcance" en
[estado-proyecto.md](estado-proyecto.md)): los CRUD de personal
(Categoría, Proveedor, TipoMascota, MedioPago, Promoción) más allá del de
Producto en las capturas, el filtro de ventas por proveedor, ni las reglas
de aplicación de `PromocionProducto`.

Las cuentas que usan estas pruebas (`cliente@petshop-e2e.test`,
`vendedor@petshop-e2e.test`) y el cliente "Cliente De Prueba" que selecciona el
recorrido de personal son las que crea `scripts/sembrarDatosE2E.js` — ya no
las de `sembrarDatosDemo.js` (esas siguen existiendo, pero son solo para
desarrollo local, con dominio `@petshop.demo`).

**Corrección de una revisión independiente (dominio de los emails de
prueba)**: eran `@petshop.e2e` — el validador `isEmail` de `validator.js`
(usado por el modelo `Usuario`) rechaza cualquier TLD con dígitos, y "e2e"
tiene uno, así que **`npm run sembrar:e2e` fallaba siempre** al crear el
primer usuario (`Validation error: El correo electrónico no es válido`),
algo que ninguna revisión anterior había detectado porque ninguna había
llegado a ejecutar el sembrado contra una base real con la contraseña
puesta. Se cambió a `@petshop-e2e.test` (dominio inválido reservado por la
IANA, RFC 2606, para pruebas — la elección técnicamente correcta para
este uso, no solo una que "funciona") en `scripts/sembrarDatosE2E.js`, los
dos specs de `e2e/` y la documentación relacionada.

**Estado real de ejecución**: infraestructura de aislamiento verificada Y
**suite completa ejecutada de verdad**, dos veces seguidas, sin reiniciar
el backend entre corridas (re-sembrando antes de cada una, el flujo real
que documenta este archivo), contra el backend y el frontend aislados
reales (`petshop_e2e`, puertos 3001/5183) — ese "sin reiniciar el backend"
es a propósito: es justo el escenario que expuso el límite de login
demasiado estricto (ver más abajo), y solo se dio por confirmado después
de reproducirlo limpio dos veces seguidas, no una:

```
Running 18 tests using 1 worker
...
  18 passed (53.3s)

Running 18 tests using 1 worker
...
  18 passed (51.8s)
```

En el camino se encontraron y corrigieron dos defectos más, ambos reales
(no hipotéticos: aparecieron al correr la suite, no antes):

- **Límites de intentos de login demasiado estrictos para esta suite**:
  `usuario.routes.js` encadena dos techos (ver
  [backend-autenticacion.md](backend-autenticacion.md)): 8 intentos cada 15
  minutos por IP+email, y 30 por IP sola (sumando cualquier cuenta). Una
  corrida serial de los 3 viewports contra las 2 cuentas fijas acumula, de
  forma legítima, más de 8 intentos para `cliente@petshop-e2e.test` (4 por
  viewport: 1 en `capturas.spec.js` + 3 en `recorrido-completo.spec.js`) y
  más de 30 en total por IP entre las dos cuentas a partir de la segunda
  corrida sin reiniciar el backend (6 intentos por viewport × 3, dos veces)
  — a partir de ahí, todo login legítimo restante respondía `429
  "Demasiados intentos"`, haciendo fallar en cascada el resto de las
  pruebas del último viewport en curso (se encontraron y corrigieron los
  dos, uno primero, aparentemente resuelto, y el segundo recién al
  reproducir una segunda corrida seguida). Se agregaron `LIMITE_LOGIN` y
  `LIMITE_LOGIN_POR_IP` (variables de entorno opcionales,
  `usuario.routes.js`), sin cambiar los valores por defecto (8 y 30) en
  ningún otro `.env` — `backend/.env.e2e` ahora define `LIMITE_LOGIN=200` y
  `LIMITE_LOGIN_POR_IP=500`, exclusivos de esta instancia.
- **`/panel/ventas` sin filas al arrancar de cero**: `e2e/capturas.spec.js`
  saca una captura de esa pantalla, pero `PanelVentas.jsx` no renderiza
  ninguna `<table>` cuando el listado está vacío (muestra "No hay ventas
  con ese filtro." en su lugar) — en una base recién sembrada, sin
  ninguna venta todavía, esa captura fallaba esperando una tabla que no
  iba a aparecer (dependía del orden de ejecución entre archivos, no del
  viewport). `scripts/sembrarDatosE2E.js` ahora registra una venta fija
  de entrada (vía el propio `registrarVenta` real, no un `INSERT` a
  mano) para que el listado nunca empiece vacío.

No se corrigió (evaluado y descartado, fuera del alcance de esta revisión):
bajar el límite de intentos de producción/desarrollo — el hallazgo era
sobre la configuración de prueba, no sobre la protección contra fuerza
bruta en sí.

**Alcance exacto de `LIMITE_LOGIN`/`LIMITE_LOGIN_POR_IP`** (para no dejarlo
ambiguo): son dos variables de entorno opcionales que **solo** afectan las
dos capas de límite de intentos de **login** (`POST
/api/usuarios/login`) — no tocan el límite de **registro**
(`POST /api/usuarios/registro`, sigue fijo en 15/hora por IP y 5/hora por
IP+email, sin variable de entorno que lo cambie). Están definidas **solo**
en `backend/.env.e2e`/`backend/.env.e2e.example` — no en `backend/.env`
(desarrollo), no en `backend/.env.test`/`.env.test.example`
(integración), no en ningún otro archivo. Si la variable no está
definida, `usuario.routes.js` usa el mismo valor de siempre (8 y 30): el
comportamiento de login de desarrollo, integración y producción no
cambió.

### Capturas de pantalla (evidencia visual, solo lectura)

`e2e/capturas.spec.js` navega el catálogo, el detalle de producto,
promociones, carrito y checkout (público y como cliente), y el panel (como
personal), guardando una captura de cada pantalla por cada uno de los tres
viewports (`e2e/capturas-salida/<proyecto>/NN-nombre.png`, no versionadas
en git). Deliberadamente no hace clic en "Confirmar compra" en ningún
momento: solo llega hasta completar el formulario. Corre contra la misma
instancia aislada de E2E que el resto de `e2e/` (mismo `globalSetup`,
mismas cuentas `@petshop-e2e.test`) — no contra desarrollo.

```bash
npx playwright test capturas.spec.js
```

### Recorrido del vendedor independiente (Etapa 9)

`e2e/vendedor-independiente.spec.js` recorre, en cada viewport:

1. Registro de una cuenta aspirante por la API pública, con email único
   por corrida y por viewport.
2. "Quiero ser vendedor" por la interfaz.
3. Aprobación del administrador.
4. Nueva sesión, ya como vendedor, y alta de un producto propio.
5. Compra de ese producto por el cliente sembrado, que lo encuentra con el
   buscador y ve "Vendido por".
6. Aviso en la campana del vendedor, que lleva a "Mis ventas" con su línea
   y su subtotal.

También prueba el acceso por URL directa a rutas de otro rol, que termina
redirigido a `/`.

**Nunca cambia el rol de las cuentas sembradas.** En la Etapa 8, una
verificación manual convirtió al cliente sembrado en vendedor y rompió
otras pruebas. Por eso esta prueba registra su propia cuenta en cada
corrida. Para no chocar con el límite de registros por IP (15 por hora),
`backend/.env.e2e` define `LIMITE_REGISTRO_POR_IP=500`. En cualquier otro
entorno el límite sigue en 15.

Además guarda capturas de las pantallas del marketplace (`11-` a `14-`)
en la misma carpeta `e2e/capturas-salida/<proyecto>/`. Estas capturas
**no** son de solo lectura: se toman durante el recorrido, que escribe en
`petshop_e2e`.

## Lo que falta (fuera de alcance por ahora)

- Pruebas unitarias de `PanelNuevaVenta` (`GestionEntidad` y `Checkout`
  ya tienen las suyas).
- E2E de la compra mixta (PetShop + varias tiendas) y de la suspensión de
  una tienda desde el panel: hoy solo están cubiertas por integración y
  HTTP (ver [matriz-trazabilidad.md](matriz-trazabilidad.md)).
- Corrida automática de estas suites en CI (el workflow actual,
  `.github/workflows/backend-tests.yml`, solo corre las pruebas del
  backend).
