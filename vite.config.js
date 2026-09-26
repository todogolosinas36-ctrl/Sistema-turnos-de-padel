import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Las dependencias grandes van en su propio archivo para que el navegador
    // las cachee entre deploys y no se re-descarguen con cada cambio de la app.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('lucide-react')) return 'iconos'
          if (id.includes('react-router')) return 'router'
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
            return 'react'
          }
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
})
