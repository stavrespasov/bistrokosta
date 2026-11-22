import { createHash, createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import { Problem } from './bookings.js'
import { preview, production } from './store.js'

const temporarySecret = randomBytes(32).toString('hex')
const cookieName = 'kosta_staff'
const lifetime = 60 * 60 * 12

function secret() {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) {
    if (!preview) throw new Error('SESSION_SECRET must contain at least 32 characters')
    return temporarySecret
  }
  return value
}

export function signature(value) {
  return createHmac('sha256', secret()).update(value).digest('base64url')
}

function same(a, b) {
  const digest = value => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(a), digest(b))
}

export function authenticate(role, input) {
  const owner = process.env.OWNER_PASSWORD || (preview ? 'kosta-owner-demo' : '')
  const kitchen = process.env.KITCHEN_PASSWORD || (preview ? 'kosta-kitchen-demo' : '')
  if (!preview && (owner.length < 12 || kitchen.length < 12 || owner === kitchen)) {
    throw new Error('Set distinct owner and kitchen passwords, each at least 12 characters long')
  }
  const password = { owner, kitchen }[role]
  if (!password || typeof input !== 'string' || input.length > 500 || !same(input, password)) {
    throw new Problem(401, 'Vloga ali geslo ni pravilno.')
  }
}

export function staffCookie(role) {
  const expires = Math.floor(Date.now() / 1000) + lifetime
  const payload = role + '.' + expires
  const value = role ? payload + '.' + signature(payload) : ''
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${role ? lifetime : 0}${production ? '; Secure' : ''}`
}

export function staffRole(req) {
  const cookie = req.headers.cookie?.split(';').map(part => part.trim())
    .find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1)
  const [role, expires, tag] = cookie?.split('.') ?? []
  if (!['owner', 'kitchen'].includes(role) || !/^\d{10}$/.test(expires) || !tag
    || Number(expires) <= Date.now() / 1000 || !same(tag, signature(role + '.' + expires))) return null
  return role
}

export function requireRole(req, ...allowed) {
  const role = staffRole(req)
  if (!allowed.includes(role)) throw new Problem(role ? 403 : 401, 'Za dostop se prijavite.')
  return role
}

export async function rateLimit(store, req, category, max, windowMs) {
  const address = req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
  const key = signature(category + ':' + address)
  const now = Date.now()
  await store.change(state => {
    for (const [id, value] of Object.entries(state.limits)) {
      if (value.until <= now) delete state.limits[id]
    }
    const hit = state.limits[key] ?? { count: 0, until: now + windowMs }
    if (hit.count >= max) throw new Problem(429, 'Preveč poskusov. Poskusite znova čez nekaj minut.')
    hit.count++
    state.limits[key] = hit
  })
}
