import { randomBytes, randomUUID } from 'node:crypto'
import { addDays, catalogue, localClock, orderFor, Problem, seatsAvailable, serviceSlots, validDate, validTime } from '../lib/bookings.js'
import { authenticate, rateLimit, requireRole, staffCookie, staffRole } from '../lib/auth.js'
import { confirmation, emailConfigured } from '../lib/email.js'
import { daySummary, periodSummary } from '../lib/manager.js'
import { currentPhotos } from '../lib/photos.js'
import { exampleMenu, initialState } from '../lib/seed.js'
import { displayOnly, getStore, preview } from '../lib/store.js'
import { contact, mediaPath, menuItems, number, settingsFrom, text } from '../lib/validation.js'

const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(data))
}

async function body(req, limit = 80_000) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Problem(415, 'Uporabite zapis JSON.')
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    if (Buffer.byteLength(raw) > limit) throw new Problem(413, 'Datoteka ali vnos je prevelik.')
    return parse(raw)
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Problem(413, 'Datoteka ali vnos je prevelik.')
    chunks.push(chunk)
  }
  return parse(Buffer.concat(chunks).toString('utf8'))
}

function parse(raw) {
  try {
    const result = JSON.parse(raw)
    if (result && typeof result === 'object' && !Array.isArray(result)) return result
  } catch {
    // Return one validation response for invalid request bodies.
  }
  throw new Problem(400, 'Preverite vnesene podatke.')
}

function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return
  try {
    if (new URL(origin).host === req.headers.host) return
  } catch {
    // Invalid origins are refused below.
  }
  throw new Problem(403, 'Zahteva ni dovoljena.')
}

function selectedDate(url) {
  const date = url.searchParams.get('date') || localClock()[0]
  if (!validDate(date)) throw new Problem(400, 'Izberite veljaven datum.')
  return date
}

function webConfirmationChannel() {
  return preview || emailConfigured() ? 'email' : 'phone'
}

function publicSite(state) {
  const [today] = localClock()
  const { address, phone, delivery, terrace, intro, story, hours, hero, storyPhoto, terracePhoto, bookingOpen, maxParty, daysAhead } = state.settings
  const menu = catalogue(state, today)
  return {
    today, lastDate: addDays(today, daysAhead), preview, confirmationChannel: webConfirmationChannel(),
    settings: { address, phone, delivery, terrace, intro, story, hours, hero, storyPhoto, terracePhoto, bookingOpen, maxParty },
    menu, example: menu.daily.length || state.daily[today]?.published ? [] : exampleMenu,
    gallery: state.gallery
  }
}

const statuses = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no-show']
const kitchenStatuses = ['queued', 'preparing', 'ready', 'served']
const activeCover = ['pending', 'confirmed', 'seated']

const publicTicket = record => ({
  reference: record.reference, date: record.date, time: record.time, party: record.party, status: record.status,
  items: record.items, emailStatus: record.emailStatus, confirmationChannel: record.confirmationChannel || (record.emailStatus === 'phone' ? 'phone' : 'email')
})

function bookableHours(settings, desk) {
  return desk ? { ...settings, bookingOpen: true, leadMinutes: 0 } : settings
}

async function reserve(store, req, desk = false) {
  const input = await body(req)
  const key = text(input.key, 40, true)
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Problem(400, 'Osvežite stran in poskusite ponovno.')
  const details = contact(input, desk)
  if (!desk && input.consent !== true) throw new Problem(400, 'Potrdite uporabo podatkov za rezervacijo.')
  if (!desk) await rateLimit(store, req, 'booking', 10, 10 * 60_000)
  const record = await store.change(state => {
    const existing = state.reservations.find(r => r.key === key && r.email === details.email && (r.source === 'desk') === desk)
    if (existing) return existing
    const { date, time } = input
    const party = number(input.party, 1, state.settings.maxParty)
    if (!serviceSlots(bookableHours(state.settings, desk), date).includes(time) || !seatsAvailable(state, date, time, party)) {
      throw new Problem(409, 'Ta termin ni več na voljo. Izberite drugo uro.')
    }
    const items = orderFor(state, date, input.items ?? [], party)
    const confirmationChannel = !details.email ? 'phone' : webConfirmationChannel()
    const ticket = {
      id: randomUUID(), reference: randomBytes(5).toString('hex').toUpperCase(), key, ...details,
      date, time, party, duration: state.settings.duration, items,
      source: desk ? 'desk' : 'web', status: desk || (state.settings.autoConfirm && confirmationChannel === 'email') ? 'confirmed' : 'pending',
      kitchenStatus: 'queued', confirmationChannel, emailStatus: confirmationChannel === 'phone' ? 'phone' : 'waiting', confirmationVersion: 1,
      staffNotes: '', table: '', createdAt: new Date().toISOString()
    }
    state.reservations.push(ticket)
    return ticket
  })
  if (record.email && record.confirmationChannel !== 'phone' && record.status === 'confirmed') await confirmation(store, record.id)
  const fresh = (await store.read()).reservations.find(r => r.id === record.id)
  return publicTicket(fresh ?? record)
}

function board(state, date, role) {
  const reservations = state.reservations.filter(r => r.date === date)
    .sort((a, b) => a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt))
  if (role === 'owner') return reservations.map(({ key, emailLease, emailLeaseUntil, ...record }) => record)
  return reservations.filter(r => ['confirmed', 'seated', 'completed'].includes(r.status)).map(r => ({
    id: r.id, reference: r.reference, date: r.date, time: r.time, party: r.party,
    status: r.status, items: r.items, kitchenStatus: r.kitchenStatus, guestNote: r.notes || '', staffNotes: r.staffNotes, table: r.table || ''
  }))
}

async function changeTicket(store, req, id, role) {
  const input = await body(req)
  const result = await store.change(state => {
    const record = state.reservations.find(r => r.id === id)
    if (!record) throw new Problem(404, 'Rezervacija ne obstaja.')
    if (role === 'kitchen' && !['confirmed', 'seated', 'completed'].includes(record.status)) {
      throw new Problem(404, 'Rezervacija ne obstaja.')
    }
    if (input.kitchenStatus !== undefined) {
      if (!kitchenStatuses.includes(input.kitchenStatus)) throw new Problem(400, 'Preverite stanje priprave.')
      record.kitchenStatus = input.kitchenStatus
    }
    if (role === 'kitchen') return { send: false }
    const old = { ...record }
    if (input.status !== undefined) {
      if (!statuses.includes(input.status)) throw new Problem(400, 'Preverite stanje rezervacije.')
      record.status = input.status
    }
    if (input.details) {
      const { date, time, party, items } = input.details
      if (!validDate(date) || !validTime(time)) throw new Problem(400, 'Preverite datum in uro.')
      Object.assign(record, contact(input.details, record.source === 'desk'), { date, time, party: number(party, 1, 200) })
      if (items !== undefined) record.items = orderFor(state, date, items, record.party)
      if (input.details.order !== undefined) {
        const order = input.details.order
        if (!Array.isArray(order) || order.length > 30) throw new Problem(400, 'Preverite seznam jedi.')
        record.items = order.map(item => ({
          id: text(item.id, 85, true), name: text(item.name, 180, true), quantity: number(item.quantity, 1, 150),
          price: number(item.price, 0, 100000), allergens: text(item.allergens ?? '', 100)
        }))
      }
      if (input.details.table !== undefined) record.table = text(input.details.table, 36)
      if (input.details.staffNotes !== undefined) record.staffNotes = text(input.details.staffNotes, 500)
    }
    const shifted = ['date', 'time', 'party'].some(field => old[field] !== record[field])
    if (activeCover.includes(record.status) && (shifted || !activeCover.includes(old.status))) {
      const others = state.reservations.filter(r => r.id !== id)
      const capacityState = { ...state, settings: { ...state.settings, duration: record.duration }, reservations: others }
      if (!seatsAvailable(capacityState, record.date, record.time, record.party)) throw new Problem(409, 'Za ta termin ni dovolj sedežev.')
    }
    const changed = shifted || old.email !== record.email || old.name !== record.name || old.items !== record.items
    if (record.status === 'confirmed' && (old.status !== record.status || changed)) {
      record.confirmationVersion++
      record.emailStatus = record.email && record.confirmationChannel !== 'phone' ? 'waiting' : 'phone'
      delete record.emailLease
      delete record.emailLeaseUntil
      return { send: record.emailStatus !== 'phone' }
    }
    return { send: input.retryEmail === true && record.confirmationChannel !== 'phone' && Boolean(record.email) && record.status === 'confirmed' }
  })
  if (result.send) await confirmation(store, id)
  return { ok: true }
}

async function mediaUpload(store, req) {
  const input = await body(req, 2_900_000)
  const types = {
    'image/jpeg': bytes => bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    'image/png': bytes => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': bytes => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  }
  const verify = Object.hasOwn(types, input.mime) && types[input.mime]
  if (!verify || typeof input.data !== 'string') throw new Problem(400, 'Izberite sliko JPEG, PNG ali WebP.')
  const bytes = Buffer.from(input.data, 'base64')
  if (bytes.length > 2_100_000 || !verify(bytes)) throw new Problem(400, 'Slika mora biti veljavna in manjša od 2 MB.')
  const id = randomBytes(16).toString('hex')
  await store.putMedia(id, input.mime, bytes)
  return { url: '/api/media/' + id }
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost')
    const routed = url.searchParams.get('route')
    const path = url.pathname === '/api/handler' && routed ? routed.replace(/^\/+/, '') : url.pathname.slice(5)
    const method = req.method
    if (method !== 'GET') sameOrigin(req)
    if (displayOnly) {
      if (path === 'site' && method === 'GET') return json(res, 200, publicSite(initialState(false)))
      throw new Problem(503, 'Spletne rezervacije in dostop za ekipo še niso vključeni.')
    }
    if (path === 'session' && method === 'GET') return json(res, 200, { role: staffRole(req), preview })
    if (path === 'session' && method === 'DELETE') {
      res.setHeader('Set-Cookie', staffCookie(null))
      return json(res, 200, { ok: true })
    }
    const store = await getStore()
    if (path === 'site' && method === 'GET') return json(res, 200, publicSite(currentPhotos(await store.read())))
    if (path === 'session' && method === 'POST') {
      await rateLimit(store, req, 'login', 8, 15 * 60_000)
      const { role, password } = await body(req)
      authenticate(role, password)
      res.setHeader('Set-Cookie', staffCookie(role))
      return json(res, 200, { role })
    }
    if (path === 'availability' && method === 'GET') {
      const state = currentPhotos(await store.read())
      const date = selectedDate(url)
      const party = number(Number(url.searchParams.get('party')), 1, state.settings.maxParty)
      const desk = url.searchParams.get('desk') === '1'
      if (desk) requireRole(req, 'owner')
      const slots = serviceSlots(bookableHours(state.settings, desk), date).filter(time => seatsAvailable(state, date, time, party))
      return json(res, 200, { slots, menu: catalogue(state, date) })
    }
    if (path === 'desk-reservations' && method === 'POST') {
      requireRole(req, 'owner')
      return json(res, 201, await reserve(store, req, true))
    }
    if (path === 'reservations' && method === 'POST') return json(res, 201, await reserve(store, req))
    if (path === 'dashboard' && method === 'GET') {
      requireRole(req, 'owner')
      const date = selectedDate(url)
      const mode = url.searchParams.get('view')
      const count = Number(url.searchParams.get('days') || 7)
      if (!['planner', 'reports'].includes(mode) || ![7, 14, 30].includes(count)) throw new Problem(400, 'Izberite veljavno obdobje.')
      const state = await store.read()
      return json(res, 200, { today: localClock()[0], seats: state.settings.seats, days: periodSummary(state, date, count, mode === 'reports') })
    }
    if (path === 'board' && method === 'GET') {
      const role = requireRole(req, 'owner', 'kitchen')
      const state = await store.read()
      const date = selectedDate(url)
      const boardRole = url.searchParams.get('view') === 'kitchen' ? 'kitchen' : role
      const menu = state.daily[date]
      const [today] = localClock()
      const overview = boardRole === 'owner' && url.searchParams.get('view') === 'overview'
      const needsConfirmation = overview
        ? state.reservations.filter(record => record.status === 'pending' && record.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
        : []
      const reservations = board(state, date, boardRole)
      return json(res, 200, {
        reservations, today,
        ...(boardRole === 'owner' ? { service: {
          published: Boolean(menu?.published), dishes: menu?.items.filter(item => item.active).length || 0,
          bookingOpen: state.settings.bookingOpen, maxParty: state.settings.maxParty,
          pendingCount: needsConfirmation.length,
          pending: needsConfirmation.slice(0, 6).map(({ name, date, time, reference, party }) => ({ name, date, time, reference, party })),
          ...(overview ? { day: daySummary(state, date, reservations, true), seats: state.settings.seats,
            confirmationChannel: webConfirmationChannel() } : {})
        } } : {})
      })
    }
    const ticket = path.match(/^reservations\/([a-f0-9-]{36})$/)
    if (ticket && method === 'PATCH') return json(res, 200, await changeTicket(store, req, ticket[1], requireRole(req, 'owner', 'kitchen')))
    const media = path.match(/^media\/([a-f0-9]{32})$/)
    if (media && method === 'GET') {
      const file = await store.getMedia(media[1])
      if (!file) throw new Problem(404, 'Slika ne obstaja.')
      res.writeHead(200, { 'Content-Type': file.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' })
      return res.end(Buffer.from(file.bytes))
    }
    if (path === 'media' && method === 'POST') {
      requireRole(req, 'owner')
      return json(res, 201, await mediaUpload(store, req))
    }
    if (path === 'content' && method === 'GET') {
      requireRole(req, 'owner')
      const state = currentPhotos(await store.read())
      return json(res, 200, {
        settings: state.settings, gallery: state.gallery, regular: state.regular, daily: state.daily[selectedDate(url)] ?? null,
        dailyDates: Object.keys(state.daily).sort(), example: exampleMenu, preview, emailConfigured: emailConfigured(), today: localClock()[0]
      })
    }
    if (path === 'content' && method === 'PUT') {
      requireRole(req, 'owner')
      const input = await body(req)
      await store.change(state => {
        if (input.section === 'settings') {
          const settings = settingsFrom(input.settings)
          if (settings.bookingOpen && settings.autoConfirm && !preview && !emailConfigured()) throw new Problem(409, 'Za samodejne potrditve nastavite pošiljanje e-pošte. Za telefonske potrditve izklopite samodejno potrditev.')
          state.settings = settings
        } else if (input.section === 'regular') {
          state.regular = menuItems(input.items)
        } else if (input.section === 'daily' && validDate(input.date)) {
          const items = menuItems(input.items)
          if (input.published && !items.some(item => item.active)) throw new Problem(400, 'Za objavo dodajte vsaj eno vidno jed.')
          state.daily[input.date] = { items, published: input.published === true }
        } else if (input.section === 'media' && Array.isArray(input.gallery) && input.gallery.length <= 40) {
          for (const key of ['hero', 'storyPhoto', 'terracePhoto']) {
            if (!mediaPath(input.photos?.[key])) throw new Problem(400, 'Izberite veljavno sliko.')
            state.settings[key] = input.photos[key]
          }
          state.gallery = input.gallery.map(photo => {
            if (!mediaPath(photo.src)) throw new Problem(400, 'Izberite veljavno sliko.')
            return { src: photo.src, alt: text(photo.alt, 100, true) }
          })
        } else {
          throw new Problem(400, 'Preverite podatke za objavo.')
        }
      })
      return json(res, 200, { ok: true })
    }
    throw new Problem(404, 'Stran ne obstaja.')
  } catch (error) {
    if (!(error instanceof Problem)) console.error('Bistro API:', error.code || error.name)
    if (!res.headersSent) return json(res, error.status || 500, { error: error.status ? error.message : 'Trenutno ni mogoče naložiti podatkov. Poskusite znova.' })
    res.end()
  }
}
