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

describe('httpClient - el límite de tiempo también cubre la lectura del cuerpo', () => {
  // Corrección (revisión independiente): el límite anterior solo cubría
  // hasta que llegaban los encabezados — un `fetch()` que resolvía rápido
  // pero cuyo `.json()` nunca terminaba de leer el cuerpo se quedaba
  // esperando para siempre. Esta prueba simula EXACTAMENTE ese caso:
  // encabezados recibidos de inmediato (200, ok), pero `.json()` devuelve
  // una promesa que solo se resuelve/rechaza si el signal se aborta —
  // igual que un stream de verdad que nunca termina de llegar.
  it('encabezados recibidos con cuerpo que queda detenido: se corta al vencer el límite, como un fallo de conexión recuperable', async () => {
    vi.useFakeTimers();

    let signalDelPedido;
    vi.stubGlobal(
      'fetch',
      vi.fn((url, opciones) => {
        signalDelPedido = opciones.signal;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: (nombre) => (nombre === 'content-type' ? 'application/json' : null) },
          json: () =>
            new Promise((resolve, reject) => {
              signalDelPedido.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              });
            }),
        });
      }),
    );

    const { solicitar, ErrorApi: ErrorApiImportado } = await import('./httpClient.js');
    // El `.then(resolve, reject)` se engancha en la misma sincronía que la
    // llamada a solicitar(), antes de avanzar el reloj: evita que Node vea
    // un instante sin ningún handler enganchado a la promesa (que dispara
    // una advertencia de "rechazo no manejado" ruidosa, aunque inofensiva,
    // por la interacción entre temporizadores simulados y microtasks).
    const resultado = solicitar('/compras/intentos/x').then(
      (datos) => ({ resuelto: true, datos }),
      (error) => ({ resuelto: false, error }),
    );

    // Deja que fetch() resuelva (microtask) antes de avanzar el reloj: el
    // punto es que los ENCABEZADOS ya llegaron cuando arranca el timeout
    // sobre la lectura del cuerpo, no que nunca haya habido respuesta.
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15000);

    const { resuelto, error } = await resultado;

    expect(resuelto).toBe(false);
    expect(error).toBeInstanceOf(ErrorApiImportado);
    expect(error.status).toBe(0);
    expect(error.message).toBe('No se pudo conectar con el servidor. Verificá tu conexión.');

    vi.useRealTimers();
  });
});
