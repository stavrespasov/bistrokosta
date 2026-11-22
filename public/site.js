import { $, $$, api, dateLabel, mediaPath, node, price, say, hostedReview } from './ui.js'

const form = $('#booking-form')
const times = $('#times')
const bookingError = $('#booking-error')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const text = (selector, value) => { $(selector).textContent = value }
let site
let menuTab = 'daily'
let step = 1
let chosenTime
let bookingMenu
let availabilityRequest
let submissionKey
let started = false
let bookingDemo = false

function menuRow(item) {
  const description = item.description && node('span', { className: 'subtle' }, item.description)
  const allergens = item.allergens && node('span', { className: 'subtle' }, 'Alergeni: ' + item.allergens)
  const image = mediaPath(item.photo) && node('img', { src: item.photo, loading: 'lazy', alt: '' })
  return node('li', { className: 'menu-row' },
    node('div', {}, image || null, node('div', { className: 'menu-name' }, item.name), description || null, allergens || null),
    node('span', { className: 'menu-price' }, price(item.price)))
}

function paintMenu() {
  if (!site) return
  let items = site.menu[menuTab]
  const example = menuTab === 'daily' && !items.length && site.example.length
  if (example) items = site.example
  text('#menu-date', menuTab === 'daily' ? (example ? 'PRIMER · 15. APRIL' : dateLabel(site.today)) : '')
  $('#menu-items').replaceChildren(
    ...(example ? [node('p', { className: 'menu-note' }, 'Današnji meni še ni objavljen. Spodaj je primer menija s 15. aprila.')] : []),
    items.length
      ? node('ul', { className: 'menu-list' }, ...items.map(menuRow))
      : node('p', { className: 'empty' }, 'Za današnjo ponudbo nas pokličite.')
  )
}

function updateHours(hours) {
  const names = ['Ned', 'Pon', 'Tor', 'Sre', 'Čet', 'Pet', 'Sob']
  const groups = []
  for (const index of [1, 2, 3, 4, 5, 6, 0]) {
    const periods = hours[index].map(pair => pair.join('–').replaceAll(':', '.')).join(' · ') || 'Zaprto'
    if (groups.at(-1)?.periods === periods) groups.at(-1).end = names[index]
    else groups.push({ start: names[index], periods })
  }
  $('#hours').replaceChildren(...groups.map(group => node('div', {},
    node('dt', {}, group.end ? group.start + '–' + group.end.toLowerCase() : group.start),
    node('dd', {}, group.periods))))
}

function applySite(next) {
  const previous = site
  site = next
  if (!previous || JSON.stringify(previous.menu) !== JSON.stringify(next.menu) || previous.today !== next.today) paintMenu()
  const settings = next.settings
  if (!previous || JSON.stringify(previous.settings) !== JSON.stringify(settings)) {
    for (const [selector, key] of [['#intro', 'intro'], ['#delivery', 'delivery'], ['#story-text', 'story'], ['#terrace-text', 'terrace'], ['#address', 'address']]) {
      text(selector, settings[key])
    }
    for (const [selector, key] of [['#hero-image', 'hero'], ['#story-image', 'storyPhoto'], ['#terrace-image', 'terracePhoto']]) {
      if (mediaPath(settings[key])) {
        $(selector).src = settings[key]
        if (settings[key].startsWith('/api/media/')) $(selector).alt = 'Bistro Kóšta'
      }
    }
    text('#strip-address', settings.address)
    const dial = settings.phone.replace(/[^\d+]/g, '').replace(/^0/, '+386')
    for (const link of $$('[data-phone]')) {
      link.textContent = settings.phone
      link.href = 'tel:' + dial
    }
    $('#directions').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(settings.address)
    updateHours(settings.hours)
  }
  if (JSON.stringify(previous?.gallery) !== JSON.stringify(next.gallery)) {
    $('#galerija').hidden = !next.gallery.length
    $('#gallery-more').hidden = next.gallery.length <= 3
    $('#gallery').replaceChildren(...next.gallery.filter(photo => mediaPath(photo.src)).map(photo => node('figure', {},
      node('button', { type: 'button', className: 'photo-open', 'aria-label': 'Povečaj fotografijo: ' + photo.alt,
        onclick: () => {
          $('#photo-full').src = photo.src
          text('#photo-title', photo.alt)
          $('#photo-dialog').showModal()
        } }, node('img', { src: photo.src, alt: '', loading: 'lazy' })),
      node('figcaption', {}, photo.alt))))
  }
  const phoneOnly = !hostedReview && !settings.bookingOpen
  $('#phone-booking').hidden = !phoneOnly
  const weekday = new Date(next.today + 'T12:00:00Z').getUTCDay()
  text('#booking-hours', settings.hours[weekday].map(period => period.join('–')).join(' / ') || 'Zaprto')
  text('#strip-hours', $('#booking-hours').textContent)
  if (phoneOnly) {
    started = false
    availabilityRequest?.abort()
    form.hidden = true
    $('#booking-unavailable').hidden = true
    return
  }
  const nextDemo = hostedReview
  if (started && nextDemo !== bookingDemo) {
    started = false
    form.reset()
    showStep(1)
  }
  bookingDemo = nextDemo
  $('#rezervacija').classList.toggle('review-booking', bookingDemo)
  if (!started && $('#receipt').hidden) {
    $('#booking-unavailable').hidden = true
    form.hidden = false
    form.elements.date.min = next.today
    form.elements.date.max = next.lastDate
    form.elements.date.value = next.today
    form.elements.party.replaceChildren(...Array.from({ length: settings.maxParty }, (_, index) =>
      node('option', { value: String(index + 1) }, String(index + 1))))
    form.elements.party.value = String(Math.min(2, settings.maxParty))
    submissionKey = crypto.randomUUID()
    started = true
    availability({ firstVisit: true })
  }
}

async function refreshSite() {
  try {
    applySite(await api('site'))
  } catch (error) {
    if (site) return
    text('#menu-items .empty', 'Menija trenutno ni mogoče naložiti. Pokličite nas za ponudbo.')
    say($('#booking-unavailable'), 'Spletne rezervacije trenutno niso dosegljive. Pokličite nas za rezervacijo.')
  }
}

async function availability({ keepTime = false, firstVisit = false } = {}) {
  availabilityRequest?.abort()
  const request = new AbortController()
  availabilityRequest = request
  if (!keepTime) chosenTime = undefined
  bookingMenu = null
  $('#to-dishes').disabled = true
  times.replaceChildren(node('p', { className: 'subtle' }, 'Preverjamo termine …'))
  const date = form.elements.date.value
  const party = form.elements.party.value
  if (!date || !form.elements.date.checkValidity()) {
    times.replaceChildren(node('p', { className: 'subtle' }, 'Izberite datum obiska.'))
    return
  }
  try {
    const result = await api('availability?' + new URLSearchParams({ date, party }), { signal: request.signal })
    if (request.signal.aborted) return
    if (firstVisit && !result.slots.length && date < form.elements.date.max) {
      const tomorrow = new Date(date + 'T12:00:00Z')
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      form.elements.date.value = tomorrow.toISOString().slice(0, 10)
      return availability()
    }
    bookingMenu = result.menu
    if (!result.slots.includes(chosenTime)) chosenTime = undefined
    times.replaceChildren(...(result.slots.length ? result.slots.map(time => node('button', {
      type: 'button', 'aria-pressed': time === chosenTime, onclick: event => {
        chosenTime = time
        for (const button of $$('button', times)) button.setAttribute('aria-pressed', button === event.currentTarget)
        $('#to-dishes').disabled = false
        say(bookingError, '')
      }
    }, time)) : [node('p', { className: 'subtle' }, 'Za ta dan ni prostih terminov. Izberite drug datum.')]))
    $('#to-dishes').disabled = !chosenTime
  } catch (error) {
    if (request.signal.aborted) return
    times.replaceChildren(node('p', { className: 'error' }, error.message),
      node('button', { type: 'button', onclick: () => availability() }, 'Poskusi znova'))
  }
}

function showStep(next) {
  step = next
  for (const panel of $$('[data-step]')) panel.hidden = Number(panel.dataset.step) !== next
  text('#step-count', next + ' / 3')
  text('#step-label', ['Termin', 'Jedi', 'Kontakt'][next - 1])
  say(bookingError, '')
  const title = $(`[data-step="${next}"] h3`)
  title.tabIndex = -1
  title.focus({ preventScroll: true })
  const position = title.getBoundingClientRect()
  if (position.top < 84 || position.bottom > innerHeight - 25) title.scrollIntoView({ block: 'center', behavior: 'instant' })
}

function renderDishes() {
  const container = $('#booking-dishes')
  const party = Number(form.elements.party.value)
  const groups = [['daily', 'Dnevni meni'], ['regular', 'Stalna ponudba']]
  const content = []
  for (const [type, label] of groups) {
    const list = (bookingMenu?.[type] || []).filter(item => item.preorder && item.price !== null)
    if (!list.length) continue
    content.push(node('p', { className: 'eyebrow booking-group' }, label))
    for (const item of list) {
      const quantity = node('input', { type: 'number', min: '0', max: String(party * 3), value: '0', inputMode: 'numeric',
        'data-dish': type + ':' + item.id, 'data-price': item.price, 'aria-label': 'Število porcij: ' + item.name })
      content.push(node('label', { className: 'booking-dish' }, node('span', {},
        node('strong', {}, item.name), node('span', { className: 'subtle' }, price(item.price) + (item.allergens ? ' · Alergeni: ' + item.allergens : ''))), quantity))
    }
  }
  container.replaceChildren(...(content.length ? content : [node('p', { className: 'empty' }, 'Jedi lahko naročite ob prihodu.')]))
}

function selections() {
  return $$('[data-dish]').map(input => ({ id: input.dataset.dish, quantity: Number(input.value), quotedPrice: Number(input.dataset.price) }))
    .filter(item => item.quantity > 0)
}

for (const button of $$('[data-menu]')) button.addEventListener('click', () => {
  menuTab = button.dataset.menu
  for (const tab of $$('[data-menu]')) tab.setAttribute('aria-pressed', tab === button)
  paintMenu()
  if (!reducedMotion.matches) $('#menu-items').animate(
    [{ opacity: .3, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: 240, easing: 'ease-out' })
})

form.elements.date.addEventListener('change', () => availability())
form.elements.party.addEventListener('change', () => availability())
$('#to-dishes').addEventListener('click', () => { renderDishes(); showStep(2) })
for (const button of $$('[data-back]')) button.addEventListener('click', () => showStep(Number(button.dataset.back)))
$('#to-contact').addEventListener('click', () => {
  if ($$('[data-dish]').some(input => !input.reportValidity())) return
  const party = Number(form.elements.party.value)
  const total = selections().reduce((sum, item) => sum + item.quantity, 0)
  if (total > party * 3) {
    say(bookingError, 'Izberete lahko največ tri jedi na gosta.')
    return
  }
  text('#booking-summary', dateLabel(form.elements.date.value) + ' · ' + chosenTime + ' · ' + party + ' oseb' + (total ? ' · ' + total + ' porcij' : ''))
  showStep(3)
})

form.addEventListener('submit', async event => {
  event.preventDefault()
  if (step !== 3 || !chosenTime) return
  const submit = $('button[type=submit]', form)
  if (submit.disabled) return
  submit.disabled = true
  say(bookingError, '')
  const values = Object.fromEntries(new FormData(form))
  try {
    const result = await api('reservations', { method: 'POST', body: {
      ...values, party: Number(values.party), time: chosenTime, consent: values.consent === 'on', key: submissionKey, items: selections()
    } })
    form.hidden = true
    const receipt = $('#receipt')
    const pending = result.status === 'pending'
    const message = pending ? 'Ko potrdimo termin, vam pošljemo e-pošto.'
      : result.emailStatus === 'sent' ? 'Potrditev smo poslali na vaš e-poštni naslov.'
      : result.emailStatus === 'preview' ? 'Poskusna rezervacija je shranjena. Pošiljanje e-pošte je v predogledu izklopljeno.'
      : 'Vaša miza je potrjena. Shranite si številko rezervacije.'
    receipt.replaceChildren(
      node('h3', { tabIndex: -1 }, bookingDemo ? 'Preizkus je uspel.' : pending ? 'Zahteva je prejeta.' : 'Miza je vaša.'),
      node('p', {}, dateLabel(result.date) + ' · ' + result.time + ' · ' + result.party + ' oseb'),
      node('p', { className: 'receipt-code' }, result.reference),
      node('p', {}, bookingDemo ? 'Poskusna rezervacija je vidna v pultu in kuhinji tega brskalnika.' : message),
      bookingDemo ? node('a', { className: 'button secondary', href: '/admin?demo=1&date=' + result.date }, 'Odpri pult →') : null,
      node('button', { className: 'plain', onclick: () => {
        receipt.hidden = true
        form.reset()
        showStep(1)
        started = false
        applySite(site)
      } }, 'Nova rezervacija')
    )
    receipt.hidden = false
    $('h3', receipt).focus({ preventScroll: true })
  } catch (error) {
    if (error.status === 409) {
      showStep(1)
      availability()
    }
    say(bookingError, error.message)
  } finally {
    submit.disabled = false
  }
})

if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(entries => {
    for (const { isIntersecting, target } of entries) {
      if (!isIntersecting) continue
      target.classList.remove('awaiting')
      observer.unobserve(target)
    }
  }, { threshold: .12 })
  for (const element of $$('.reveal')) {
    element.classList.add('awaiting')
    observer.observe(element)
  }
}
if ('BroadcastChannel' in window) {
  const updates = new BroadcastChannel('kosta-menu')
  updates.addEventListener('message', refreshSite)
}
refreshSite()
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSite() })
setInterval(() => { if (!document.hidden) refreshSite() }, 10_000)


$('#gallery-more').addEventListener('click', event => {
  const expanded = $('#gallery').classList.toggle('expanded')
  event.currentTarget.setAttribute('aria-expanded', String(expanded))
  event.currentTarget.textContent = expanded ? 'Pokaži manj' : 'Vse fotografije'
})

$('#photo-dialog').addEventListener('click', event => {
  if (event.target === event.currentTarget) event.currentTarget.close()
})
