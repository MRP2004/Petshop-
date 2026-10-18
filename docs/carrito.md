# Carrito de compras

## Dónde se guarda

- Antes de iniciar sesión, el carrito es anónimo y vive en el
  `localStorage` del navegador. Puede sobrevivir a una recarga, pero no se
  comparte con otros navegadores ni dispositivos.
- Después de iniciar sesión, el carrito se carga y se modifica mediante la
  API autenticada y queda guardado en MySQL por `idUsuario`.
- Cada cuenta tiene un carrito independiente. Todos los roles autenticados
  pueden tener uno, pero la API obtiene el propietario de la sesión y no
  permite consultar o cambiar carritos de otras cuentas.

## Qué pasa al iniciar sesión

La aplicación espera a que el backend confirme la sesión y luego consulta
`GET /api/carrito`.

- Si la cuenta ya tiene productos, muestra ese carrito y descarta el carrito
  anónimo del navegador.
- Si la cuenta está vacía y había productos anónimos, los envía a
  `PUT /api/carrito/importar`. La API los guarda únicamente si la cuenta
  sigue vacía. Si otra operación ya agregó productos, conserva y devuelve el
  carrito de la cuenta, sin mezclar ni sobrescribir.
- Si no había carrito anónimo ni productos en la cuenta, el carrito empieza
  vacío.

Al cambiar de cuenta se oculta inmediatamente el carrito anterior mientras
se carga el nuevo. Al cerrar sesión, la copia local se limpia, pero el
carrito guardado en MySQL se conserva para que esa misma cuenta lo recupere
cuando vuelva a entrar. El usuario siguiente ve su propio carrito o uno
vacío, nunca el de la cuenta anterior.

## Cambiar el carrito y comprar

Con sesión activa, agregar, actualizar cantidad, quitar y vaciar utilizan
la API del backend. El navegador actualiza su vista con la respuesta del
servidor; si una operación falla, muestra un error en vez de fingir que se
guardó.

El carrito guarda producto y cantidad, no reserva stock ni fija el precio.
Una cantidad puede dejar de estar disponible antes de comprar; el checkout
vuelve a consultar los precios y validar el stock antes de confirmar la
venta. Al completarse la compra, el frontend solicita vaciar el carrito
persistido en la misma transacción del backend que registra la venta, el
pago, el comprobante y el descuento de stock. Si algo falla antes del
commit, tanto la compra como el vaciado se revierten; el carrito permanece
intacto. Un reintento idempotente de una compra anterior no vacía productos
que la persona haya agregado después.

## Piezas principales del código

- `frontend/src/models/Carrito.js`: reglas de agregar, quitar, cantidades,
  subtotal y conversión a los detalles que necesita el checkout.
- `frontend/src/context/CarritoContext.jsx`: estado compartido en React,
  recuperación del carrito anónimo, cambio seguro entre cuentas y
  sincronización con la API.
- `frontend/src/api/carrito.api.js`: solicitudes HTTP para leer y cambiar
  el carrito autenticado.
- `backend/src/models/itemCarrito.model.js`: relación persistida entre
  usuario, producto y cantidad.
- `backend/src/services/carrito.service.js`: validaciones y operaciones de
  base de datos; serializa cambios por usuario para evitar que se pisen.
- `backend/src/routes/carrito.routes.js` y
  `backend/src/controllers/carrito.controller.js`: rutas autenticadas y
  respuestas HTTP.

La regla de importación anónima tiene una protección adicional: una
transacción bloquea la fila del usuario mientras comprueba si el carrito
sigue vacío e inserta sus productos. Así dos importaciones/altas simultáneas
no pueden sobrescribir el resultado de la otra.
