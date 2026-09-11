# Instalación y ejecución del backend

## Requisitos

- Node.js 24.x (la misma versión que usa `.github/workflows/backend-tests.yml`).
- Un servidor MySQL accesible (local o remoto), con una base de datos ya
  creada para desarrollo. Sequelize no crea la base en sí, solo las tablas
  dentro de una base que ya exista (ver
  [backend-base-de-datos.md](backend-base-de-datos.md)).

## Instalación

```bash
cd backend
npm install
```

## Configuración de ambiente

Copiar `backend/.env.example` a `backend/.env` y completar los valores
reales (nunca se versiona `.env`, solo el `.example`):

```bash
cp .env.example .env
```

Variables:

| Variable | Uso |
|---|---|
| `PORT` | Puerto HTTP del backend. |
| `FRONTEND_URL` | Origen permitido por CORS. |
| `DB_HOST`, `DB_PORT` | Host y puerto del servidor MySQL. |
| `DB_NAME` | Base de datos de **desarrollo**. Debe existir de antemano. |
| `DB_USER`, `DB_PASSWORD` | Credenciales de conexión. |
| `JWT_SECRET` | Clave de firma de los tokens de sesión. Generarla con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`; ver [backend-autenticacion.md](backend-autenticacion.md). |

Para pruebas de integración existe un archivo de ejemplo aparte,
`backend/.env.test.example`, que **nunca** debe apuntar a la misma base que
`.env`. Ver el detalle en
[backend-base-de-datos.md](backend-base-de-datos.md) y
[backend-pruebas.md](backend-pruebas.md).

## Ejecutar en desarrollo

```bash
npm run dev
```

Esto levanta el servidor con `nodemon` sobre `src/server.js`, que al
arrancar llama a `sequelize.authenticate()` y `sequelize.sync()` (crea las
tablas que falten en la base indicada por `DB_NAME`, sin destruir datos
existentes; ver el detalle de qué hace y qué no hace `sync()` en
[backend-base-de-datos.md](backend-base-de-datos.md)).

```bash
npm start
```

Levanta el servidor sin `nodemon` (modo similar a producción/entrega).

## Verificar que funciona

```bash
curl http://localhost:3000/api/health
```

Debe responder `{"status":"ok","message":"API Petshop funcionando correctamente","entorno":"desarrollo"}`
(`entorno` identifica contra qué configuración corre esta instancia; ver
"Instancias aisladas" más abajo).

## Datos de ejemplo para recorrer la aplicación

```bash
npm run sembrar:demo
```

Carga categorías, tipos de mascota, un proveedor, medios de pago, algunos
productos (incluido uno con stock por debajo del mínimo, para ver la alerta)
y tres usuarios de prueba (`administrador`, `vendedor`, `cliente`) con
contraseñas ficticias que el script imprime en la consola — no son
credenciales reales y no quedan en ningún archivo del repositorio. Es
idempotente: correrlo de nuevo no duplica filas (busca por nombre/email
antes de crear). Ver [backend-autenticacion.md](backend-autenticacion.md).

## Instancias aisladas (integración y E2E)

Además de la instancia de desarrollo de arriba, el proyecto define dos
instancias más, cada una con su propia base, usuario y configuración —
nunca comparten datos entre sí ni con `petshop_db`:

| Instancia | Comando | Configuración | Base |
|---|---|---|---|
| Integración | `npm run test:integracion` | `backend/.env.test` | `petshop_test` |
| E2E | `npm run dev:e2e` | `backend/.env.e2e` | `petshop_e2e` |

Ver [backend-base-de-datos.md](backend-base-de-datos.md) ("Bases y
usuarios de prueba") para cómo completar la contraseña de cada una, y
[frontend-pruebas.md](frontend-pruebas.md) ("Aislamiento para E2E") para el
procedimiento completo de E2E (backend + frontend + siembra de datos, los
cuatro en puertos y con cookies separados de desarrollo).

## Pruebas

Ver [backend-pruebas.md](backend-pruebas.md) para los comandos exactos y el
alcance de cada suite (pruebas sin base de datos vs. integración real).
