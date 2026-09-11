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

test.describe('Caso de uso: registrar y cancelar una venta (cliente)', () => {
  test('iniciar sesión, buscar un producto, agregar al carrito, confirmar la compra y cancelarla', async ({ page }) => {
    await iniciarSesion(page, CLIENTE);
    await expect(page.getByRole('link', { name: /Mi cuenta/i })).toBeVisible();

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

    // Confirmar compra (checkout).
    await page.getByRole('button', { name: 'Confirmar compra' }).click();
    await expect(page).toHaveURL('/checkout');
    await page.getByRole('button', { name: 'Confirmar compra' }).click();

    // Debe redirigir al detalle de la venta recién creada, con su número.
    await expect(page).toHaveURL(/\/mis-compras\/\d+/);
    await expect(page.getByText(/¡Compra confirmada! Número de operación: #\d+/)).toBeVisible();
    await expect(page.getByText('registrada')).toBeVisible();

    // Cancelarla y verificar el cambio de estado, todo contra el backend real.
    await page.getByRole('button', { name: 'Cancelar venta' }).click();
    await expect(page.getByText('cancelada')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar venta' })).toHaveCount(0);

    // Debe aparecer en "Mis compras" con el estado actualizado.
    await page.getByRole('link', { name: '← Volver' }).click();
    await expect(page).toHaveURL('/mi-cuenta');
    await expect(page.getByText('Cancelada').first()).toBeVisible();
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
  test('un vendedor puede cargar una venta para un cliente y marcarla como enviada', async ({ page }) => {
    await iniciarSesion(page, VENDEDOR);
    await expect(page.getByRole('link', { name: /Panel \(vendedor\)/i })).toBeVisible();

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
    await expect(page.getByText('registrada')).toBeVisible();

    await page.getByRole('button', { name: 'Marcar como enviada' }).click();
    await expect(page.getByText('enviada')).toBeVisible();
  });
});
