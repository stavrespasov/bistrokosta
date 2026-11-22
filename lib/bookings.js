export const zone = 'Europe/Ljubljana'
const wallClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
})

export class Problem extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const localClock = (now = new Date()) => wallClock.format(now).split(' ')
export const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
export const timeOf = total => [Math.floor(total / 60), total % 60].map(n => String(n).padStart(2, '0')).join(':')
export const validTime = time => typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
export const validDate = date => typeof date === 'string'
  && /^20\d{2}-\d\d-\d\d$/.test(date)
  && !Number.isNaN(Date.parse(date))
  && new Date(date).toISOString().slice(0, 10) === date

export function addDays(date, days) {
  return new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10)
}

export function serviceSlots(settings, date, now = new Date()) {
  const earliest = localClock(new Date(now.getTime() + settings.leadMinutes * 60000)).join('T')
  const [today] = localClock(now)
  if (!settings.bookingOpen || !validDate(date) || date < today || date > addDays(today, settings.daysAhead)) return []
  const slots = []
  const periods = settings.hours[new Date(date).getUTCDay()]
  for (const [start, end] of periods) {
    for (let cursor = minutes(start); cursor + settings.duration <= minutes(end); cursor += 30) {
      const slot = timeOf(cursor)
      if (date + 'T' + slot >= earliest) slots.push(slot)
    }
  }
  return slots
}

export function seatsAvailable(state, date, time, party) {
  const start = minutes(time)
  const end = start + state.settings.duration
  const overlap = state.reservations.filter(r =>
    r.date === date && ['pending', 'confirmed', 'seated'].includes(r.status)
    && minutes(r.time) < end && minutes(r.time) + r.duration > start
  )
  const checkpoints = [start, ...overlap.map(r => Math.max(start, minutes(r.time)))]
  return checkpoints.every(checkpoint => {
    const covers = overlap.filter(r => minutes(r.time) <= checkpoint && minutes(r.time) + r.duration > checkpoint)
      .reduce((total, r) => total + r.party, 0)
    return covers + party <= state.settings.seats
  })
}

export function catalogue(state, date) {
  return {
    daily: (state.daily[date]?.published ? state.daily[date].items : []).filter(item => item.active),
    regular: state.regular.filter(item => item.active)
  }
}

export function orderFor(state, date, selections, party) {
  if (!Array.isArray(selections) || selections.length > 30) throw new Problem(400, 'Preverite izbrane jedi.')
  const { daily, regular } = catalogue(state, date)
  const items = new Map([...daily.map(item => ['daily:' + item.id, item]), ...regular.map(item => ['regular:' + item.id, item])])
  const seen = new Set()
  let portions = 0
  return selections.map(selection => {
    const item = items.get(selection?.id)
    const quantity = selection?.quantity
    if (!item?.preorder || item.price === null || (selection.quotedPrice !== undefined && selection.quotedPrice !== item.price)
      || !Number.isInteger(quantity) || quantity < 1 || seen.has(selection.id)) {
      throw new Problem(409, 'Ponudba se je spremenila. Ponovno izberite jedi.')
    }
    seen.add(selection.id)
    portions += quantity
    if (portions > party * 3) throw new Problem(400, 'Izberete lahko največ tri jedi na gosta.')
    return { id: selection.id, name: item.name, quantity, price: item.price, allergens: item.allergens }
  })
}
