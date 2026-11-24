import { defineConfig } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const here=dirname(fileURLToPath(import.meta.url))
export default defineConfig({root:resolve(here,'src/renderer'),server:{host:'127.0.0.1',port:1421,strictPort:true},build:{outDir:resolve(here,'out/tauri-renderer'),emptyOutDir:true}})
