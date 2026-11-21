import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { defineConfig } from 'vitest/config'
import { docsPlugin } from './content/plugin.ts'

// The operator documents live at the root of the repository (content/docs.ts), so the dev server reads it.
const ROOT = fileURLToPath(new URL('.', import.meta.url))

// One build: dist/index.html, one file. It is the offline copy, the release asset, and the container image.
export default defineConfig({
  base: './',
  plugins: [docsPlugin(ROOT), react(), viteSingleFile()],
  server: { fs: { allow: [ROOT] } },
  test: { include: ['tests/**/*.test.ts'] },
})
