import { $, $$, api, dateLabel, node, price, say, hostedReview } from './ui.js'

const form = $('#booking-form')
const dayList = $('#calendar-days')
const timeList = $('#times')
const slotStatus = $('#slot-status')
const retry = $('#retry-times')
const order = $('#preorder')
const orderTotal = $('#dish-total')
const dishList = $('#booking-dishes')
const menuLoading = $('#menu-loading')
const notice = $('#booking-error')
const receipt = $('#receipt')
const submit = $('button[type="submit"]', form)
const dayCount = 4
const dayFormatter = new Intl.DateTimeFormat('sl-SI', { weekday: 'short', timeZone: 'UTC' })
const monthFormatter = new Intl.DateTimeFormat('sl-SI', { month: 'long', year: 'numeric', timeZone: 'UTC' })
let site
let date
let calendarStart
let party
let selectedTime
let preferredTime
let slots = []
let menu = []
let menuDate
let quantities = new Map()
let availabilityRequest
let submitting = false
let attempt

const asDate = iso => new Date(iso + 'T12:00:00Z')
const plusDays = (iso, count) => {
  const result = asDate(iso)
  result.setUTCDate(result.getUTCDate() + count)
  return result.toISOString().slice(0, 10)
}
const guests = count => count + (count === 1 ? ' gost' : count === 2 ? ' gosta' : count <= 4 ? ' gostje' : ' gostov')
const button = (label, action, attributes = {}) => node('button', { type: 'button', onclick: action, ...attributes }, label)

function setCalendar(start = calendarStart) {
  calendarStart = start
  const days = Array.from({ length: dayCount }, (_, index) => plusDays(start, index)).filter(day => day <= site.lastDate)
  const months = [...new Set(days.map(day => monthFormatter.format(asDate(day))))]
  $('#calendar-period').textContent = months.join(' / ')
  $('#calendar-prev').disabled = start <= site.today
  $('#calendar-next').disabled = plusDays(start, dayCount) > site.lastDate
  dayList.replaceChildren(...days.map(day => node('button', {
    type: 'button', 'data-date': day, 'aria-pressed': day === date, 'aria-label': dateLabel(day),
    onclick: () => {
      if (date === day) return
      date = day
      for (const option of $$('[data-date]', dayList)) option.setAttribute('aria-pressed', String(option.dataset.date === date))
      loadAvailability()
    }
  }, node('span', {}, day === site.today ? 'Danes' : dayFormatter.format(asDate(day))),
  node('strong', {}, String(asDate(day).getUTCDate())))))
}

function paintParty() {
  $('#guest-count').textContent = party
  $('[data-party="-1"]').disabled = party <= 1
  $('[data-party="1"]').disabled = party >= site.settings.maxParty
}

function paintSummary() {
  $('#booking-summary').textContent = selectedTime
    ? dateLabel(date) + ' · ' + selectedTime + ' · ' + guests(party)
    : dateLabel(date) + ' · ' + guests(party)
}

function paintTimes() {
  timeList.replaceChildren(...slots.map(time => button(time, event => {
    selectedTime = preferredTime = time
    for (const option of $$('button', timeList)) option.setAttribute('aria-pressed', String(option === event.currentTarget))
    paintSummary()
    say(notice, '')
  }, { 'aria-pressed': time === selectedTime })))
}

function selection() {
  return menu.flatMap(item => {
    const quantity = quantities.get(item.id)
    return quantity ? [{ id: item.id, quantity, quotedPrice: item.price }] : []
  })
}

function paintOrder() {
  const selected = selection()
  const portionCount = selected.reduce((sum, item) => sum + item.quantity, 0)
  orderTotal.hidden = !portionCount
  orderTotal.textContent = price(selected.reduce((sum, item) => sum + item.quantity * item.quotedPrice, 0))
  for (const row of $$('[data-dish]', order)) {
    const quantity = quantities.get(row.dataset.dish) || 0
    $('output', row).textContent = quantity
    $('[data-adjust="-1"]', row).disabled = !quantity
    $('[data-adjust="1"]', row).disabled = portionCount >= party * 3 || (!quantity && selected.length >= 30)
  }
  say($('#dish-notice'), portionCount > party * 3 ? 'Zmanjšajte prednaročilo na največ tri jedi na gosta.' : '')
}

function paintMenu(available) {
  const previous = new Map(menu.map(item => [item.id, item.price]))
  menu = []
  dishList.replaceChildren()
  for (const [kind, title, emptyText] of [
    ['daily', 'Dnevni meni', 'Dnevni meni za izbrani datum še ni objavljen.'],
    ['regular', 'Stalna ponudba', 'Stalna ponudba za izbrani termin ni na voljo.']
  ]) {
    const heading = node('div', { className: 'booking-menu-heading' }, node('h3', { id: 'menu-' + kind }, title),
      kind === 'daily' ? node('time', { dateTime: date }, dateLabel(date)) : null)
    const group = node('section', { className: 'booking-menu-group', 'aria-labelledby': 'menu-' + kind }, heading)
    if (!available[kind].length) group.append(node('p', { className: 'subtle booking-menu-empty' }, emptyText))
    for (const item of available[kind]) {
      const id = kind + ':' + item.id
      const selectable = item.preorder && item.price !== null
      let control = node('span', { className: 'dish-unavailable' }, 'V bistroju')
      if (selectable) {
        menu.push({ ...item, id })
        const adjust = delta => {
          quantities.set(id, (quantities.get(id) || 0) + delta)
          paintOrder()
        }
        control = node('div', { className: 'stepper' },
          button('−', () => adjust(-1), { 'aria-label': 'Odvzemi porcijo: ' + item.name, 'data-adjust': -1 }),
          node('output', { 'aria-label': 'Porcije: ' + item.name }),
          button('+', () => adjust(1), { 'aria-label': 'Dodaj porcijo: ' + item.name, 'data-adjust': 1 }))
      }
      group.append(node('div', { className: 'dish-line', ...(selectable ? { 'data-dish': id } : {}) },
        node('div', {}, node('strong', {}, item.name), node('p', { className: 'subtle' },
          price(item.price) + (item.allergens ? ' · Alergeni ' + item.allergens : ''))), control))
    }
    dishList.append(group)
  }
  const current = new Map(menu.map(item => [item.id, item.price]))
  for (const id of quantities.keys()) {
    if ((date !== menuDate && id.startsWith('daily:')) || !current.has(id) || current.get(id) !== previous.get(id)) {
      quantities.delete(id)
    }
  }
  menuDate = date
  paintOrder()
}

async function loadAvailability({ retainTime = false } = {}) {
  availabilityRequest?.abort()
  const request = new AbortController()
  availabilityRequest = request
  if (!retainTime) preferredTime = undefined
  selectedTime = undefined
  slots = []
  paintTimes()
  paintSummary()
  retry.hidden = true
  order.hidden = false
  dishList.hidden = true
  orderTotal.hidden = true
  say($('#dish-notice'), '')
  say(menuLoading, 'Nalagamo meni za izbrani datum …')
  say(slotStatus, 'Preverjamo proste ure …')
  try {
    const result = await api('availability?' + new URLSearchParams({ date, party }), { signal: request.signal })
    if (request.signal.aborted) return
    slots = result.slots
    if (slots.includes(preferredTime)) selectedTime = preferredTime
    else preferredTime = undefined
    say(slotStatus, slots.length ? '' : 'Za ta dan ni prostih ur. Izberite drug dan ali nas pokličite.')
    paintTimes()
    paintSummary()
    paintMenu(result.menu)
    dishList.hidden = false
    say(menuLoading, '')
  } catch (error) {
    if (request.signal.aborted) return
    say(slotStatus, error.message)
    say(menuLoading, 'Menija trenutno ni mogoče naložiti.')
    retry.hidden = false
  }
}

function focusTimes(message) {
  say(slotStatus, message)
  const firstTime = $('button', timeList)
  if (firstTime) firstTime.focus()
  else {
    slotStatus.tabIndex = -1
    slotStatus.focus()
  }
}

function renderReceipt(result) {
  form.hidden = true
  const pending = result.status === 'pending'
  const message = hostedReview ? 'Poskusna rezervacija je shranjena. Preverite jo v pultu in kuhinji.'
    : pending ? (result.confirmationChannel === 'phone' ? 'Za potrditev termina vas bomo poklicali.' : 'Potrditev vam pošljemo po e-pošti.')
    : result.emailStatus === 'sent' ? 'Potrditev smo poslali na vaš e-poštni naslov.' : 'Vaša miza je potrjena.'
  receipt.replaceChildren(node('div', { className: 'receipt-mark', 'aria-hidden': true }, '✓'),
    node('h2', { id: 'receipt-title', tabIndex: -1 }, hostedReview ? 'Preizkus je uspel.' : pending ? 'Zahteva je prejeta.' : 'Miza je rezervirana.'),
    node('p', {}, dateLabel(result.date) + ' · ' + result.time + ' · ' + guests(result.party)),
    node('p', {}, message),
    node('p', { className: 'receipt-reference' }, 'Številka rezervacije ', node('strong', {}, result.reference)),
    hostedReview
      ? node('a', { className: 'button primary', href: '/admin?demo=1&view=reservations&date=' + result.date }, 'Odpri pult ↗')
      : node('a', { className: 'button secondary', href: '/' }, 'Nazaj na Bistro Kóšta'))
  receipt.hidden = false
  $('#receipt-title').focus()
}

form.addEventListener('submit', async event => {
  event.preventDefault()
  if (submitting) return
  if (!selectedTime) return focusTimes('Pred oddajo izberite prosto uro obiska.')
  if (!form.reportValidity()) return
  const items = selection()
  if (items.reduce((total, item) => total + item.quantity, 0) > party * 3) {
    order.open = true
    $('summary', order).focus()
    paintOrder()
    return
  }
  const fields = Object.fromEntries(new FormData(form))
  const payload = { ...fields, date, time: selectedTime, party, consent: fields.consent === 'on', items }
  const fingerprint = JSON.stringify(payload)
  if (attempt?.fingerprint !== fingerprint) attempt = { fingerprint, key: crypto.randomUUID() }
  submitting = true
  submit.disabled = true
  $('.reservation-layout').inert = true
  say(notice, '')
  try {
    renderReceipt(await api('reservations', { method: 'POST', body: { ...payload, key: attempt.key } }))
  } catch (error) {
    say(notice, error.message)
    if (error.status === 409) await loadAvailability({ retainTime: true })
  } finally {
    submitting = false
    submit.disabled = false
    $('.reservation-layout').inert = false
  }
})

$('#calendar-prev').addEventListener('click', () => setCalendar(plusDays(calendarStart, -dayCount)))
$('#calendar-next').addEventListener('click', () => setCalendar(plusDays(calendarStart, dayCount)))
for (const adjust of $$('[data-party]')) adjust.addEventListener('click', () => {
  party += Number(adjust.dataset.party)
  paintParty()
  paintOrder()
  loadAvailability({ retainTime: true })
})
retry.addEventListener('click', () => loadAvailability({ retainTime: true }))

async function start() {
  if (hostedReview) for (const link of $$('[data-site-link]')) link.href = '/?demo=1'
  try {
    site = await api('site')
    const { settings } = site
    $('#booking-address').textContent = settings.address
    for (const link of $$('[data-phone]')) {
      link.textContent = settings.phone
      link.href = 'tel:' + settings.phone.replace(/[^\d+]/g, '').replace(/^0/, '+386')
    }
    $('#booking-unavailable').hidden = true
    if (!settings.bookingOpen && !hostedReview) {
      $('#phone-booking').hidden = false
      return
    }
    date = site.today
    party = Math.min(site.settings.maxParty, 2)
    setCalendar(date)
    paintParty()
    $('#confirm-method').textContent = hostedReview ? 'Predogled shrani zahtevo samo v tem brskalniku.'
      : site.confirmationChannel === 'phone' ? 'Termin vam potrdimo po telefonu.' : 'Potrditev termina prejmete po e-pošti.'
    form.hidden = false
    loadAvailability()
  } catch (error) {
    say($('#booking-unavailable'), 'Rezervacije trenutno niso dosegljive. Za termin nas pokličite.')
    $('#booking-unavailable').append(' ', node('a', { href: 'tel:+38670172114' }, '070 172 114'))
  }
}

start()
