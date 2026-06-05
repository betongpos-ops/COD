import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/COD/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main:     resolve(__dirname, 'index.html'),
        admin:    resolve(__dirname, 'admin.html'),
        employee: resolve(__dirname, 'employee.html'),
        settings: resolve(__dirname, 'settings.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
