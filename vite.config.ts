import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// In dev, the Vite dev server proxies /api to the local Postfarm Node server,
// so the browser only ever talks to one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.POSTFARM_API_URL || `http://localhost:${process.env.PORT || 8787}`,
    },
  },
})
