import { test, expect } from '@playwright/test';
import { loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Ronda 2, Etapa 9: recorrido completo del vendedor independiente contra la
// base aislada petshop_e2e. Cada corrida (y cada viewport) registra su PROPIA
// cuenta aspirante con un email único: nunca cambia el rol de las cuentas
// sembradas por sembrarDatosE2E.js (en la Etapa 8, una verificación manual que
// usó la cuenta cliente sembrada la convirtió en vendedor y rompió otras
// pruebas). El cliente sembrado solo compra, igual que en el resto de la suite.
const CLIENTE = { email: 'cliente@petshop-e2e.test', password: 'E2EDemo1234Client' };
const ADMINISTRADOR = { email: 'admin@petshop-e2e.test', password: 'E2EDemo1234Admin' };
const PASSWORD_ASPIRANTE = 'E2EAspirante1234';
const CUIL_VALIDO = '20-17254359-7'; // dígito verificador real, ver backend/test/validacionFiscal.test.js

const RAIZ_FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_API = loadEnv('e2e', RAIZ_FRONTEND, '').VITE_API_URL;

const iniciarSesion = async (page, { email, password }) => {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/iniciar-sesion'));
};

test('vendedor independiente: solicitud, aprobación, nueva sesión, producto propio, compra de un cliente, aviso y "Mis ventas"', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(120_000);

  // Un contexto por persona (sesiones separadas), con la misma baseURL y
  // viewport del proyecto: browser.newContext() no los hereda solo.
  const { baseURL, viewport } = testInfo.project.use;
  const nuevoContexto = () => browser.newContext({ baseURL, viewport });
  const dirCapturas = path.resolve('e2e/capturas-salida', testInfo.project.name);
  const capturar = (pagina, archivo) => pagina.screenshot({ path: path.join(dirCapturas, archivo), fullPage: true });

  const sufijo = `${testInfo.project.name}-${Date.now()}`;
  const aspirante = { email: `aspirante-${sufijo}@petshop-e2e.test`, password: PASSWORD_ASPIRANTE };
  const nombreTienda = `Tienda E2E ${sufijo}`;
  const nombreProducto = `Rascador E2E ${sufijo}`;

  // Alta de la cuenta por la API pública de registro (el formulario de
  // registro ya tiene su propia cobertura); desde acá, todo es por la UI.
  const registro = await request.post(`${URL_API}/usuarios/registro`, {
    data: { ...aspirante, nombre: 'Aspirante', apellido: 'Vendedor' },
  });
  expect(registro.status()).toBe(201);

  // 1. Solicitud "Quiero ser vendedor".
  const contextoAspirante = await nuevoContexto();
  const paginaAspirante = await contextoAspirante.newPage();
  await iniciarSesion(paginaAspirante, aspirante);
  await paginaAspirante.goto('/quiero-vender');
  await paginaAspirante.getByLabel('Nombre de tu tienda').fill(nombreTienda);
  await paginaAspirante.getByLabel('CUIL').fill(CUIL_VALIDO);
  await capturar(paginaAspirante, '11-quiero-vender.png');
  await paginaAspirante.getByRole('button', { name: /Enviar/i }).click();
  await expect(paginaAspirante.getByRole('heading', { name: 'Solicitud enviada' })).toBeVisible();

  // Con la sesión todavía de cliente, el panel no está disponible.
  await paginaAspirante.goto('/panel/mis-ventas');
  await expect(paginaAspirante).toHaveURL('/');
  await contextoAspirante.close();

  // 2. Aprobación por el administrador.
  const contextoAdmin = await nuevoContexto();
  const paginaAdmin = await contextoAdmin.newPage();
  await iniciarSesion(paginaAdmin, ADMINISTRADOR);
  await paginaAdmin.goto('/panel/solicitudes-vendedor');
  const fila = paginaAdmin.getByRole('row', { name: new RegExp(nombreTienda) });
  await expect(fila).toBeVisible();
  await capturar(paginaAdmin, '12-panel-solicitudes-vendedor.png');
  await fila.getByRole('button', { name: 'Aprobar' }).click();
  await paginaAdmin.getByRole('alertdialog').getByRole('button', { name: 'Aprobar' }).click();
  await expect(paginaAdmin.getByRole('row', { name: new RegExp(nombreTienda) }).getByRole('button', { name: 'Aprobar' })).toHaveCount(0);
  await contextoAdmin.close();

  // 3. Nueva sesión: ahora es vendedor independiente y crea su producto.
  const contextoVendedor = await nuevoContexto();
  const paginaVendedor = await contextoVendedor.newPage();
  await iniciarSesion(paginaVendedor, aspirante);
  await paginaVendedor.goto('/panel');
  await expect(paginaVendedor.getByRole('heading', { name: nombreTienda })).toBeVisible();
  await paginaVendedor.getByRole('button', { name: '+ Nuevo' }).click();
  await paginaVendedor.getByLabel('Nombre', { exact: true }).fill(nombreProducto);
  await paginaVendedor.getByLabel('Precio', { exact: true }).fill('1234.50');
  await paginaVendedor.getByLabel('Stock mínimo', { exact: true }).fill('1');
  await paginaVendedor.getByLabel('Stock inicial', { exact: true }).fill('5');
  await paginaVendedor.getByRole('button', { name: 'Guardar' }).click();
  await expect(paginaVendedor.getByRole('cell', { name: nombreProducto })).toBeVisible();
  await capturar(paginaVendedor, '13-panel-mi-tienda.png');

  // Acceso por URL directa a secciones del personal interno: denegado.
  await paginaVendedor.goto('/panel/ventas');
  await expect(paginaVendedor).toHaveURL('/');

  // 4. Un cliente compra ese producto (lo encuentra con el buscador, ve "Vendido por").
  const contextoCliente = await nuevoContexto();
  const paginaCliente = await contextoCliente.newPage();
  await iniciarSesion(paginaCliente, CLIENTE);
  await paginaCliente.getByPlaceholder('Buscar alimentos, juguetes, accesorios…').fill(nombreProducto);
  await paginaCliente.getByRole('button', { name: 'Buscar' }).click();
  const tarjeta = paginaCliente.locator('.product-card', { hasText: nombreProducto });
  await expect(tarjeta.getByText(nombreTienda)).toBeVisible();
  await tarjeta.getByRole('button', { name: /Agregar al carrito/i }).click();
  await paginaCliente.locator('.navbar__carrito').click();
  await paginaCliente.getByRole('button', { name: 'Confirmar compra' }).click();
  await expect(paginaCliente.getByTestId('checkout-total')).toBeVisible();
  await paginaCliente.getByRole('button', { name: 'Confirmar y pagar' }).click();
  await expect(paginaCliente).toHaveURL(/\/mis-compras\/\d+/);
  const idVenta = paginaCliente.url().match(/\/mis-compras\/(\d+)/)[1];

  // El cliente tampoco entra a "Mis ventas" por URL directa.
  await paginaCliente.goto('/panel/mis-ventas');
  await expect(paginaCliente).toHaveURL('/');
  await contextoCliente.close();

  // 5. El vendedor recibe el aviso y lo abre: llega a "Mis ventas" con su línea y su subtotal.
  await paginaVendedor.goto('/panel');
  const campana = paginaVendedor.getByRole('button', { name: /Notificaciones, \d+ sin leer/ });
  await expect(campana).toBeVisible({ timeout: 40_000 });
  await campana.click();
  await paginaVendedor
    .getByRole('region', { name: 'Notificaciones' })
    .getByRole('link', { name: new RegExp(`Nueva venta #${idVenta} con productos de tu tienda`) })
    .click();
  await expect(paginaVendedor).toHaveURL('/panel/mis-ventas');

  const filaVenta = paginaVendedor.getByRole('row', { name: new RegExp(`#${idVenta}`) });
  await expect(filaVenta).toContainText(`1 × ${nombreProducto}`);
  await expect(filaVenta).toContainText(/1\.234,50/);
  await expect(paginaVendedor.getByText(/lo gestiona el personal de PetShop/)).toBeVisible();
  await capturar(paginaVendedor, '14-panel-mis-ventas.png');
  await contextoVendedor.close();
});
