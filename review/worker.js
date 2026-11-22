import handler from '../api/handler.js'
import { getStore } from './store.js'

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

async function dispatch(request, url) {
  const headers = Object.fromEntries(request.headers)
  headers.host = url.host
  const req = { method: request.method, headers, url: url.pathname.replace('/review-api/', '/api/') + url.search }
  if (!['GET', 'HEAD'].includes(req.method)) req.body = await request.text() || '{}'
  let status = 200
  let responseBody
  const responseHeaders = new Headers()
  await handler(req, {
    setHeader(name, value) { if (name !== 'Set-Cookie') responseHeaders.set(name, value) },
    writeHead(code, entries) {
      status = code
      for (const [name, value] of Object.entries(entries)) responseHeaders.set(name, value)
    },
    end(value) { responseBody = value }
  })
  return new Response(responseBody, { status, headers: responseHeaders })
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/review-api/')) {
    event.respondWith(dispatch(event.request, url))
    return
  }
  const match = url.pathname.match(/^\/api\/media\/([a-f0-9]{32})$/)
  if (match && event.request.method === 'GET') event.respondWith((async () => {
    const image = await getStore().getMedia(match[1])
    return image ? new Response(image.bytes, { headers: { 'Content-Type': image.mime } }) : fetch(event.request)
  })())
})
