import { test } from '@playwright/test';
import path from 'node:path';

// No es una prueba de verificación (no hace assert): recorre pantallas
// clave y guarda una captura de cada una, como evidencia visual para la
// entrega. Deliberadamente de SOLO LECTURA: no confirma ninguna compra
// (POST /api/ventas) ni ninguna otra escritura, solo navega e inicia sesión
// (Usuario.findOne es una lectura). Corre contra el mismo frontend/backend
// aislado de E2E que el resto de e2e/ (ver playwright.config.js): aunque no
// escribe, usa las cuentas que siembra `npm run sembrar:e2e`, no las de
// desarrollo — así nunca hace falta decidir caso por caso si esta suite en
// particular es segura de correr contra petshop_db.
const DIR = path.resolve('e2e/capturas-salida');

const CLIENTE = { email: 'cliente@petshop-e2e.test', password: 'E2EDemo1234Client' };
const VENDEDOR = { email: 'vendedor@petshop-e2e.test', password: 'E2EDemo1234Vende' };

test.describe.configure({ mode: 'serial' });

test('capturas de solo lectura (no confirman ninguna compra)', async ({ page }, testInfo) => {
  // Cada proyecto (sm-mobile/md-tablet/lg-desktop, ver playwright.config.js)
  // corre este mismo test una vez por viewport: sin el nombre del proyecto
  // en la carpeta, las tres corridas escribirían el mismo archivo encima y
  // solo sobreviviría la última.
  const dirProyecto = path.join(DIR, testInfo.project.name);
  const capturar = (archivo) => page.screenshot({ path: path.join(dirProyecto, archivo), fullPage: true });

  await page.goto('/');
  await page.waitForSelector('.home__grilla .product-card, .estado-solicitud');
  await capturar('01-inicio.png');

  await page.goto('/catalogo');
  await page.waitForSelector('.catalogo__grilla .product-card');
  await capturar('02-catalogo.png');

  await page.locator('.product-card').first().click();
  await page.waitForSelector('.producto-detalle');
  await capturar('03-detalle-producto.png');

  await page.goto('/promociones');
  await page.waitForSelector('.promociones__aviso');
  await capturar('04-promociones.png');

  // Agregar al carrito es solo estado local (React + localStorage): no
  // manda ninguna solicitud al backend, así que no escribe nada en la base.
  await page.goto('/catalogo');
  await page.locator('.product-card').first().locator('button').click();
  await page.goto('/carrito');
  await page.waitForSelector('.carrito__lista');
  await capturar('05-carrito.png');

  // Iniciar sesión: Usuario.findOne es una lectura, no escribe nada.
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(CLIENTE.email);
  await page.getByLabel('Contraseña').fill(CLIENTE.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/iniciar-sesion'));

  await page.goto('/checkout');
  await page.waitForSelector('.checkout__formulario');
  // Se elige "envío a domicilio" solo para mostrar el campo de dirección
  // nuevo en la captura; no se hace click en "Confirmar compra".
  await page.selectOption('#entrega', 'envío a domicilio');
  await page.getByLabel('Dirección de entrega').fill('Av. Siempre Viva 742, Rosario');
  await capturar('06-checkout.png');

  await page.goto('/mi-cuenta');
  await page.waitForSelector('.mi-cuenta__lista, .estado-solicitud');
  await capturar('07-mi-cuenta.png');

  // No hace falta "cerrar sesión" explícitamente: iniciar sesión de nuevo
  // (como otro usuario) simplemente sobrescribe la cookie de sesión con el
  // nuevo token.
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(VENDEDOR.email);
  await page.getByLabel('Contraseña').fill(VENDEDOR.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/iniciar-sesion'));

  await page.goto('/panel');
  await page.waitForLoadState('networkidle');
  await capturar('08-panel-inicio.png');

  await page.goto('/panel/ventas');
  await page.waitForSelector('.gestion-entidad__tabla, table');
  await capturar('09-panel-ventas.png');

  await page.goto('/panel/productos');
  await page.waitForSelector('.gestion-entidad__tabla-scroll');
  await capturar('10-panel-productos.png');
});
