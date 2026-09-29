import { test, expect } from '@playwright/test';

// Cuentas y catálogo creados por `backend/scripts/sembrarDatosE2E.js`
// (`npm run sembrar:e2e`), contra la base AISLADA petshop_e2e — estas
// pruebas escriben (confirman una compra, cargan una venta manual) y ya no
// corren contra la base de desarrollo (ver docs/frontend-pruebas.md,
// "Aislamiento para E2E"). `playwright.config.js` verifica antes de
// arrancar que el backend en el puerto configurado efectivamente reporte
// `entorno: "e2e"`, así que estas pruebas no pueden terminar escribiendo
// sobre petshop_db por una configuración incorrecta.
const CLIENTE = { email: 'cliente@petshop-e2e.test', password: 'E2EDemo1234Client' };
const VENDEDOR = { email: 'vendedor@petshop-e2e.test', password: 'E2EDemo1234Vende' };

const iniciarSesion = async (page, { email, password }) => {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  // Esperar a que la sesión realmente se haya guardado (el login es
  // asíncrono) antes de seguir: si no, un page.goto() inmediato después
  // puede interrumpir el pedido en curso y dejar la sesión sin iniciar.
  await page.waitForURL((url) => !url.pathname.includes('/iniciar-sesion'));
};

test.describe('Caso de uso: registrar una venta y solicitar su cancelación (cliente + personal)', () => {
  test('iniciar sesión, buscar un producto, agregar al carrito, confirmar la compra, solicitar la cancelación y que el personal la apruebe', async ({ page }) => {
    await iniciarSesion(page, CLIENTE);
    // Ronda 2: el encabezado ya no muestra un enlace suelto "Mi cuenta" —
    // muestra el nombre real de quien inició sesión (nombre sembrado por
    // sembrarDatosDemo.js/sembrarDatosE2E.js: "Cliente"), botón que abre el
    // menú de cuenta (ver Navbar.jsx/CuentaMenu.jsx).
    await expect(page.getByRole('button', { name: 'Cliente' })).toBeVisible();

    // Buscar producto desde el buscador de la navegación.
    await page.getByPlaceholder('Buscar alimentos, juguetes, accesorios…').fill('Pelota');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(/\/catalogo\?buscar=Pelota/);
    await expect(page.getByText('Pelota de goma resistente')).toBeVisible();

    // Agregar al carrito desde la tarjeta del catálogo.
    await page
      .locator('.product-card', { hasText: 'Pelota de goma resistente' })
      .getByRole('button', { name: /Agregar al carrito/i })
      .click();

    await page.locator('.navbar__carrito').click();
    await expect(page).toHaveURL('/carrito');
    await expect(page.getByText('Pelota de goma resistente')).toBeVisible();

    // Confirmar compra (checkout) — CU-04: cotiza contra el backend antes de
    // mostrar el resumen, y ofrece pago simulado (transferencia por
    // defecto, que se aprueba siempre — ver pagoSimulado.service.js).
    await page.getByRole('button', { name: 'Confirmar compra' }).click();
    await expect(page).toHaveURL('/checkout');
    await expect(page.getByTestId('checkout-total')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar y pagar' }).click();

    // Debe redirigir al detalle de la venta recién creada, con su número.
    await expect(page).toHaveURL(/\/mis-compras\/(\d+)/);
    const idVenta = /\/mis-compras\/(\d+)/.exec(page.url())[1];
    await expect(page.getByText(/¡Compra confirmada! Número de operación: #\d+/)).toBeVisible();
    await expect(page.getByText('registrada')).toBeVisible();
    // Comprobante generado por el checkout con pago simulado (CU-04).
    await expect(page.getByText(/^Comprobante: PS-\d{4}-\d{6}$/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Descargar comprobante/i })).toBeVisible();

    // Corrección (CU-04, revisión de Mauro sobre la venta #20): el cliente
    // YA NO puede cancelar directamente — no existe "Cancelar venta" para
    // él, solo "Solicitar cancelación", que NO cambia el estado por sí sola.
    await expect(page.getByRole('button', { name: 'Cancelar venta' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Solicitar cancelación' }).click();
    await expect(page.getByText(/Solicitud de cancelación enviada, pendiente de revisión/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Solicitar cancelación' })).toHaveCount(0);
    // El estado del pedido sigue "registrada": la solicitud no cancela nada.
    await expect(page.getByText('registrada')).toBeVisible();

    // Ronda 2: "Salir" vive dentro del menú de cuenta y pide confirmación
    // (ConfirmDialog "¿Querés cerrar sesión?", ver Navbar.jsx) antes de
    // cerrar la sesión de verdad.
    await page.getByRole('button', { name: 'Cliente' }).click();
    await page.getByRole('menuitem', { name: 'Salir' }).click();
    const dialogoSalir = page.getByRole('alertdialog');
    await dialogoSalir.getByRole('button', { name: 'Salir' }).click();
    await expect(page.getByRole('link', { name: /Ingresar/i })).toBeVisible();

    // El personal ve la solicitud pendiente y la aprueba (con confirmación
    // explícita — ver VentaDetalle.jsx): reutiliza la misma cancelación
    // transaccional que la cancelación directa.

    await iniciarSesion(page, VENDEDOR);
    await expect(page.getByRole('button', { name: /Panel \(vendedor\)/i })).toBeVisible();
    await page.goto(`/panel/ventas/${idVenta}`);
    await expect(page.getByText(/Solicitud de cancelación pendiente de tu revisión/)).toBeVisible();

    // Ronda 2: window.confirm nativo reemplazado por ConfirmDialog.
    await page.getByRole('button', { name: 'Aprobar solicitud de cancelación' }).click();
    const dialogoAprobar = page.getByRole('alertdialog');
    await dialogoAprobar.getByRole('button', { name: 'Aprobar solicitud de cancelación' }).click();

    await expect(page.getByText('cancelada')).toBeVisible();
    await expect(page.getByRole('button', { name: /Aprobar solicitud/i })).toHaveCount(0);
  });
});

// Agrega el producto de prueba al carrito y llega hasta /checkout con la
// cotización ya cargada — paso común a varios de los escenarios de abajo.
const llegarAlCheckoutConPelota = async (page) => {
  await page.getByPlaceholder('Buscar alimentos, juguetes, accesorios…').fill('Pelota');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page
    .locator('.product-card', { hasText: 'Pelota de goma resistente' })
    .getByRole('button', { name: /Agregar al carrito/i })
    .click();
  await page.locator('.navbar__carrito').click();
  await page.getByRole('button', { name: 'Confirmar compra' }).click();
  await expect(page).toHaveURL('/checkout');
  await expect(page.getByTestId('checkout-total')).toBeVisible();
};

test.describe('Caso de uso: pago con débito simulado (CU-04)', () => {
  test('débito aprobado (tarjeta de demostración) confirma la compra', async ({ page }) => {
    await iniciarSesion(page, CLIENTE);
    await llegarAlCheckoutConPelota(page);

    await page.getByLabel(/Débito \(simulado\)/i).check();
    await page.getByLabel('Número de tarjeta').fill('4000000000000002');
    await page.getByLabel('Titular').fill('Cliente De Prueba');
    await page.getByLabel('Vencimiento (MM/AA)').fill('12/30');
    await page.getByLabel('Código de seguridad').fill('123');
    await page.getByRole('button', { name: 'Confirmar y pagar' }).click();

    await expect(page).toHaveURL(/\/mis-compras\/\d+/);
    await expect(page.getByText(/Débito simulado, terminada en 0002/)).toBeVisible();
    await expect(page.getByText(/Aprobado — simulación/)).toBeVisible();
  });

  test('débito rechazado (tarjeta de demostración) muestra el motivo, no confirma la compra, y permite reintentar de inmediato', async ({ page }) => {
    await iniciarSesion(page, CLIENTE);
    await llegarAlCheckoutConPelota(page);

    await page.getByLabel(/Débito \(simulado\)/i).check();
    await page.getByLabel('Número de tarjeta').fill('4000000000000010');
    await page.getByLabel('Titular').fill('Cliente De Prueba');
    await page.getByLabel('Vencimiento (MM/AA)').fill('12/30');
    await page.getByLabel('Código de seguridad').fill('123');
    await page.getByRole('button', { name: 'Confirmar y pagar' }).click();

    await expect(page.getByText(/Pago rechazado \(simulado\)/)).toBeVisible();
    await expect(page.getByText(/rechazado por el banco/i)).toBeVisible();
    await expect(page).toHaveURL('/checkout');

    // Un rechazo recibido normalmente (sin perder la respuesta) ya limpia
    // la clave del lado del cliente (ver Checkout.jsx): un intento nuevo e
    // intencional con el mismo carrito debe poder confirmarse enseguida,
    // sin ninguna pantalla intermedia.
    await page.getByLabel(/Transferencia \(simulada/i).check();
    await page.getByRole('button', { name: 'Confirmar y pagar' }).click();
    await expect(page).toHaveURL(/\/mis-compras\/\d+/);
  });

  test('débito rechazado CON la respuesta perdida: al recargar, se recupera el rechazo y exige un intento nuevo explícito', async ({ page }) => {
    // Mismo mecanismo que el test de recuperación de una compra APROBADA
    // (route.fetch() + route.abort()): el servidor procesa el rechazo de
    // verdad (queda un IntentoCompra 'rechazado'), pero el navegador nunca
    // ve esa respuesta.
    await iniciarSesion(page, CLIENTE);
    await llegarAlCheckoutConPelota(page);

    await page.getByLabel(/Débito \(simulado\)/i).check();
    await page.getByLabel('Número de tarjeta').fill('4000000000000010');
    await page.getByLabel('Titular').fill('Cliente De Prueba');
    await page.getByLabel('Vencimiento (MM/AA)').fill('12/30');
    await page.getByLabel('Código de seguridad').fill('123');

    await page.route('**/api/compras', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fetch();
      await route.abort('failed');
    });

    await page.getByRole('button', { name: 'Confirmar y pagar' }).click();
    await expect(page.getByText(/No se pudo conectar con el servidor/i)).toBeVisible();

    await page.unroute('**/api/compras');
    await page.reload();

    await expect(page.getByRole('button', { name: /Iniciar un nuevo intento/i })).toBeVisible();
    await expect(page.getByText(/rechazado por el banco/i)).toBeVisible();
    await page.getByRole('button', { name: /Iniciar un nuevo intento/i }).click();
    await expect(page.getByTestId('checkout-total')).toBeVisible();
  });

  test('descarga real del PDF del comprobante (no solo que el botón exista)', async ({ page }) => {
    await iniciarSesion(page, CLIENTE);
    await llegarAlCheckoutConPelota(page);
    await page.getByRole('button', { name: 'Confirmar y pagar' }).click();
    await expect(page).toHaveURL(/\/mis-compras\/\d+/);

    const descargaPromesa = page.waitForEvent('download');
    await page.getByRole('button', { name: /Descargar comprobante/i }).click();
    const descarga = await descargaPromesa;

    expect(descarga.suggestedFilename()).toMatch(/^PS-\d{4}-\d{6}\.pdf$/);
    const ruta = await descarga.path();
    const { statSync } = await import('node:fs');
    expect(statSync(ruta).size).toBeGreaterThan(500); // un PDF real, no una respuesta vacía o de error
  });
});

test.describe('Caso de uso: recuperación tras perder la respuesta (CU-04, §1)', () => {
  test('la venta se confirma en el servidor aunque el navegador no reciba la respuesta, y se recupera al recargar', async ({ page }) => {
    await iniciarSesion(page, CLIENTE);
    await llegarAlCheckoutConPelota(page);

    // El servidor procesa la compra de verdad (route.fetch() manda la
    // solicitud real), pero el navegador nunca recibe esa respuesta
    // (route.abort() después): simula exactamente el escenario del
    // problema reportado — stock ya descontado, venta ya creada, y el
    // cliente viendo un error de conexión en pantalla.
    await page.route('**/api/compras', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fetch();
      await route.abort('failed');
    });

    await page.getByRole('button', { name: 'Confirmar y pagar' }).click();
    await expect(page.getByText(/No se pudo conectar con el servidor/i)).toBeVisible();
    await expect(page).toHaveURL('/checkout');

    // Se quita la intercepción y se recarga: la recuperación debe encontrar
    // el intento ya aprobado (GET /api/compras/intentos/:clave) y navegar
    // directo al comprobante, sin pedir de nuevo los datos de pago.
    await page.unroute('**/api/compras');
    await page.reload();

    await expect(page).toHaveURL(/\/mis-compras\/\d+/, { timeout: 10000 });
    await expect(page.getByText(/^Comprobante: PS-\d{4}-\d{6}$/)).toBeVisible();
  });
});

test.describe('Acceso denegado y errores visibles', () => {
  test('sin sesión, entrar a /panel redirige a iniciar sesión', async ({ page }) => {
    await page.goto('/panel');
    await expect(page).toHaveURL(/\/iniciar-sesion/);
  });

  test('credenciales incorrectas muestran un mensaje de error visible', async ({ page }) => {
    // No usa el helper iniciarSesion(): a propósito, nunca navega fuera de
    // /iniciar-sesion, así que esperar esa navegación (como hace el helper)
    // se colgaría hasta el timeout.
    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(CLIENTE.email);
    await page.getByLabel('Contraseña').fill('contraseña-incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page.getByText('Correo o contraseña incorrectos')).toBeVisible();
    await expect(page).toHaveURL(/\/iniciar-sesion/);
  });

  test('un cliente autenticado no puede entrar al panel de personal', async ({ page }) => {
    await iniciarSesion(page, CLIENTE);
    await page.goto('/panel');
    // RutaProtegida redirige a "/" cuando el rol no alcanza (ver App.jsx).
    // URL relativa a `baseURL` (ver playwright.config.js): no hardcodea el
    // puerto, así corre igual contra el frontend de desarrollo o el
    // aislado de E2E.
    await expect(page).toHaveURL('/');
  });
});

test.describe('Caso de uso: marcar una venta como enviada (personal)', () => {
  // Ronda 2, Etapa 7 (estados de pedido: retiro vs. envío): PanelNuevaVenta
  // arranca en "retiro en sucursal" por defecto (ver
  // PanelNuevaVenta.jsx#metodoEntrega), así que la transición real ahora es
  // "lista_para_retirar" -> "entregada" para esta venta, NO "enviada" como
  // antes de esta etapa (ese era exactamente el defecto que esta etapa
  // corrige: un retiro en sucursal ya no se muestra como "enviada").
  test('un vendedor puede cargar una venta de retiro en sucursal para un cliente y llevarla hasta entregada', async ({ page }) => {
    await iniciarSesion(page, VENDEDOR);
    await expect(page.getByRole('button', { name: /Panel \(vendedor\)/i })).toBeVisible();

    await page.goto('/panel/ventas/nueva');
    await page.getByLabel('Cliente').selectOption({ label: 'Cliente De Prueba' });
    await page.getByLabel('Medio de pago').selectOption({ index: 1 });
    const selectorProducto = page.locator('.panel-nueva-venta__agregar select');
    const opcionRascador = selectorProducto.locator('option', { hasText: 'Rascador para gatos' });
    await selectorProducto.selectOption({ value: await opcionRascador.getAttribute('value') });
    await page.getByRole('button', { name: 'Agregar' }).click();
    await expect(page.locator('.panel-nueva-venta__lineas')).toContainText('Rascador para gatos');

    await page.getByRole('button', { name: 'Registrar venta' }).click();
    await expect(page).toHaveURL(/\/panel\/ventas\/\d+/);
    await expect(page.getByText('Registrada')).toBeVisible();

    await page.getByRole('button', { name: 'Marcar lista para retirar' }).click();
    await expect(page.getByText('Lista para retirar')).toBeVisible();

    await page.getByRole('button', { name: 'Marcar como entregada' }).click();
    await expect(page.getByText('Entregada')).toBeVisible();
  });

  // Corrección (CU-04, revisión de Mauro sobre la venta #20): la cancelación
  // DIRECTA sigue existiendo, pero exclusiva del personal, con confirmación
  // explícita antes de ejecutarla (ver VentaDetalle.jsx#cancelar).
  test('un vendedor cancela una venta directamente, con confirmación explícita antes de ejecutarla', async ({ page }) => {
    await iniciarSesion(page, VENDEDOR);
    await expect(page.getByRole('button', { name: /Panel \(vendedor\)/i })).toBeVisible();

    await page.goto('/panel/ventas/nueva');
    await page.getByLabel('Cliente').selectOption({ label: 'Cliente De Prueba' });
    await page.getByLabel('Medio de pago').selectOption({ index: 1 });
    const selectorProducto = page.locator('.panel-nueva-venta__agregar select');
    const opcionPelota = selectorProducto.locator('option', { hasText: 'Pelota de goma resistente' });
    await selectorProducto.selectOption({ value: await opcionPelota.getAttribute('value') });
    await page.getByRole('button', { name: 'Agregar' }).click();
    await expect(page.locator('.panel-nueva-venta__lineas')).toContainText('Pelota de goma resistente');

    await page.getByRole('button', { name: 'Registrar venta' }).click();
    await expect(page).toHaveURL(/\/panel\/ventas\/\d+/);
    await expect(page.getByText('registrada')).toBeVisible();

    // Ronda 2: window.confirm nativo reemplazado por ConfirmDialog (ver
    // VentaDetalle.jsx) — ya no hay diálogo nativo del navegador que aceptar.
    await page.getByRole('button', { name: 'Cancelar venta' }).click();
    const dialogoCancelar = page.getByRole('alertdialog');
    await dialogoCancelar.getByRole('button', { name: 'Cancelar venta' }).click();

    await expect(page.getByText('cancelada')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar venta' })).toHaveCount(0);
  });
});
