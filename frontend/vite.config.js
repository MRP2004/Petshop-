import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/configuracion.js',
    globals: true,
    // Excluye e2e/ (pruebas de Playwright, con su propio test runner: ver
    // playwright.config.js) del patrón por defecto de Vitest, que si no
    // también intentaría correr esos *.spec.js como si fueran suyos.
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
