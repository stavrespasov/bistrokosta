import { randomUUID } from 'node:crypto'
import { preview } from './store.js'

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.RESERVATION_FROM)
const euros = cents => new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(cents / 100)

async function send(reservation, settings) {
  if (preview) return 'preview'
  if (!emailConfigured()) return 'unconfigured'
  const dishes = reservation.items.map(item => `${item.quantity} × ${item.name} (${euros(item.price)} / osebo)`)
  const date = new Intl.DateTimeFormat('sl-SI', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(reservation.date))
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'kosta-confirmation/' + reservation.id + '/' + reservation.confirmationVersion
    },
    body: JSON.stringify({
      from: process.env.RESERVATION_FROM, to: [reservation.email],
      subject: 'Potrjena rezervacija · Bistro Kóšta · ' + reservation.reference,
      text: [
        `Pozdravljeni, ${reservation.name}!`,
        `Vaša miza za ${reservation.party} oseb je potrjena za ${date} ob ${reservation.time}.`,
        `Številka rezervacije: ${reservation.reference}`,
        ...(dishes.length ? ['Izbrane jedi:', ...dishes] : []),
        settings.address, `Za spremembe nas pokličite: ${settings.phone}.`, 'Se vidimo, Bistro Kóšta'
      ].join('\n\n')
    }),
    signal: AbortSignal.timeout(6500)
  })
  return response.ok ? 'sent' : 'failed'
}

export async function confirmation(store, id) {
  const lease = randomUUID()
  const claim = await store.change(state => {
    const reservation = state.reservations.find(record => record.id === id)
    if (!reservation || reservation.status !== 'confirmed' || reservation.confirmationChannel === 'phone') return null
    if (['sent', 'preview'].includes(reservation.emailStatus)) return null
    if (reservation.emailStatus === 'sending' && reservation.emailLeaseUntil > Date.now()) return null
    reservation.emailStatus = 'sending'
    reservation.emailLease = lease
    reservation.emailLeaseUntil = Date.now() + 30000
    return { reservation, settings: state.settings }
  })
  if (!claim) return
  let status = 'failed'
  try {
    status = await send(claim.reservation, claim.settings)
  } catch {
    // The owner can retry using the same provider idempotency key.
  }
  await store.change(state => {
    const reservation = state.reservations.find(record => record.id === id)
    if (reservation?.emailLease !== lease) return
    reservation.emailStatus = status
    delete reservation.emailLease
    delete reservation.emailLeaseUntil
  })
}
