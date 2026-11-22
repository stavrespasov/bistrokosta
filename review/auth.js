import { Problem } from '../lib/bookings.js'

// These roles apply only to the visitor's own IndexedDB sandbox.
export const staffRole = req => ['owner', 'kitchen'].includes(req.headers['x-review-role']) ? req.headers['x-review-role'] : null
export function requireRole(req, ...allowed) {
  const role = staffRole(req)
  if (!allowed.includes(role)) throw new Problem(403, 'Odprite pogled ekipe.')
  return role
}
export const staffCookie = () => ''
export const authenticate = () => { throw new Problem(403, 'Prijava v predogledu ni potrebna.') }
export const rateLimit = () => {}
