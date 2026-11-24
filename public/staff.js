import { renderKitchen } from './kitchen.js'
import { $, $$, api, dateLabel, dateToday, mediaPath, node, price, say, hostedReview } from './ui.js'

const kitchen = location.pathname === '/kitchen'
document.body.classList.toggle('kitchen', kitchen)
const roleNeeded = kitchen ? 'kitchen' : 'owner'
const panel = $('#panel')
const dateInput = $('#service-date')
const notice = $('#staff-message')
const dialog = $('#ticket-dialog')
const login = $('#login-form')
const statusNames = {
  pending: 'Čaka na potrditev', confirmed: 'Potrjeno', seated: 'Pri mizi',
  completed: 'Zaključeno', cancelled: 'Preklicano', 'no-show': 'Ni prišel'
}
const prep = { queued: 'Za pripravo', preparing: 'V pripravi', ready: 'Pripravljeno', served: 'Postreženo' }
const emailNames = { phone: 'Dogovor po telefonu', waiting: 'Čaka', sending: 'Pošiljanje', sent: 'Poslano', failed: 'Pošiljanje ni uspelo', unconfigured: 'Ni nastavljeno', preview: 'Predogled' }
const titles = { overview: 'Dnevni pregled', reservations: 'Rezervacije', daily: 'Dnevni meni', regular: 'Stalna ponudba', media: 'Fotografije', settings: 'Nastavitve' }
let view = 'reservations'
let statusFilter = 'all'
let searchTerm = ''
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
  const element = node('select', { onchange: event => change?.(event.currentTarget.value), 'aria-label': description },
    ...Object.entries(values).map(([value, name]) => node('option', { value }, name)))
  element.value = selected
  return element
}
const pill = (state, names) => node('span', { className: 'pill', 'data-state': state }, names[state])
const stat = (value, title) => node('div', { className: 'stat' }, node('strong', {}, String(value)), node('span', {}, title))
const active = record => ['pending', 'confirmed', 'seated'].includes(record.status)

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

function go(next, nextDate = date, reference = '') {
  if (dirty && !confirm('Neshranjene spremembe bodo izgubljene. Želite nadaljevati?')) {
    dateInput.value = date
    return
  }
  dirty = false
  edit = null
  searchTerm = reference
  statusFilter = 'all'
  view = next
  date = nextDate
  dateInput.value = date
  const route = new URL(location.href)
  route.searchParams.set('date', date)
  if (!kitchen) route.searchParams.set('view', view)
  history.replaceState(null, '', route)
  $('#kitchen-link').href = '/kitchen?' + (hostedReview ? 'demo=1&' : '') + 'date=' + date
  $('#owner-link').href = '/admin?' + (hostedReview ? 'demo=1&' : '') + 'date=' + date
  say(notice, '')
  for (const button of $$('[data-view]')) button.setAttribute('aria-pressed', button.dataset.view === view)
  document.title = (kitchen ? 'Kuhinja' : titles[view]) + ' · Bistro Kóšta'
  $('#staff-title').textContent = kitchen ? 'Kuhinjski servis' : titles[view]
  $('#date-control').hidden = !['overview', 'reservations', 'daily'].includes(view)
  $('#today').hidden = $('#date-control').hidden
  panel.replaceChildren(para('Nalagamo …', 'empty'))
  load()
}

async function load({ quiet = false } = {}) {
  request?.abort()
  const controller = new AbortController()
  request = controller
  const isBoard = ['overview', 'reservations'].includes(view)
  try {
    const result = await api((isBoard ? 'board' : 'content') + '?' + new URLSearchParams({ date, view: kitchen ? 'kitchen' : view }), { signal: controller.signal })
    if (controller.signal.aborted) return
    if (!isBoard) {
      edit = result
      renderContent()
      return
    }
    if (quiet && (document.activeElement?.matches('.board-filters input, .board-filters select') || dialog.open)) return
    if (quiet && JSON.stringify(result.reservations) === JSON.stringify(reservations) && JSON.stringify(result.service) === JSON.stringify(service)) return
    service = result.service
    reservations = result.reservations
    if (kitchen) renderKitchen({ panel, reservations, date, changeTicket, action })
    else renderBoard()
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

function renderBoard() {
  const activeRecords = reservations.filter(active)
  const pending = activeRecords.filter(r => r.status === 'pending').length
  const portions = reservations.filter(r => ['confirmed', 'seated'].includes(r.status)).flatMap(r => r.items)
    .reduce((total, item) => total + item.quantity, 0)
  const stats = node('div', { className: 'stats' },
    stat(activeRecords.reduce((n, r) => n + r.party, 0), 'Gostje v servisu'),
    stat(activeRecords.length, 'Rezervirane mize'), stat(pending, 'Čakajo na potrditev'), stat(portions, 'Naročene porcije'))
  const isOverview = view === 'overview'
  const list = node('div', { className: 'tickets' })
  function updateList() {
    const query = searchTerm.trim().toLocaleLowerCase('sl')
    const records = isOverview ? activeRecords : reservations.filter(record =>
      (statusFilter === 'all' || record.status === statusFilter) && (!query ||
      [record.name, record.reference, record.table, record.phone].some(value => String(value || '').toLocaleLowerCase('sl').includes(query))))
    list.replaceChildren(...(records.length ? records.map(reservationRow) : [
      node('div', { className: 'empty-board' },
        node('h3', {}, reservations.length && !isOverview ? 'Ni zadetkov' : 'Ni napovedanih miz'),
        para(reservations.length && !isOverview ? 'Spremenite iskalni niz ali status.' : 'Telefonsko rezervacijo lahko vpišete za izbrani dan.'))
    ]))
  }
  const create = btn('+ Vpiši rezervacijo', openDeskBooking, 'button primary small')
  const listHead = node('div', { className: 'board-tools' }, node('div', {},
    node('h2', {}, isOverview ? 'Prihodi' : 'Seznam miz'), para(dateLabel(date))), create)
  const filters = node('div', { className: 'board-filters' },
    input(searchTerm, { type: 'search', placeholder: 'Ime, telefon, miza ali številka', 'aria-label': 'Poišči rezervacijo',
      oninput: event => { searchTerm = event.currentTarget.value; updateList() } }),
    select(statusFilter, { all: 'Vsi statusi', ...statusNames }, value => { statusFilter = value; updateList() }, 'Filtriraj status'))
  updateList()
  const reservationList = node('section', { className: 'service-list' }, listHead, isOverview ? null : filters, list,
    isOverview ? btn('Vse rezervacije →', () => go('reservations'), 'plain list-link') : null)
  if (!isOverview) return panel.replaceChildren(reservationList)
  const menu = node('div', { className: 'menu-status' }, node('span', { className: 'service-label' }, 'Izbrani dan'),
    node('h2', {}, 'Dnevni meni'), para(service.published ? 'Objavljeno · ' + service.dishes + ' jedi' : service.dishes ? 'Osnutek · ' + service.dishes + ' jedi' : 'Za ta dan še ni objavljen.'),
    btn('Uredi meni →', () => go('daily'), 'button secondary small'))
  const channels = node('div', { className: 'channel-status' }, node('h3', {}, 'Sprejem rezervacij'),
    para(service.bookingOpen ? 'Spletne rezervacije so odprte.' : 'Rezervacije sprejemate po telefonu.'),
    btn('Nastavitve rezervacij →', () => go('settings'), 'plain'))
  const queue = service.pendingCount ? node('div', { className: 'channel-status pending-queue' },
    node('h3', {}, 'Čakajo na potrditev (' + service.pendingCount + ')'),
    ...service.pending.map(record => btn(record.name + ' · ' + dateLabel(record.date) + ' ob ' + record.time,
      () => go('reservations', record.date, record.reference), 'plain queue-entry'))) : null
  const actions = node('aside', { className: 'service-aside' }, queue, menu, channels)
  panel.replaceChildren(stats, node('div', { className: 'overview-grid' }, reservationList, actions))
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

async function upload(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Izberite JPEG, PNG ali WebP.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1500 / Math.max(bitmap.width, bitmap.height))
  const canvas = node('canvas', { width: Math.max(1, Math.round(bitmap.width * scale)), height: Math.max(1, Math.round(bitmap.height * scale)) })
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const data = canvas.toDataURL('image/webp', .88).split(',')[1]
  return (await api('media', { method: 'POST', body: { mime: 'image/webp', data } })).url
}

function uploadControl(title, update) {
  const file = node('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', onchange: async event => {
    const control = event.currentTarget
    if (!control.files[0]) return
    control.disabled = true
    const holder = control.closest('.upload')
    const text = $('span', holder)
    text.textContent = 'Nalagamo …'
    writes++
    try {
      const url = await upload(control.files[0])
      dirty = true
      update(url)
      say(notice, 'Slika je naložena. Shranite spremembe.', 'success')
    } catch (failure) {
      error(failure)
    } finally {
      control.disabled = false
      control.value = ''
      text.textContent = title
      writes--
    }
  } })
  return node('label', { className: 'upload' }, node('span', {}, title), file)
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

async function save(input, message) {
  if (writes > 1) throw new Error('Počakajte, da se nalaganje konča.')
  await api('content', { method: 'PUT', body: input })
  if ('BroadcastChannel' in window) {
    const updates = new BroadcastChannel('kosta-menu')
    updates.postMessage('published')
    updates.close()
  }
  dirty = false
  await load()
  say(notice, message, 'success')
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
  const previousDate = daily && edit.dailyDates.filter(day => day < date).at(-1)
  if (previousDate && !items.length) {
    controls.append(btn('Kopiraj meni · ' + dateLabel(previousDate), event => action(event, async () => {
      const current = edit
      const source = await api('content?date=' + previousDate)
      if (current !== edit || items.length || view !== 'daily') return
      items.push(...structuredClone(source.daily?.items || []))
      dirty = true
      renderContent()
    })))
  }
  const write = (event, publish = false) => {
    if (!form.reportValidity()) return
    action(event, () => save({ section: view, date, published: publish, items },
      daily ? (publish ? 'Dnevni meni je objavljen.' : 'Osnutek je shranjen.') : 'Stalna ponudba je posodobljena.'))
  }
  const dates = daily ? edit.dailyDates.filter(day => day !== date).slice(-8).reverse() : []
  form.append(controls, ...(dates.length ? [node('details', { className: 'menu-history' }, node('summary', {}, 'Prejšnji meniji'), ...dates.map(day =>
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
  const galleryForm = node('form', { onsubmit: event => event.preventDefault() })
  const grid = node('div', { className: 'photo-grid' })
  galleryForm.append(node('div', { className: 'editor-top' }, node('div', {}, node('h2', {}, 'Galerija'), para('Fotografije in njihov vrstni red na spletni strani.')),
    uploadControl('+ Dodaj fotografijo', url => {
      if (gallery.length >= 40) return say(notice, 'Galerija lahko vsebuje največ 40 slik.', 'error')
      gallery.push({ src: url, alt: '' })
      renderContent()
      $$('.photo-edit input[type=text]', panel).at(-1)?.focus()
    })))
  function movePhoto(index, direction) {
    const target = index + direction
    const [photo] = gallery.splice(index, 1)
    gallery.splice(target, 0, photo)
    dirty = true
    renderContent()
    $$('.photo-edit input[type=text]', panel)[target]?.focus({ preventScroll: true })
  }
  for (const [index, photo] of gallery.entries()) {
    grid.append(node('article', { className: 'photo-edit' },
      node('img', { src: mediaPath(photo.src) ? photo.src : undefined, alt: photo.alt || '', loading: 'lazy' }),
      node('div', { className: 'photo-controls' },
        label('Opis fotografije', bind(photo, 'alt', { type: 'text', required: true, maxLength: 100 })),
        uploadControl('Zamenjaj fotografijo', url => { photo.src = url; renderContent() }),
        node('div', { className: 'photo-actions' },
          node('button', { type: 'button', disabled: index === 0, 'aria-label': 'Premakni fotografijo prej', onclick: () => movePhoto(index, -1) }, '←'),
          node('button', { type: 'button', disabled: index === gallery.length - 1, 'aria-label': 'Premakni fotografijo pozneje', onclick: () => movePhoto(index, 1) }, '→'),
          btn('Odstrani', () => { gallery.splice(index, 1); dirty = true; renderContent() }, 'remove')))))
  }
  galleryForm.append(grid)
  const settings = edit.settings
  const photos = [['hero', 'Uvodna fotografija'], ['storyPhoto', 'Fotografija pri zgodbi'], ['terracePhoto', 'Fotografija pri obisku']]
  galleryForm.append(node('fieldset', { className: 'settings-group' },
    node('legend', {}, 'Naslovne fotografije'), node('div', { className: 'fields' }, ...photos.map(([key, title]) =>
      node('div', {}, node('strong', {}, title), photoField(settings[key], url => { settings[key] = url }))))),
  node('div', { className: 'editor-actions' }, btn('Shrani fotografije', event => {
    if (!galleryForm.reportValidity()) return
    const coverPhotos = Object.fromEntries(photos.map(([key]) => [key, settings[key]]))
    action(event, () => save({ section: 'media', gallery, photos: coverPhotos }, 'Fotografije so posodobljene.'))
  }, 'button primary')))
  galleryForm.insertBefore(galleryForm.querySelector('.editor-actions'), grid)
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
for (const button of $$('[data-view]')) button.addEventListener('click', () => {
  if (view !== button.dataset.view) go(button.dataset.view)
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
  if (role && !$('#workspace').hidden && ['overview', 'reservations'].includes(view) && !document.hidden && !dialog.open && !writes) load({ quiet: true })
}, 10_000)
boot()
