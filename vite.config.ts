import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { cloudflare } from "@cloudflare/vite-plugin"
import mkcert from 'vite-plugin-mkcert'
import svgr from 'vite-plugin-svgr'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './src/pwa/pwa-options'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr(),
    tailwindcss(),
    cloudflare(),
    mkcert(),
    // vite-plugin-pwa's closeBundle guards on the SHARED build.ssr flag, which
    // @cloudflare/vite-plugin only sets per-environment; without this the
    // service worker is regenerated for the worker environment over a
    // dist/client that already contains sw.js.
    ...VitePWA(pwaOptions).map(plugin => ({
      ...plugin,
      applyToEnvironment: (environment: { name: string }) => environment.name === 'client',
    })),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
