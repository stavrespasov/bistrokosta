import { build } from 'esbuild'
import { copyFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const modules = new Map([
  ['../lib/store.js', 'store.js'],
  ['../lib/auth.js', 'auth.js'],
  ['../lib/email.js', 'email.js'],
  ['node:crypto', 'crypto.js']
])

await build({
  entryPoints: ['review/worker.js'],
  outfile: 'public/review-worker.js',
  bundle: true,
  minify: true,
  platform: 'browser',
  inject: ['review/buffer.js'],
  plugins: [{
    name: 'browser-only-review',
    setup(build) {
      build.onResolve({ filter: /.*/ }, args => {
        if (args.importer.endsWith('/api/handler.js') && modules.has(args.path)) {
          return { path: resolve('review', modules.get(args.path)) }
        }
      })
    }
  }]
})

const heic = new URL('../node_modules/heic-to/', import.meta.url)
// Use the upstream worker with its CSP-safe decoder as a same-origin script.
const decoder = (await readFile(new URL('src/worker.js', heic), 'utf8'))
  .replace('LIB_HEIF_PATH', '"./lib/libheif-without-unsafe-eval.js"')
await Promise.all([
  build({
    stdin: { contents: decoder, resolveDir: fileURLToPath(new URL('src/', heic)), sourcefile: 'heic-to/worker.js' },
    outfile: 'public/heic-converter.js', bundle: true, minify: true, platform: 'browser',
    external: ['fs', 'path', 'crypto']
  }),
  copyFile(new URL('LICENSE', heic), new URL('../public/heic-converter-license.txt', import.meta.url))
])
