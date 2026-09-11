# Instalación y ejecución del frontend

## Requisitos

- Node.js 24.x (misma versión que el backend).
- El backend corriendo (ver [backend-instalacion.md](backend-instalacion.md)),
  con datos de ejemplo cargados (`npm run sembrar:demo`) para poder recorrer
  la tienda con productos y usuarios reales.

## Instalación

```bash
cd frontend
npm install
```

## Configuración de ambiente

Copiar `frontend/.env.example` a `frontend/.env`:

```bash
cp .env.example .env
```

| Variable | Uso |
|---|---|
| `VITE_API_URL` | URL base de la API del backend (por defecto `http://localhost:3000/api`). |

## Ejecutar en desarrollo

```bash
npm run dev
```

Levanta Vite en `http://localhost:5173`. El backend debe estar corriendo y
`FRONTEND_URL` en `backend/.env` debe apuntar a esa misma URL (CORS).

## Compilar para producción

```bash
npm run build
```

Genera `frontend/dist/`. `npm run preview` sirve ese build localmente para
verificarlo.

## Recorrido rápido para probar

Con el backend y el frontend corriendo y los datos de ejemplo cargados:

1. Abrir `http://localhost:5173`, navegar el catálogo (categorías, tipo de
   mascota, buscador) sin iniciar sesión.
2. Ir a "Registrarse" y crear una cuenta nueva, o iniciar sesión con
   `cliente@petshop.demo` (contraseña impresa por `sembrar:demo`).
3. Agregar productos al carrito, confirmar la compra (checkout), ver el
   número de operación y la compra en "Mi cuenta".
4. Cancelar esa compra desde "Mi cuenta".
5. Cerrar sesión e iniciar sesión como `vendedor@petshop.demo` (o
   `admin@petshop.demo`): acceder a "Panel", ver el listado completo de
   ventas, marcar una como enviada, gestionar el catálogo (crear/editar/
   borrar categorías, productos, etc.), ajustar stock, cargar una venta
   manual para un cliente.
6. Con `admin@petshop.demo`: crear una cuenta interna nueva desde "Cuentas
   internas".

## Instancia aislada de E2E

`npm run dev:e2e` levanta Vite en `http://localhost:5183` (puerto distinto
del de desarrollo, `--strictPort`: aborta si ya está ocupado en vez de
usar otro) hablando con el backend E2E del puerto 3001, no con el de
desarrollo. Ver [frontend-pruebas.md](frontend-pruebas.md), "Aislamiento
para E2E", para el procedimiento completo.

## Pruebas

Ver [frontend-pruebas.md](frontend-pruebas.md).

## Diseño y arquitectura

Ver [frontend-diseno.md](frontend-diseno.md) (referencia visual, sistema de
diseño mobile-first, estructura de carpetas) y
[mapa-del-sistema.md](mapa-del-sistema.md) (pantalla → ruta API →
controlador → servicio → modelo).
