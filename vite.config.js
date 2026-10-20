import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))

// GitHub project Pages: https://pollard22.github.io/Phone-dashboard/
export default defineConfig({
  base: '/Phone-dashboard/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        demo: resolve(root, 'demo.html'),
      },
    },
  },
})
