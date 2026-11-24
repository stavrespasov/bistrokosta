import { parseArgs } from 'node:util'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import handler from './api/handler.js'

const root = resolve('public')
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' }
const pages = { '/': '/index.html', '/admin': '/staff.html', '/kitchen': '/staff.html', '/rezervacije': '/reservations.html' }

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  if (path.startsWith('/api/')) return handler(req, res)
  const file = resolve(root, '.' + (pages[path] ?? path))
  const type = types[extname(file)]
  if (file.startsWith(root + sep) && type && ['GET', 'HEAD'].includes(req.method)) {
    try {
      const info = await stat(file)
      if (info.isFile()) {
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" })
        if (req.method === 'HEAD') return res.end()
        return createReadStream(file).pipe(res)
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.error(error.code || error.name)
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Stran ne obstaja.')
})

const { values } = parseArgs({
  options: { port: { type: 'string' }, host: { type: 'string' }, strictPort: { type: 'boolean' } }
})
const host = values.host || process.env.HOST || '127.0.0.1'
server.listen(Number(values.port || process.env.PORT || 3000), host, () => {
  console.log('Bistro Kóšta · http://' + host + ':' + server.address().port)
})
