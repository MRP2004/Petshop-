import { defineConfig, devices } from '@playwright/test';

// Pruebas de extremo a extremo contra el backend y frontend reales (no
// mocks). Corren contra la instancia AISLADA de E2E, no contra desarrollo
// (ver docs/frontend-pruebas.md, "Aislamiento para E2E"):
//
//   Terminal 1 (backend/): npm run dev:e2e
//   Terminal 2 (backend/), una vez o cuando se reinicia petshop_e2e:
//     npm run sembrar:e2e
//   Terminal 3 (frontend/): npm run dev:e2e
//   Terminal 4 (frontend/): npm run test:e2e
//
// `globalSetup` (globalSetupAislamiento.js) confirma, ANTES de correr
// cualquier prueba, que el backend efectivamente reporte `entorno: "e2e"`
// — si no, aborta toda la corrida en vez de dejar que las pruebas escriban
// contra un backend equivocado.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  globalSetup: './e2e/globalSetupAislamiento.js',
  use: {
    // Puerto EXCLUSIVO del frontend de E2E (ver frontend/package.json
    // "dev:e2e" y frontend/.env.e2e.example), distinto del de desarrollo
    // (5173) — necesario, además de la cookie con sufijo de entorno (ver
    // backend/src/utils/sesion.js), porque los puertos por sí solos no
    // separan cookies entre sí.
    baseURL: 'http://localhost:5183',
    trace: 'retain-on-failure',
  },
  // Los tres breakpoints mobile-first del proyecto (ver src/index.css: SM
  // por defecto, MD >= 768px, LG >= 1024px), todos con el motor Chromium
  // (el único navegador instalado en este entorno) para no depender de
  // descargar Firefox/WebKit solo por el tamaño de viewport.
  projects: [
    { name: 'sm-mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'md-tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } } },
    { name: 'lg-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
