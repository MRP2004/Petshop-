// Corrección de esta etapa: antes, nada impedía que Playwright corriera
// contra el backend de desarrollo por una configuración equivocada (puerto
// mal copiado, servidor E2E no levantado). Esto se ejecuta UNA VEZ antes de
// cualquier prueba (globalSetup, ver playwright.config.js) y aborta toda la
// corrida si el backend con el que va a hablar el frontend no es, de
// verdad, la instancia aislada de E2E — así ninguna prueba llega a
// ejecutarse (ni a escribir nada) contra la base equivocada.
//
// Corrección (revisión independiente): esto antes verificaba una URL
// configurada de forma INDEPENDIENTE (E2E_BACKEND_URL) y solo un campo
// autodeclarado (`entorno`, el valor de una variable de entorno del
// backend). Ninguna de las dos cosas garantizaba nada: E2E_BACKEND_URL
// podía divergir de VITE_API_URL (la URL que el frontend REALMENTE usa,
// ver src/api/httpClient.js) sin que nada lo notara, y `entorno` se le
// podía haber olvidado a alguien en .env.e2e sin que afectara a DB_NAME.
// Ahora se lee la misma configuración que usa el frontend
// (frontend/.env.e2e, con la misma utilidad que usa Vite para esto,
// `loadEnv`) y se confirma la base y el usuario de conexión EFECTIVOS del
// backend (ver /api/health/aislamiento en backend/src/app.js), no solo
// cómo se autodenomina.
import { chromium } from '@playwright/test';
import { loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Mismos valores por defecto que backend/scripts/sembrarDatosE2E.js —
// comparación exacta, no un patrón. El host viene de DB_HOST en
// backend/.env.e2e.example ("localhost"): CURRENT_USER() de MySQL siempre
// devuelve "usuario@host", así que sin el host la comparación no sería
// realmente exacta (revisión independiente — antes solo comprobaba el
// prefijo antes de la "@", aceptando cualquier host).
const BASE_ESPERADA = process.env.E2E_DB_NAME_ESPERADA || 'petshop_e2e';
const USUARIO_ESPERADO = process.env.E2E_DB_USER_ESPERADO || 'petshop_e2e_app';
const HOST_ESPERADO = process.env.E2E_DB_HOST_ESPERADO || 'localhost';
const USUARIO_CONEXION_ESPERADO = `${USUARIO_ESPERADO}@${HOST_ESPERADO}`;

// Corrección (revisión posterior): todo lo de arriba confirma la base y el
// usuario reales del BACKEND — pero no dice nada sobre si el proceso de
// Vite que sirve el frontend en :5183 arrancó, de verdad, con ese mismo
// VITE_API_URL. Releer frontend/.env.e2e (como hace loadEnv más abajo) NO
// alcanza: si ese proceso ya estaba corriendo con otra configuración (por
// ejemplo, arrancado a mano con una variable de entorno del shell que
// pisa lo que dice el archivo), esto seguiría sin notarlo. La única forma
// de saber contra qué backend habla el frontend REALMENTE SERVIDO es
// observar una petición real que haga: se navega a la página de inicio
// (que pide el catálogo apenas carga, ver src/pages/Home.jsx) con un
// navegador real de Playwright, y se compara el origen de esa petición
// contra el backend ya confirmado arriba.
const asegurarFrontendUsaBackendValidado = async (baseURLFrontend, urlBackendValidado) => {
  const navegador = await chromium.launch();

  try {
    const pagina = await navegador.newPage();

    // El "pathname" exacto, no "incluye": el propio Vite sirve el código
    // fuente del cliente HTTP como /src/api/productos.api.js (contiene la
    // subcadena "/api/productos" sin ser, ni de cerca, el pedido real al
    // backend) — confirmado con tráfico real capturado en una corrida de
    // prueba, que se enganchaba con esa petición en vez de con la
    // verdadera y reportaba el origen del propio frontend como backend.
    //
    // Corrección (revisión independiente, Codex): además del pathname,
    // el método tiene que ser GET — httpClient.js manda
    // "Content-Type: application/json" incluso en un GET, lo que lo hace
    // "no simple" para CORS y dispara un preflight OPTIONS al mismo
    // pathname antes del GET real; sin filtrar por método, esta espera
    // podía resolverse con ese OPTIONS en vez de con el pedido real.
    const esperaPeticionApi = pagina.waitForRequest(
      (peticion) => peticion.method() === 'GET' && new URL(peticion.url()).pathname === '/api/productos/catalogo',
      { timeout: 15_000 },
    );

    try {
      await pagina.goto(baseURLFrontend);
    } catch (error) {
      throw new Error(
        `No se pudo abrir el frontend en ${baseURLFrontend} (${error.message}). ` +
          '¿Está corriendo `npm run dev:e2e` en frontend/? Abortando: no se corre ' +
          'ninguna prueba E2E sin confirmar contra qué backend habla el frontend ' +
          'realmente servido.',
        { cause: error },
      );
    }

    let peticion;
    try {
      peticion = await esperaPeticionApi;
    } catch (error) {
      throw new Error(
        `El frontend en ${baseURLFrontend} no pidió el catálogo (GET .../api/productos/catalogo) ` +
          `dentro de 15s al cargar la página de inicio. Abortando: sin esa petición no ` +
          'hay forma de confirmar contra qué backend habla de verdad.',
        { cause: error },
      );
    }

    const origenReal = new URL(peticion.url()).origin;

    if (origenReal !== urlBackendValidado) {
      throw new Error(
        `El frontend servido en ${baseURLFrontend} está pidiendo el catálogo a ` +
          `"${origenReal}" de verdad, distinto del backend ya confirmado aislado ` +
          `("${urlBackendValidado}"). Esto pasa si el proceso de Vite arrancó con una ` +
          'VITE_API_URL distinta a la de frontend/.env.e2e (por ejemplo, una variable ' +
          'de entorno del shell pisándola) — abortando antes de correr ninguna prueba ' +
          'que escriba contra ese backend no confirmado.',
      );
    }

    console.log(
      `[globalSetup] Frontend servido en ${baseURLFrontend} confirmado pidiendo ` +
        `el catálogo de verdad a ${origenReal}.`,
    );
  } finally {
    await navegador.close();
  }
};

const globalSetupAislamiento = async (config) => {
  const envFrontend = loadEnv('e2e', RAIZ_FRONTEND, '');
  const urlApi = envFrontend.VITE_API_URL;

  if (!urlApi) {
    throw new Error(
      'frontend/.env.e2e no define VITE_API_URL: sin esto no hay forma de saber ' +
        'contra qué backend va a hablar el frontend que Playwright va a probar. ' +
        '¿Falta copiar frontend/.env.e2e.example a frontend/.env.e2e? Abortando.',
    );
  }

  const urlBackend = urlApi.replace(/\/api\/?$/, '');

  let respuesta;
  try {
    respuesta = await fetch(`${urlBackend}/api/health/aislamiento`);
  } catch (error) {
    throw new Error(
      `No se pudo conectar con el backend en ${urlBackend} (${error.message}). ` +
        '¿Está corriendo `npm run dev:e2e` en backend/, con backend/.env.e2e completo? ' +
        'Abortando: no se corre ninguna prueba E2E sin confirmar el backend aislado.',
      { cause: error },
    );
  }

  const cuerpo = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    throw new Error(
      `El backend en ${urlBackend} respondió ${respuesta.status} en ` +
        `/api/health/aislamiento${cuerpo?.error ? `: ${cuerpo.error}` : ''}. Abortando.`,
    );
  }

  if (cuerpo?.entorno !== 'e2e') {
    throw new Error(
      `El backend en ${urlBackend} reporta entorno "${cuerpo?.entorno}", no "e2e". ` +
        'Esto probablemente significa que es el backend de DESARROLLO (o le falta ' +
        'ENTORNO=e2e en backend/.env.e2e) — abortando para no correr pruebas que ' +
        'escriben contra la base equivocada.',
    );
  }

  // El chequeo que realmente importa: no alcanza con que el backend DIGA
  // que es "e2e" (arriba) — `entorno` es una variable de entorno que se le
  // pudo haber olvidado actualizar a alguien sin que afecte a DB_NAME. Esto
  // confirma la conexión real.
  if (cuerpo.baseDeDatos !== BASE_ESPERADA) {
    throw new Error(
      `El backend en ${urlBackend} está conectado a la base "${cuerpo.baseDeDatos}", ` +
        `distinta de "${BASE_ESPERADA}". Abortando: no se corre ninguna prueba E2E sin ` +
        'confirmar la base real, no solo el nombre declarado del entorno.',
    );
  }

  if (cuerpo.usuarioConexion !== USUARIO_CONEXION_ESPERADO) {
    throw new Error(
      `El backend en ${urlBackend} está conectado con el usuario ` +
        `"${cuerpo.usuarioConexion}", distinto de "${USUARIO_CONEXION_ESPERADO}". Abortando.`,
    );
  }

  console.log(
    `[globalSetup] Backend E2E confirmado en ${urlBackend} ` +
      `(entorno: e2e, base: ${cuerpo.baseDeDatos}, usuario: ${cuerpo.usuarioConexion}).`,
  );

  const baseURLFrontend = config.projects[0]?.use?.baseURL;
  if (!baseURLFrontend) {
    throw new Error(
      'No se encontró baseURL en la configuración de Playwright (use.baseURL, ' +
        'playwright.config.js) — sin esto no hay forma de saber qué frontend abrir ' +
        'para confirmar contra qué backend habla de verdad. Abortando.',
    );
  }

  await asegurarFrontendUsaBackendValidado(baseURLFrontend, urlBackend);
};

export default globalSetupAislamiento;
