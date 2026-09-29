import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/configuracion.js',
    globals: true,
    // Excluye e2e/ (pruebas de Playwright, con su propio test runner: ver
    // playwright.config.js) del patrón por defecto de Vitest.
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})