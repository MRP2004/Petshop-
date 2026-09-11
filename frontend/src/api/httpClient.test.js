import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Corrección encontrada en una revisión independiente: el backend le agrega
// un sufijo al nombre de su cookie de CSRF según `ENTORNO`
// (backend/src/utils/sesion.js: "petshop_csrf_e2e" contra la instancia
// aislada de E2E, "petshop_csrf" en desarrollo). Antes, `NOMBRE_COOKIE_CSRF`
// acá estaba fijo en "petshop_csrf" sin importar el entorno: contra el
// backend E2E, `leerCookieCsrf()` nunca encontraba la cookie (nombre
// distinto), nunca mandaba `X-CSRF-Token`, y cualquier
// POST/PUT/PATCH/DELETE terminaba en 403 "Token CSRF inválido o ausente".
// Esta prueba reconstruye el módulo con `VITE_ENTORNO` en dos valores
// distintos (`vi.resetModules()` + import dinámico, porque el nombre se
// arma una sola vez al cargar el módulo) y confirma que el header que
// efectivamente se manda coincide con la cookie que existe en cada caso.
const limpiarCookies = () => {
  document.cookie = 'petshop_csrf=; Max-Age=0';
  document.cookie = 'petshop_csrf_e2e=; Max-Age=0';
};

beforeEach(() => {
  limpiarCookies();
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterEach(() => {
  limpiarCookies();
  vi.unstubAllEnvs();
});

describe('httpClient - nombre de la cookie CSRF según el entorno', () => {
  it('sin VITE_ENTORNO (desarrollo): lee "petshop_csrf" y la manda como X-CSRF-Token', async () => {
    document.cookie = 'petshop_csrf=token-dev';

    let opcionesVistas;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opciones) => {
        opcionesVistas = opciones;
        return { status: 204 };
      }),
    );

    const { solicitar } = await import('./httpClient.js');
    await solicitar('/algo', { metodo: 'POST', cuerpo: {} });

    expect(opcionesVistas.headers['X-CSRF-Token']).toBe('token-dev');
  });

  it('con VITE_ENTORNO=e2e: lee "petshop_csrf_e2e" (el mismo sufijo que agrega el backend E2E) y la manda como X-CSRF-Token', async () => {
    vi.stubEnv('VITE_ENTORNO', 'e2e');
    document.cookie = 'petshop_csrf_e2e=token-e2e';

    let opcionesVistas;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opciones) => {
        opcionesVistas = opciones;
        return { status: 204 };
      }),
    );

    const { solicitar } = await import('./httpClient.js');
    await solicitar('/algo', { metodo: 'POST', cuerpo: {} });

    expect(opcionesVistas.headers['X-CSRF-Token']).toBe('token-e2e');
  });

  it('con VITE_ENTORNO=e2e: la cookie SIN sufijo ("petshop_csrf", de una sesión de desarrollo) no se confunde con la de E2E', async () => {
    vi.stubEnv('VITE_ENTORNO', 'e2e');
    // Solo existe la cookie de desarrollo, no la de E2E: reproduce el bug
    // original (antes de la corrección, este caso mandaba igual el header
    // con el valor de la cookie equivocada).
    document.cookie = 'petshop_csrf=token-dev';

    let opcionesVistas;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opciones) => {
        opcionesVistas = opciones;
        return { status: 204 };
      }),
    );

    const { solicitar } = await import('./httpClient.js');
    await solicitar('/algo', { metodo: 'POST', cuerpo: {} });

    expect(opcionesVistas.headers['X-CSRF-Token']).toBeUndefined();
  });
});
