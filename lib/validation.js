import { Problem, validTime, minutes } from './bookings.js'

export function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new Problem(400, 'Preverite obvezna polja in dolžino vnosa.')
  }
  return value.trim()
}

export function number(value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Problem(400, `Vnesite število od ${min} do ${max}.`)
  }
  return value
}

export const mediaPath = value => typeof value === 'string'
  && /^\/(?:media\/[a-z0-9-]+\.webp|api\/media\/[a-f0-9]{32})$/.test(value)

export function menuItems(items) {
  if (!Array.isArray(items) || items.length > 50) throw new Problem(400, 'Meni lahko vsebuje največ 50 jedi.')
  const ids = new Set()
  return items.map(item => {
    const id = text(item.id, 48, true)
    if (!/^[a-z0-9-]+$/.test(id) || ids.has(id)) throw new Problem(400, 'Jedi morajo imeti različne oznake.')
    ids.add(id)
    return {
      id, name: text(item.name, 180, true), description: text(item.description ?? '', 350),
      price: item.price === null ? null : number(item.price, 0, 100000),
      allergens: text(item.allergens ?? '', 100), active: item.active === true,
      preorder: item.preorder === true && item.price !== null,
      photo: mediaPath(item.photo) ? item.photo : ''
    }
  })
}

export function contact(body, emailOptional = false) {
  const name = text(body.name, 90, true)
  const email = text(body.email ?? '', 180, !emailOptional)
  const phone = text(body.phone, 32, true)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Problem(400, 'Preverite e-poštni naslov.')
  if (!/^\+?[\d\s()./-]{6,31}$/.test(phone) || phone.replace(/\D/g, '').length < 6) {
    throw new Problem(400, 'Preverite telefonsko številko.')
  }
  return { name, email, phone, notes: text(body.notes ?? '', 500) }
}

export function settingsFrom(body) {
  if (!Array.isArray(body.hours) || body.hours.length !== 7) throw new Problem(400, 'Preverite odpiralni čas.')
  const hours = body.hours.map(periods => {
    if (!Array.isArray(periods) || periods.length > 3) throw new Problem(400, 'Preverite odpiralni čas.')
    let previous = 0
    return periods.map(pair => {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(validTime)
        || minutes(pair[0]) >= minutes(pair[1]) || minutes(pair[0]) < previous) {
        throw new Problem(400, 'Ure se ne smejo prekrivati. Uporabite obliko 09:00–15:00.')
      }
      previous = minutes(pair[1])
      return pair
    })
  })
  const result = {
    address: text(body.address, 180, true), phone: text(body.phone, 32, true),
    delivery: text(body.delivery, 180), terrace: text(body.terrace, 350),
    intro: text(body.intro, 350, true), story: text(body.story, 1200, true),
    hours, bookingOpen: body.bookingOpen === true, autoConfirm: body.autoConfirm === true,
    seats: number(body.seats, 1, 200), maxParty: number(body.maxParty, 1, 50),
    duration: number(body.duration, 30, 240), leadMinutes: number(body.leadMinutes, 0, 2880),
    daysAhead: number(body.daysAhead, 1, 365)
  }
  if (result.maxParty > result.seats) throw new Problem(400, 'Največja skupina mora ustrezati številu sedežev.')
  return result
}
