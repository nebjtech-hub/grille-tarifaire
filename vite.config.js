import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // ExcelJS (≈ 270 Ko) n'est chargé qu'au moment d'un export
  build: { chunkSizeWarningLimit: 1000 }
})
