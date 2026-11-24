import { renderKitchen } from './kitchen.js'
import { planner, reports, serviceOverview } from './manager.js'
import { photoAccept, preparePhoto } from './photo-upload.js'
import { $, $$, api, dateLabel, dateToday, mediaPath, node, price, say, hostedReview } from './ui.js'

const kitchen = location.pathname === '/kitchen'
document.body.classList.toggle('kitchen', kitchen)
const roleNeeded = kitchen ? 'kitchen' : 'owner'
const panel = $('#panel')
const dateInput = $('#service-date')
const notice = $('#staff-message')
const dialog = $('#ticket-dialog')
const login = $('#login-form')
const sectionToggle = $('#owner-view-toggle')
const linksToggle = $('#staff-links-toggle')
const statusNames = {
  pending: 'Čaka na potrditev', confirmed: 'Potrjeno', seated: 'Pri mizi',
  completed: 'Zaključeno', cancelled: 'Preklicano', 'no-show': 'Ni prišel'
}
const prep = { queued: 'Za pripravo', preparing: 'V pripravi', ready: 'Pripravljeno', served: 'Postreženo' }
const emailNames = { phone: 'Dogovor po telefonu', waiting: 'Čaka', sending: 'Pošiljanje', sent: 'Poslano', failed: 'Pošiljanje ni uspelo', unconfigured: 'Ni nastavljeno', preview: 'Predogled' }
const titles = { overview: 'Dnevni pregled', reservations: 'Rezervacije', planner: 'Planer', reports: 'Poročila', daily: 'Dnevni meni', regular: 'Stalna ponudba', media: 'Fotografije', settings: 'Nastavitve' }
let view = 'reservations'
const dateViews = new Set(['overview', 'reservations', 'planner', 'reports', 'daily'])
const isPeriodView = () => view === 'planner' || view === 'reports'
let statusFilter = 'all'
let sourceFilter = 'all'
let searchTerm = ''
let range = Number(new URLSearchParams(location.search).get('days'))
if (![7, 14, 30].includes(range)) range = 7
let snapshot
let lastOverviewMinute
let reservations = []
let service
let request
let role
let dirty = false
let edit
let writes = 0
const requestedDate = new URLSearchParams(location.search).get('date')
let date = /^20\d{2}-\d{2}-\d{2}$/.test(requestedDate || '') ? requestedDate : dateToday()
dateInput.value = date

const btn = (label, handler, classes = 'button secondary small') => node('button', { type: 'button', className: classes, onclick: handler }, label)
const para = (label, classes = 'subtle') => node('p', { className: classes }, label)
const label = (title, control) => node('label', {}, title, control)
const input = (value, options = {}) => node('input', { value: value ?? '', ...options })
const checkbox = (title, checked, change) => node('label', { className: 'check' }, node('input', {
  type: 'checkbox', checked, onchange: event => change(event.currentTarget.checked)
}), node('span', {}, title))
const select = (selected, values, change, description) => {
  const element = node('select', { onchange: event => change?.(event.currentTarget.value), ...(description ? { 'aria-label': description } : {}) },
    ...Object.entries(values).map(([value, name]) => node('option', { value }, name)))
  element.value = selected
  return element
}
const pill = (state, names) => node('span', { className: 'pill', 'data-state': state }, names[state])

function error(error) {
  if (error.status === 401) {
    role = null
    boot()
  }
  say(notice, error.message, 'error')
}

async function action(event, operation, done) {
  const button = event?.currentTarget
  if (button?.disabled) return
  if (button) button.disabled = true
  writes++
  try {
    await operation()
    if (done) say(notice, done, 'success')
  } catch (failure) {
    error(failure)
  } finally {
    writes--
    if (button) button.disabled = false
  }
}

function go(next, nextDate = date, reference = '', status = 'all') {
  if (edit && writes) {
    dateInput.value = date
    say(notice, 'Počakajte, da se trenutna sprememba zaključi.', 'error')
    return
  }
  if (dirty && !confirm('Neshranjene spremembe bodo izgubljene. Želite nadaljevati?')) {
    dateInput.value = date
    return
  }
  dirty = false
  edit = null
  searchTerm = reference
  statusFilter = status
  sourceFilter = 'all'
  const changedView = view !== next
  view = next
  date = nextDate
  dateInput.value = date
  const route = new URL(location.href)
  route.searchParams.set('date', date)
  if (!kitchen) route.searchParams.set('view', view)
  if (isPeriodView()) route.searchParams.set('days', range)
  else route.searchParams.delete('days')
  history.replaceState(null, '', route)
  $('#kitchen-link').href = '/kitchen?' + (hostedReview ? 'demo=1&' : '') + 'date=' + date
  $('#owner-link').href = '/admin?' + (hostedReview ? 'demo=1&' : '') + 'date=' + date
  say(notice, '')
  for (const button of $$('[data-view]')) {
    const selected = button.dataset.view === view
    button.setAttribute('aria-pressed', selected)
    if (selected) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }
  document.title = (kitchen ? 'Kuhinja' : titles[view]) + ' · Bistro Kóšta'
  $('#staff-title').textContent = kitchen ? 'Kuhinjski servis' : titles[view]
  $('#owner-view-current').textContent = titles[view]
  $('#staff-tools').hidden = !dateViews.has(view)
  if (changedView) window.scrollTo({ top: 0, behavior: 'instant' })
  panel.replaceChildren(para('Nalagamo …', 'empty'))
  load()
  return true
}

async function load({ quiet = false } = {}) {
  request?.abort()
  const controller = new AbortController()
  request = controller
  const isBoard = ['overview', 'reservations'].includes(view)
  try {
    const endpoint = isPeriodView() ? 'dashboard' : isBoard ? 'board' : 'content'
    const query = new URLSearchParams({ date, view: kitchen ? 'kitchen' : view })
    if (isPeriodView()) query.set('days', range)
    const result = await api(endpoint + '?' + query, { signal: controller.signal })
    if (controller.signal.aborted) return
    if (quiet && (dialog.open || (!kitchen && panel.contains(document.activeElement)))) return
    if (isPeriodView()) {
      if (quiet && JSON.stringify(result) === JSON.stringify(snapshot)) return
      snapshot = result
      renderPeriod()
      return
    }
    if (!isBoard) {
      edit = result
      renderContent()
      return
    }
    const minute = clock.format(new Date())
    if (quiet && (view !== 'overview' || minute === lastOverviewMinute) &&
      JSON.stringify(result.reservations) === JSON.stringify(reservations) && JSON.stringify(result.service) === JSON.stringify(service)) return
    service = result.service
    reservations = result.reservations
    if (kitchen) renderKitchen({ panel, reservations, date, changeTicket, action })
    else if (view === 'overview') {
      lastOverviewMinute = minute
      panel.replaceChildren(serviceOverview({
        date, today: result.today, time: minute, service, reservations, row: reservationRow,
        navigate: go, create: openDeskBooking, kitchenHref: $('#kitchen-link').href
      }))
    } else renderBoard()
  } catch (failure) {
    if (controller.signal.aborted) return
    error(failure)
    if (!quiet) panel.replaceChildren(btn('Poskusi znova', () => load()))
  }
}

async function changeTicket(id, patch) {
  await api('reservations/' + id, { method: 'PATCH', body: patch })
  await load()
}

function reservationRow(record) {
  const next = { pending: ['Potrdi', 'confirmed'], confirmed: ['Gostje so prišli', 'seated'], seated: ['Zaključi', 'completed'] }[record.status]
  return node('article', { className: 'ticket' },
    node('time', { className: 'ticket-time', dateTime: record.time }, record.time),
    node('div', { className: 'ticket-middle' }, node('strong', { className: 'ticket-name' }, record.name),
      para(record.party + ' oseb' + (record.table ? ' · Miza ' + record.table : '') + ' · ' + record.reference, 'ticket-meta'),
      record.items.length ? para(record.items.map(item => item.quantity + ' × ' + item.name).join(' · '), 'ticket-items') : null),
    pill(record.status, statusNames),
    node('div', { className: 'ticket-actions' },
      record.status === 'pending' && record.phone ? node('a', { className: 'call-guest', href: 'tel:' + record.phone.replace(/[^+0-9]/g, ''), 'aria-label': 'Pokliči gosta: ' + record.name }, 'Pokliči') : null,
      btn('Odpri', () => openTicket(record)),
      next ? btn(next[0], event => action(event, () => changeTicket(record.id, { status: next[1] }), 'Status je posodobljen.'), 'button secondary small') : null))
}

function renderPeriod() {
  const render = view === 'planner' ? planner : reports
  panel.replaceChildren(render({
    snapshot, navigate: go, changeDate: day => go(view, day), changeRange: days => {
      range = days
      go(view)
    }
  }))
}

function renderBoard() {
  const list = node('div', { className: 'tickets' })
  const results = node('p', { className: 'subtle board-results', 'aria-live': 'polite' })
  function updateList() {
    const query = searchTerm.trim().toLocaleLowerCase('sl')
    const digits = query.replace(/\D/g, '')
    const records = reservations.filter(record => {
      const source = record.source === 'web' || record.source === 'desk' ? record.source : 'unknown'
      return (statusFilter === 'all' || record.status === statusFilter) && (sourceFilter === 'all' || source === sourceFilter) &&
        (!query || [record.name, record.reference, record.table, record.phone, record.email]
          .some(value => String(value || '').toLocaleLowerCase('sl').includes(query)) ||
          (/^[+()0-9\s-]+$/.test(query) && digits.length >= 3 && (record.phone || '').replace(/\D/g, '').includes(digits)))
    })
    results.textContent = 'Prikazano ' + records.length + ' od ' + reservations.length + ' rezervacij'
    list.replaceChildren(...(records.length ? records.map(reservationRow) : [
      node('div', { className: 'empty-board' },
        node('h3', {}, reservations.length ? 'Ni zadetkov' : 'Ni napovedanih miz'),
        para(reservations.length ? 'Spremenite iskalni niz ali filtre.' : 'Telefonsko rezervacijo lahko vpišete za izbrani dan.'))
    ]))
  }
  const listHead = node('div', { className: 'board-tools' }, node('div', {},
    node('h2', {}, 'Seznam miz'), para(dateLabel(date))),
    btn('+ Vpiši rezervacijo', openDeskBooking, 'button primary small'))
  const filters = node('div', { className: 'board-filters' },
    label('Iskanje', input(searchTerm, { type: 'search', 'aria-label': 'Poišči rezervacijo', placeholder: 'Ime, stik, miza ali številka',
      oninput: event => { searchTerm = event.currentTarget.value; updateList() } })),
    label('Status', select(statusFilter, { all: 'Vsi statusi', ...statusNames }, value => { statusFilter = value; updateList() }, 'Filtriraj status')),
    label('Vir', select(sourceFilter, { all: 'Vsi viri', web: 'Prek spleta', desk: 'Ročni vpis', unknown: 'Ni zabeležen' },
      value => { sourceFilter = value; updateList() }, 'Filtriraj vir')))
  updateList()
  panel.replaceChildren(node('section', { className: 'service-list manager-card' }, listHead, filters, results, list))
}

function openDeskBooking() {
  $('#ticket-title').textContent = 'Vpiši rezervacijo'
  const editor = node('form', { className: 'fields' })
  const day = input(date < dateToday() ? dateToday() : date, { type: 'date', required: true, min: dateToday() })
  const guests = input(String(Math.min(2, service.maxParty)), { type: 'number', min: '1', max: String(service.maxParty), required: true })
  const time = node('select', { required: true })
  const guest = input('', { required: true, maxLength: 90 })
  const phone = input('', { type: 'tel', required: true, maxLength: 32 })
  const notes = node('textarea', { rows: 2, maxLength: 500 })
  const menuDetails = node('details', { className: 'desk-order' })
  const menuLines = node('div', { className: 'desk-order-lines' })
  menuDetails.append(node('summary', {}, 'Dodaj prednaročilo'), menuLines)
  const quantities = new Map()
  const message = para('', 'error')
  message.setAttribute('role', 'status')
  const submit = node('button', { type: 'submit', className: 'button primary', disabled: true }, 'Potrdi rezervacijo')
  const key = crypto.randomUUID()
  let sequence = 0
  async function times() {
    const current = ++sequence
    submit.disabled = true
    time.replaceChildren()
    if (!day.checkValidity() || !guests.checkValidity()) return
    try {
      const result = await api('availability?' + new URLSearchParams({ date: day.value, party: guests.value, desk: '1' }))
      if (current !== sequence) return
      const dishes = [['daily', 'Dnevni meni'], ['regular', 'Stalna ponudba']].flatMap(([section, group]) =>
        result.menu[section].filter(dish => dish.preorder && dish.price !== null)
          .map(dish => ({ ...dish, selection: section + ':' + dish.id, group })))
      const wanted = new Set(dishes.map(dish => dish.selection))
      for (const key of quantities.keys()) if (!wanted.has(key)) quantities.delete(key)
      menuDetails.hidden = !dishes.length
      menuLines.replaceChildren(...dishes.map(dish => {
        const current = Math.min(quantities.get(dish.selection) || 0, Number(guests.value) * 3)
        quantities.set(dish.selection, current)
        return node('label', { className: 'desk-dish' },
          node('span', {}, node('strong', {}, dish.name), para(dish.group + ' · ' + price(dish.price), 'subtle')),
          input(String(current), { type: 'number', min: '0', max: String(Number(guests.value) * 3),
            'aria-label': 'Porcije · ' + dish.name, oninput: event => quantities.set(dish.selection, Number(event.currentTarget.value)) }))
      }))
      time.replaceChildren(...result.slots.map(slot => node('option', { value: slot }, slot)))
      say(message, result.slots.length ? '' : 'Ni prostih ur. Izberite drug datum ali število gostov.')
      submit.disabled = !result.slots.length
    } catch (failure) {
      if (current === sequence) say(message, failure.message)
    }
  }
  day.addEventListener('input', times)
  guests.addEventListener('input', times)
  editor.append(node('div', { className: 'fields two' }, label('Datum', day), label('Gostje', guests)),
    label('Prosta ura', time), label('Ime in priimek', guest), label('Telefon', phone),
    menuDetails, label('Opomba za kuhinjo', notes), message, submit)
  editor.addEventListener('submit', async event => {
    event.preventDefault()
    if (submit.disabled) return
    submit.disabled = true
    try {
      await api('desk-reservations', { method: 'POST', body: {
        date: day.value, time: time.value, party: Number(guests.value), name: guest.value,
        phone: phone.value, notes: notes.value, key,
        items: [...quantities].filter(([, quantity]) => quantity > 0).map(([id, quantity]) => ({ id, quantity }))
      } })
      dialog.close()
      go('reservations', day.value)
      say(notice, 'Telefonska rezervacija je potrjena.', 'success')
    } catch (failure) {
      if (failure.status === 409) await times()
      else submit.disabled = false
      say(message, failure.message)
    }
  })
  $('#ticket-dialog-body').replaceChildren(editor)
  dialog.showModal()
  times()
}

function openTicket(record) {
  $('#ticket-title').textContent = 'Miza · ' + record.time
  const editor = node('form', { className: 'fields' })
  const fields = {}
  const contactFields = [
    ['name', 'Ime in priimek', 'text', 90], ['email', 'E-pošta', 'email', 180], ['phone', 'Telefon', 'tel', 32],
    ['date', 'Datum', 'date'], ['time', 'Ura', 'time'], ['party', 'Gostje', 'number']
  ].map(([key, title, type, maxLength]) => {
    const control = input(String(record[key]), { type, required: key !== 'email' || record.source !== 'desk', maxLength })
    if (key === 'party') { control.min = '1'; control.max = '200' }
    fields[key] = control
    return label(title, control)
  })
  fields.table = input(record.table, { maxLength: 36 })
  fields.notes = node('textarea', { rows: 2, maxLength: 500, value: record.notes })
  fields.staffNotes = node('textarea', { rows: 2, maxLength: 500, value: record.staffNotes })
  const reservationStatus = select(record.status, statusNames, null, 'Status rezervacije')
  const kitchenStatus = select(record.kitchenStatus, prep, null, 'Status priprave')
  const order = structuredClone(record.items)
  let orderChanged = false
  const orderLines = node('div', { className: 'fields' })
  const renderOrder = () => {
    orderLines.replaceChildren(...order.map((item, index) => node('div', { className: 'dish-line' },
      label('Porcije', input(String(item.quantity), { type: 'number', min: '1', max: '150', required: true, oninput: event => {
        orderChanged = true; item.quantity = Number(event.currentTarget.value)
      } })),
      label('Jed', input(item.name, { required: true, maxLength: 180, oninput: event => { orderChanged = true; item.name = event.currentTarget.value } })),
      label('Cena, €', input((item.price / 100).toFixed(2), { type: 'number', step: '0.01', min: '0', max: '1000', required: true, oninput: event => {
        orderChanged = true; item.price = Math.round(Number(event.currentTarget.value) * 100)
      } })),
      btn('×', () => { orderChanged = true; order.splice(index, 1); renderOrder() }, 'remove'))))
  }
  renderOrder()
  const dialogError = para('', 'error')
  dialogError.hidden = true
  dialogError.setAttribute('role', 'alert')
  const submit = node('button', { type: 'submit', className: 'button primary' }, 'Shrani rezervacijo')
  editor.append(para(record.reference + ' · E-pošta: ' + (emailNames[record.emailStatus] || '—')),
    node('div', { className: 'fields two' }, ...contactFields),
    label('Miza', fields.table), label('Opomba gosta', fields.notes), label('Opomba za kuhinjo', fields.staffNotes),
    node('div', { className: 'fields two' }, label('Status rezervacije', reservationStatus), label('Status priprave', kitchenStatus)),
    node('details', { className: 'ticket-order' }, node('summary', {}, 'Prednaročilo · ' + order.length + ' jedi'), orderLines,
      btn('+ Dodaj jed', () => {
        orderChanged = true
        order.push({ id: 'manual:' + crypto.randomUUID(), name: '', quantity: 1, price: 0, allergens: '' })
        renderOrder()
        $('input[type=text], input:not([type])', orderLines.lastElementChild)?.focus()
      }, 'plain')),
    dialogError, node('div', { className: 'dialog-actions' }, submit,
      record.email && record.confirmationChannel !== 'phone' && record.status === 'confirmed' && !['sent', 'preview', 'phone'].includes(record.emailStatus)
        ? btn('Ponovi pošiljanje', event => action(event, async () => {
          await changeTicket(record.id, { retryEmail: true })
          dialog.close()
        }, 'Stanje pošiljanja je posodobljeno.')) : null))
  editor.addEventListener('submit', async event => {
    event.preventDefault()
    submit.disabled = true
    say(dialogError, '')
    try {
      const details = Object.fromEntries(Object.entries(fields).map(([key, control]) =>
        [key, key === 'party' ? Number(control.value) : control.value]))
      if (orderChanged) details.order = order
      await changeTicket(record.id, { details, status: reservationStatus.value, kitchenStatus: kitchenStatus.value })
      dialog.close()
      if (!reservations.some(r => r.id === record.id) && details.date !== date) go('reservations', details.date)
      say(notice, 'Rezervacija je shranjena.', 'success')
    } catch (failure) {
      say(dialogError, failure.message)
    } finally {
      submit.disabled = false
    }
  })
  $('#ticket-dialog-body').replaceChildren(editor)
  dialog.showModal()
}

function uploadControl(title, update) {
  const status = node('p', { className: 'upload-feedback', role: 'status', hidden: true })
  const file = node('input', { type: 'file', accept: photoAccept, onchange: async event => {
    const control = event.currentTarget
    if (!control.files[0]) return
    control.disabled = true
    const editor = edit
    say(status, 'Nalagamo fotografijo …', 'pending')
    writes++
    try {
      const body = await preparePhoto(control.files[0])
      const { url } = await api('media', { method: 'POST', body })
      if (editor !== edit) return
      dirty = true
      const currentStatus = update(url) ?? (status.isConnected ? status : notice)
      say(currentStatus, 'Fotografija je naložena. Shranite spremembe.', 'success')
    } catch (failure) {
      if (failure.status === 401) error(failure)
      else say(status.isConnected ? status : notice, failure.message, 'error')
    } finally {
      control.disabled = false
      control.value = ''
      writes--
    }
  } })
  return node('div', { className: 'upload-control' }, node('label', { className: 'upload' }, title, file), status)
}

function bind(item, key, options = {}) {
  const control = input(item[key], options)
  control.addEventListener('input', () => { dirty = true; item[key] = control.value })
  return control
}

function photoField(initial, change) {
  const image = node('img', { src: initial || undefined, alt: '', hidden: !initial })
  const choose = url => {
    if (!url) return
    image.hidden = false
    image.src = url
    dirty = true
    change(url)
  }
  const library = Object.fromEntries(edit.gallery.filter(photo => mediaPath(photo.src)).map(photo => [photo.src, photo.alt || 'Fotografija']))
  const gallery = select(initial in library ? initial : '', { '': 'Izberi iz galerije', ...library }, choose, 'Fotografija iz galerije')
  return node('div', { className: 'photo-field' }, image, gallery, uploadControl('Naloži fotografijo', url => {
    gallery.value = ''
    choose(url)
  }))
}

function editDish(item, remove) {
  const euros = input(item.price === null ? '' : (item.price / 100).toFixed(2), { type: 'number', step: '0.01', min: '0', max: '1000' })
  euros.addEventListener('input', () => {
    dirty = true
    item.price = euros.value === '' ? null : Math.round(Number(euros.value) * 100)
  })
  const details = node('details', {}, node('summary', {}, 'Opis, alergeni in fotografija'),
    node('div', { className: 'fields' }, label('Opis', bind(item, 'description', { maxLength: 350 })),
      label('Alergeni', bind(item, 'allergens', { maxLength: 100 })),
      photoField(item.photo, url => { item.photo = url }), item.photo ? btn('Odstrani fotografijo', () => {
        item.photo = ''
        dirty = true
        renderContent()
      }, 'plain') : null))
  return node('article', { className: 'dish-edit' },
    node('div', { className: 'dish-main' }, label('Jed', bind(item, 'name', { required: true, maxLength: 180 })),
      label('Cena, €', euros), btn('Odstrani', remove, 'remove')),
    node('div', { className: 'dish-checks' },
      checkbox('Vidna na spletu', item.active, value => { item.active = value; dirty = true }),
      checkbox('Na voljo za prednaročilo', item.preorder, value => { item.preorder = value; dirty = true })),
    details)
}

async function save(input, message, { reload = true, status = notice } = {}) {
  if (writes > 1) throw new Error('Počakajte, da se nalaganje konča.')
  await api('content', { method: 'PUT', body: input })
  if ('BroadcastChannel' in window) {
    const updates = new BroadcastChannel('kosta-menu')
    updates.postMessage('published')
    updates.close()
  }
  dirty = false
  if (reload) await load()
  say(status, message, 'success')
}

function menuEditor() {
  const daily = view === 'daily'
  edit.daily ??= { items: [], published: false }
  const items = daily ? edit.daily.items : edit.regular
  const published = daily && edit.daily.published
  const form = node('form', { className: 'editor', onsubmit: event => event.preventDefault() })
  const add = btn('+ Dodaj jed', () => {
    if (items.length >= 50) return say(notice, 'Meni lahko vsebuje največ 50 jedi.', 'error')
    items.push({ id: crypto.randomUUID(), name: '', price: null, description: '', allergens: '', active: true, preorder: true, photo: '' })
    dirty = true
    renderContent()
    const last = $$('.dish-edit', panel).at(-1)
    $('input', last).focus()
  })
  const controls = node('div', { className: 'editor-top' }, node('div', {},
    node('h2', {}, daily ? dateLabel(date) : 'Jedi na jedilniku'),
    para(daily ? (published ? 'Objavljeno za ta datum' : 'Osnutek · še ni objavljeno') : 'Spremembe se po shranjevanju prikažejo na spletni strani.')),
  daily && !items.length ? btn('Naloži primer z 15. aprila', () => {
    items.push(...structuredClone(edit.example))
    dirty = true
    renderContent()
  }) : null)
  const dates = daily ? edit.dailyDates.filter(day => day !== date).reverse() : []
  if (dates.length && !items.length) {
    const recent = dates.find(day => day < date) || dates[0]
    const sourceDate = select(recent, Object.fromEntries(dates.map(day => [day, dateLabel(day)])))
    controls.append(node('div', { className: 'menu-copy' }, label('Kopiraj s shranjenega menija', sourceDate),
      btn('Kopiraj jedi', event => action(event, async () => {
      const current = edit
      const source = await api('content?date=' + sourceDate.value)
      if (current !== edit || items.length || view !== 'daily') return
      if (!source.daily?.items.length) throw new Error('Izbrani meni nima jedi.')
      items.push(...structuredClone(source.daily.items))
      dirty = true
      renderContent()
      say(notice, 'Jedi so kopirane. Meni lahko uredite in objavite.', 'success')
    }))))
  }
  const write = (event, publish = false) => {
    if (!form.reportValidity()) return
    action(event, () => save({ section: view, date, published: publish, items },
      daily ? (publish ? 'Dnevni meni je objavljen.' : 'Osnutek je shranjen.') : 'Stalna ponudba je posodobljena.'))
  }
  form.append(controls, ...(dates.length ? [node('details', { className: 'menu-history' }, node('summary', {}, 'Shranjeni meniji'), ...dates.slice(0, 8).map(day =>
    btn(dateLabel(day), () => go('daily', day), 'button secondary small')))] : []),
    ...items.map((item, index) => editDish(item, () => {
      items.splice(index, 1)
      dirty = true
      renderContent()
    })),
    node('div', { className: 'editor-actions' }, add, daily ? btn(published ? 'Umik v osnutek' : 'Shrani osnutek', event => write(event)) : null,
      btn(daily ? (published ? 'Posodobi objavo' : 'Objavi meni') : 'Shrani spremembe', event => write(event, true), 'button primary')))
  form.insertBefore(form.querySelector('.editor-actions'), controls.nextSibling)
  return form
}

function mediaEditor() {
  const gallery = edit.gallery
  const settings = edit.settings
  const photos = [['hero', 'Uvodna fotografija'], ['storyPhoto', 'Fotografija pri zgodbi'], ['terracePhoto', 'Fotografija pri obisku']]
  const galleryForm = node('form', { onsubmit: submitPhotos })
  const grid = node('div', { className: 'photo-grid' })
  const saveButton = title => node('button', { type: 'submit', className: 'button primary' }, title)
  const feedback = () => ({
    status: node('p', { className: 'photo-feedback', role: 'status', hidden: true }),
    link: node('a', { className: 'underlink photo-review-link', href: hostedReview ? '/?demo=1' : '/',
      target: '_blank', rel: 'noopener', hidden: true }, hostedReview ? 'Odpri poskusno stran ↗' : 'Poglej na spletni strani ↗')
  })
  const topFeedback = feedback()
  const bottomFeedback = feedback()
  const add = uploadControl('+ Dodaj fotografijo', url => {
    if (gallery.length >= 40) return say(notice, 'Galerija lahko vsebuje največ 40 slik.', 'error')
    gallery.push({ src: url, alt: '' })
    renderContent()
    $$('.photo-edit input[type=text]', panel).at(-1)?.focus()
    return $('.photo-edit:last-child .upload-feedback', panel)
  })
  add.classList.add('photo-add')
  galleryForm.append(node('div', { className: 'editor-top photo-editor-top' },
    node('div', {}, node('h2', {}, 'Galerija'), para('Fotografije in njihov vrstni red na spletni strani.')),
    node('div', { className: 'photo-toolbar' }, add, saveButton('Shrani fotografije')),
    hostedReview ? node('p', { className: 'subtle photo-demo-note' },
      'Za objavo na spletni strani se prijavite v ', node('a', { href: '/admin?view=media', className: 'underlink' }, 'pult za ekipo'), '.') : null,
    node('div', { className: 'photo-save-result' }, topFeedback.status, topFeedback.link)))

  async function submitPhotos(event) {
    event.preventDefault()
    const { status, link } = event.submitter?.closest('.photo-footer') ? bottomFeedback : topFeedback
    if (writes) return say(status, 'Počakajte, da se nalaganje konča.', 'error')
    const coverPhotos = Object.fromEntries(photos.map(([key]) => [key, settings[key]]))
    const controls = $$('input:enabled, select:enabled, button:enabled', galleryForm)
    controls.forEach(control => { control.disabled = true })
    writes++
    for (const feedback of [topFeedback, bottomFeedback]) {
      say(feedback.status, '')
      feedback.link.hidden = true
    }
    say(status, 'Shranjujemo …', 'pending')
    try {
      const message = hostedReview ? 'Fotografije so shranjene v poskusni strani.' : 'Fotografije so objavljene.'
      await save({ section: 'media', gallery, photos: coverPhotos }, message, { reload: false, status })
      for (const uploadStatus of $$('.upload-feedback', galleryForm)) say(uploadStatus, '')
      link.hidden = false
      say(notice, '')
    } catch (failure) {
      say(status, failure.message, 'error')
      if (failure.status === 401) error(failure)
    } finally {
      controls.forEach(control => { control.disabled = false })
      event.submitter?.focus({ preventScroll: true })
      writes--
    }
  }

  function movePhoto(index, direction) {
    const target = index + direction
    const [photo] = gallery.splice(index, 1)
    gallery.splice(target, 0, photo)
    dirty = true
    renderContent()
    const card = $$('.photo-edit', panel)[target]
    const reorder = $(`[data-direction="${direction}"]:enabled`, card) || $('.photo-order button:enabled', card)
    reorder?.focus({ preventScroll: true })
    card.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  }
  for (const [index, photo] of gallery.entries()) {
    const replace = uploadControl('Zamenjaj', url => {
      const current = gallery.indexOf(photo)
      if (current < 0) return
      photo.src = url
      renderContent()
      return $('.upload-feedback', $$('.photo-edit', panel)[current])
    })
    replace.classList.add('photo-replace')
    $('input', replace).setAttribute('aria-label', 'Zamenjaj fotografijo')
    grid.append(node('article', { className: 'photo-edit' },
      node('img', { src: mediaPath(photo.src) ? photo.src : undefined, alt: photo.alt || '', loading: 'lazy' }),
      label('Opis fotografije', bind(photo, 'alt', { type: 'text', required: true, maxLength: 100 })),
      node('div', { className: 'photo-actions' }, replace,
        node('div', { className: 'photo-order' },
          node('button', { type: 'button', disabled: index === 0, 'data-direction': -1, 'aria-label': 'Premakni fotografijo prej', onclick: () => movePhoto(index, -1) }, '↑'),
          node('button', { type: 'button', disabled: index === gallery.length - 1, 'data-direction': 1, 'aria-label': 'Premakni fotografijo pozneje', onclick: () => movePhoto(index, 1) }, '↓')),
        btn('Odstrani', () => {
          gallery.splice(index, 1)
          dirty = true
          renderContent()
          const target = $$('.photo-edit .remove', panel)[Math.min(index, gallery.length - 1)] || $('.photo-add input', panel)
          target.focus()
        }, 'remove'))))
  }
  galleryForm.append(grid)
  galleryForm.append(node('fieldset', { className: 'settings-group' },
    node('legend', {}, 'Naslovne fotografije'), node('div', { className: 'fields' }, ...photos.map(([key, title]) =>
      node('div', {}, node('strong', {}, title), photoField(settings[key], url => { settings[key] = url }))))),
    node('div', { className: 'photo-footer' }, node('div', { className: 'photo-save-result' }, bottomFeedback.status, bottomFeedback.link),
      saveButton('Shrani spremembe')))
  return node('div', { className: 'editor media-editor' }, galleryForm)
}

function settingsEditor() {
  const settings = edit.settings
  const form = node('form', { className: 'editor', onsubmit: event => event.preventDefault() })
  const details = [['address', 'Naslov', 180], ['phone', 'Telefon', 32], ['delivery', 'Dostava', 180], ['terrace', 'Terasa', 350], ['intro', 'Uvod', 350]]
  const metrics = [['seats', 'Sedeži za spletne rezervacije', 1, 200], ['maxParty', 'Največ gostov na mizo', 1, 50],
    ['duration', 'Trajanje mize (min)', 30, 240], ['leadMinutes', 'Koliko prej (min)', 0, 2880], ['daysAhead', 'Rezervacije vnaprej (dni)', 1, 365]]
  const weekdays = ['Nedelja', 'Ponedeljek', 'Torek', 'Sreda', 'Četrtek', 'Petek', 'Sobota']
  const hours = settings.hours.map(periods => periods.map(pair => pair.join('–')).join(', '))
  form.append(node('div', { className: 'fields' }, ...details.map(([key, title, maxLength]) =>
    label(title, bind(settings, key, { maxLength, required: ['address', 'phone', 'intro'].includes(key) }))),
  label('Zgodba', node('textarea', { rows: 4, maxLength: 1200, required: true, value: settings.story, oninput: event => {
    dirty = true
    settings.story = event.currentTarget.value
  } }))),
  node('fieldset', { className: 'settings-group' }, node('legend', {}, 'Odpiralni čas'),
    para('Več terminov ločite z vejico. Prazno polje pomeni, da ste zaprti.'),
    node('div', { className: 'hours-grid' }, ...[1, 2, 3, 4, 5, 6, 0].map(index =>
      label(weekdays[index], input(hours[index], { placeholder: '09:00–15:00, 18:00–22:00', oninput: event => {
        dirty = true
        hours[index] = event.currentTarget.value
      } }))))),
  node('fieldset', { className: 'settings-group' }, node('legend', {}, 'Spletne rezervacije'),
    node('div', { className: 'fields' },
      checkbox('Sprejemam spletne rezervacije', settings.bookingOpen, value => { dirty = true; settings.bookingOpen = value }),
      checkbox('Samodejno potrdi, kadar je miza prosta', settings.autoConfirm, value => { dirty = true; settings.autoConfirm = value }),
      para(edit.preview ? 'Predogled: e-pošta se ne pošilja.' : edit.emailConfigured ? 'Potrditvena e-pošta je nastavljena.' : 'Gost lahko odda zahtevo prek spleta. Za potrditev ga pokličite. Za samodejno potrjevanje nastavite e-poštnega pošiljatelja.'),
      node('div', { className: 'settings-grid' }, ...metrics.map(([key, title, min, max]) =>
        label(title, input(String(settings[key]), { type: 'number', min: String(min), max: String(max), required: true, oninput: event => {
          dirty = true
          settings[key] = Number(event.currentTarget.value)
        } })))))),
  node('div', { className: 'editor-actions' }, btn('Shrani nastavitve', event => {
    if (!form.reportValidity()) return
    const parsed = hours.map(value => value.split(',').map(s => s.trim()).filter(Boolean).map(pair => pair.split(/[–-]/).map(s => s.trim())))
    action(event, () => save({ section: 'settings', settings: { ...settings, hours: parsed } }, 'Nastavitve so shranjene.'))
  }, 'button primary')))
  const bookingSettings = form.querySelectorAll('fieldset')[1]
  form.prepend(bookingSettings)
  const general = form.querySelector(':scope > .fields')
  general.prepend(node('h2', {}, 'Podatki o bistroju'))
  const saveButton = form.querySelector('.editor-actions')
  form.prepend(saveButton)
  return form
}

function renderContent() {
  const editors = { daily: menuEditor, regular: menuEditor, media: mediaEditor, settings: settingsEditor }
  panel.replaceChildren(editors[view]())
}

async function boot() {
  try {
    const session = await api('session')
    role = session.role
    const allowed = role === 'owner' || (kitchen && role === 'kitchen')
    $('#startup').hidden = true
    $('#signin').hidden = allowed
    $('#workspace').hidden = !allowed
    $('#logout').hidden = !role || hostedReview
    $('#owner-link').hidden = !kitchen || (!hostedReview && role !== 'owner')
    $('#kitchen-link').hidden = role !== 'owner' || kitchen
    $('#owner-nav').hidden = kitchen || role !== 'owner'
    closeDisclosure(linksToggle)
    closeDisclosure(sectionToggle)
    $('#signin-title').textContent = kitchen ? 'Kuhinjski servis' : 'Pult bistroja'
    $('#signin-description').textContent = kitchen ? 'Prijavite se za pregled naročenih porcij in pripravo miz.' : 'Prijavite se za urejanje rezervacij, dnevne ponudbe in fotografij.'
    say($('#preview-login'), session.preview ? 'Lokalni predogled · geslo: kosta-' + roleNeeded + '-demo' : '')
    if (kitchen) {
      $('#preview-link').href = '/kitchen?demo=1'
      $('#preview-link').textContent = 'Odpri poskusno kuhinjo →'
    }
    if (!allowed) return
    document.body.classList.toggle('kitchen', kitchen)
    if (kitchen) $('#staff-eyebrow').textContent = 'KUHINJA · KÓŠTA'
    const initialView = new URL(location.href).searchParams.get('view')
    go(kitchen ? 'reservations' : Object.hasOwn(titles, initialView) ? initialView : 'overview')
    if (hostedReview) {
      $('.staff-header .wordmark').href = '/?demo=1'
      $('#public-link').href = '/?demo=1'
    }
  } catch (failure) {
    say($('#startup'), failure.message, 'error')
  }
}

login.addEventListener('submit', async event => {
  event.preventDefault()
  const submit = $('button', login)
  submit.disabled = true
  say($('#login-error'), '')
  try {
    await api('session', { method: 'POST', body: { role: roleNeeded, password: login.elements.password.value } })
    login.reset()
    await boot()
  } catch (failure) {
    say($('#login-error'), failure.message)
  } finally {
    submit.disabled = false
  }
})
$('#logout').addEventListener('click', async () => {
  if (dirty && !confirm('Želite zavreči neshranjene spremembe in se odjaviti?')) return
  try {
    await api('session', { method: 'DELETE' })
    dirty = false
    await boot()
  } catch (failure) {
    error(failure)
  }
})
const isOpen = toggle => toggle.getAttribute('aria-expanded') === 'true'
function closeDisclosure(toggle, restoreFocus = false) {
  if (!isOpen(toggle)) return
  toggle.setAttribute('aria-expanded', 'false')
  if (restoreFocus && toggle.getClientRects().length) toggle.focus({ preventScroll: true })
}
for (const toggle of [sectionToggle, linksToggle]) {
  const region = toggle.parentElement
  toggle.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', String(!isOpen(toggle)))
  })
  region.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isOpen(toggle)) return
    event.preventDefault()
    closeDisclosure(toggle, true)
  })
  document.addEventListener('click', event => {
    if (!region.contains(event.target)) closeDisclosure(toggle)
  })
}
for (const button of $$('[data-view]')) button.addEventListener('click', () => {
  if (view === button.dataset.view || go(button.dataset.view)) closeDisclosure(sectionToggle, true)
})
function adjacentDay(offset) {
  const day = new Date(date + 'T12:00:00Z')
  day.setUTCDate(day.getUTCDate() + offset)
  go(view, day.toISOString().slice(0, 10))
}
$('#prev-day').addEventListener('click', () => adjacentDay(-1))
$('#next-day').addEventListener('click', () => adjacentDay(1))
dateInput.addEventListener('change', () => { if (dateInput.value) go(view, dateInput.value) })
$('#today').addEventListener('click', () => go(view, dateToday()))
window.addEventListener('beforeunload', event => {
  if (dirty) { event.preventDefault(); event.returnValue = '' }
})
const clock = new Intl.DateTimeFormat('sl-SI', { timeZone: 'Europe/Ljubljana', hour: '2-digit', minute: '2-digit' })
function tick() {
  $('#service-clock').textContent = clock.format(new Date())
}
tick()
setInterval(tick, 1000)
setInterval(() => {
  if (role && !$('#workspace').hidden && (view === 'overview' || view === 'reservations' || isPeriodView()) &&
    !document.hidden && !dialog.open && !writes) load({ quiet: true })
}, 10_000)
boot()
