import { addDays, minutes, timeOf } from './bookings.js'

const holdsSeats = new Set(['pending', 'confirmed', 'seated'])
const confirmed = new Set(['confirmed', 'seated', 'completed'])

function peakSeating(records, fallbackDuration) {
  const events = new Map()
  for (const record of records) {
    if (!holdsSeats.has(record.status)) continue
    const start = minutes(record.time)
    const end = start + (record.duration ?? fallbackDuration)
    events.set(start, (events.get(start) ?? 0) + record.party)
    events.set(end, (events.get(end) ?? 0) - record.party)
  }
  let seated = 0
  let peak = 0
  let at = null
  for (const [time, change] of [...events].sort(([a], [b]) => a - b)) {
    seated += change
    if (seated > peak) {
      peak = seated
      at = timeOf(time)
    }
  }
  return { covers: peak, at }
}

export function daySummary(state, date, records, includeKitchen = false) {
  const menu = state.daily[date]
  const dishes = menu?.items.filter(item => item.active).length ?? 0
  const hours = state.settings.hours[new Date(date).getUTCDay()]
  const visits = { pending: 0, confirmed: 0, seated: 0, completed: 0, cancelled: 0, 'no-show': 0 }
  const groups = { pending: 0, confirmed: 0, seated: 0, completed: 0, cancelled: 0, 'no-show': 0 }
  const channels = { web: 0, desk: 0, unknown: 0 }
  const prep = { queued: 0, preparing: 0, ready: 0, served: 0 }
  const prepItems = new Map()
  let portions = 0
  let preorderCents = 0
  for (const record of records) {
    visits[record.status] += record.party
    groups[record.status]++
    if (Object.hasOwn(channels, record.source)) channels[record.source]++
    else channels.unknown++
    if (!confirmed.has(record.status)) continue
    for (const item of record.items) {
      portions += item.quantity
      preorderCents += item.quantity * item.price
      if (includeKitchen && record.status !== 'completed') {
        const stage = Object.hasOwn(prep, record.kitchenStatus) ? record.kitchenStatus : 'queued'
        prep[stage] += item.quantity
        if (stage === 'queued' || stage === 'preparing') prepItems.set(item.name, (prepItems.get(item.name) ?? 0) + item.quantity)
      }
    }
  }
  return {
    date, hours, menu: { published: Boolean(menu?.published), dishes }, visits, groups, channels, portions, preorderCents,
    peak: peakSeating(records, state.settings.duration),
    ...(includeKitchen ? { prep, prepItems: [...prepItems].map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'sl')) } : {})
  }
}

export function periodSummary(state, date, count, reports) {
  const start = reports ? addDays(date, 1 - count) : date
  const end = addDays(start, count - 1)
  const byDate = new Map()
  for (const record of state.reservations) {
    if (record.date < start || record.date > end) continue
    if (!byDate.has(record.date)) byDate.set(record.date, [])
    byDate.get(record.date).push(record)
  }
  return Array.from({ length: count }, (_, index) => {
    const day = addDays(start, index)
    return daySummary(state, day, byDate.get(day) ?? [])
  })
}
