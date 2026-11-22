import { build } from 'esbuild'
import { resolve } from 'node:path'

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
