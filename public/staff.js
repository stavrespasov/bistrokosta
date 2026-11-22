import { $, $$, api, dateLabel, dateToday, mediaPath, node, price, say } from './ui.js'

const kitchen = location.pathname === '/kitchen'
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
const nextPrep = { queued: ['preparing', 'Začni pripravo'], preparing: ['ready', 'Označi pripravljeno'], ready: ['served', 'Označi postreženo'] }
const emailNames = { waiting: 'Čaka', sending: 'Pošiljanje', sent: 'Poslano', failed: 'Pošiljanje ni uspelo', unconfigured: 'Ni nastavljeno', preview: 'Predogled' }
const titles = { reservations: 'Rezervacije.', daily: 'Dnevni meni.', regular: 'Stalna ponudba.', media: 'Fotografije.', settings: 'Nastavitve.' }
let view = 'reservations'
let statusFilter = 'all'
let reservations = []
let request
let role
let dirty = false
let edit
let writes = 0
let date = dateToday()
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

function go(next, nextDate = date) {
  if (dirty && !confirm('Neshranjene spremembe bodo izgubljene. Želite nadaljevati?')) {
    dateInput.value = date
    return
  }
  dirty = false
  edit = null
  view = next
  date = nextDate
  dateInput.value = date
  say(notice, '')
  for (const button of $$('[data-view]')) button.setAttribute('aria-pressed', button.dataset.view === view)
  $('#staff-title').textContent = kitchen ? 'Servis.' : titles[view]
  $('#date-control').hidden = !['reservations', 'daily'].includes(view)
  $('#today').hidden = $('#date-control').hidden
  panel.replaceChildren(para('Nalagamo …', 'empty'))
  load()
}

async function load({ quiet = false } = {}) {
  request?.abort()
  const controller = new AbortController()
  request = controller
  const isBoard = view === 'reservations'
  try {
    const result = await api((isBoard ? 'board' : 'content') + '?' + new URLSearchParams({ date, view: kitchen ? 'kitchen' : view }), { signal: controller.signal })
    if (controller.signal.aborted) return
    if (!isBoard) {
      edit = result
      renderContent()
      return
    }
    if (quiet && JSON.stringify(result.reservations) === JSON.stringify(reservations)) return
    reservations = result.reservations
    if (kitchen) renderKitchen()
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

function renderBoard() {
  const records = statusFilter === 'all' ? reservations : reservations.filter(r => r.status === statusFilter)
  const stats = node('div', { className: 'stats' },
    stat(reservations.filter(active).length, 'Aktivne rezervacije'),
    stat(reservations.filter(active).reduce((count, r) => count + r.party, 0), 'Pričakovani gostje'),
    stat(reservations.filter(r => r.status === 'pending').length, 'Čakajo na potrditev'),
    stat(reservations.filter(r => ['confirmed', 'seated'].includes(r.status)).flatMap(r => r.items).reduce((count, item) => count + item.quantity, 0), 'Potrjene porcije'))
  const tools = node('div', { className: 'board-tools' },
    node('strong', {}, dateLabel(date)),
    select(statusFilter, { all: 'Vsi statusi', ...statusNames }, value => { statusFilter = value; renderBoard() }, 'Filtriraj status'))
  const tickets = node('div', { className: 'tickets' }, ...records.map(record => {
    const quick = record.status === 'pending' ? ['Potrdi', 'confirmed']
      : record.status === 'confirmed' ? ['Gostje so prišli', 'seated']
      : record.status === 'seated' ? ['Zaključi', 'completed'] : null
    return node('article', { className: 'ticket' },
      node('time', { className: 'ticket-time', dateTime: record.time }, record.time),
      node('div', { className: 'ticket-middle' }, node('span', { className: 'ticket-name' }, record.name),
        node('div', { className: 'ticket-meta' }, String(record.party) + ' oseb · ' + record.reference + (record.table ? ' · Miza ' + record.table : ''), pill(record.status, statusNames)),
        record.items.length ? para(record.items.map(item => item.quantity + ' × ' + item.name).join(' · '), 'ticket-items') : null),
      node('div', { className: 'ticket-actions' }, btn('Odpri', () => openTicket(record)), quick ? btn(quick[0], event =>
        action(event, () => changeTicket(record.id, { status: quick[1] }), 'Status je posodobljen.'), 'button primary small') : null))
  }))
  panel.replaceChildren(stats, tools, records.length ? tickets : para('Za izbrani datum in status ni rezervacij.', 'empty'))
}

function openTicket(record) {
  $('#ticket-title').textContent = 'Miza · ' + record.time
  const editor = node('form', { className: 'fields' })
  const fields = {}
  const contactFields = [
    ['name', 'Ime in priimek', 'text', 90], ['email', 'E-pošta', 'email', 180], ['phone', 'Telefon', 'tel', 32],
    ['date', 'Datum', 'date'], ['time', 'Ura', 'time'], ['party', 'Gostje', 'number']
  ].map(([key, title, type, maxLength]) => {
    const control = input(String(record[key]), { type, required: true, maxLength })
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
      record.status === 'confirmed' && !['sent', 'preview'].includes(record.emailStatus)
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

function renderKitchen() {
  const waiting = reservations.filter(r => r.kitchenStatus !== 'served' && r.status !== 'completed')
  const totals = new Map()
  for (const record of waiting.filter(r => ['queued', 'preparing'].includes(r.kitchenStatus))) {
    for (const item of record.items) totals.set(item.name, (totals.get(item.name) || 0) + item.quantity)
  }
  const byTime = new Map()
  for (const ticket of waiting.filter(r => ['queued', 'preparing'].includes(r.kitchenStatus))) {
    const dishes = byTime.get(ticket.time) || new Map()
    for (const item of ticket.items) dishes.set(item.name, (dishes.get(item.name) || 0) + item.quantity)
    if (dishes.size) byTime.set(ticket.time, dishes)
  }
  const schedule = node('section', { className: 'prep-plan' }, node('h2', {}, 'Porcije po urah'),
    ...[...byTime].map(([time, dishes]) => node('div', { className: 'prep-slot' },
      node('time', {}, time), node('ul', {}, ...[...dishes].map(([name, quantity]) =>
        node('li', {}, node('b', {}, quantity + ' × '), name))))))
  const stats = node('div', { className: 'stats' },
    stat(waiting[0]?.time ?? '—', 'Naslednja miza'), stat(waiting.reduce((n, r) => n + r.party, 0), 'Gosti v servisu'),
    stat([...totals.values()].reduce((n, count) => n + count, 0), 'Porcije za pripravo'),
    stat(waiting.filter(r => r.kitchenStatus === 'ready').length, 'Mize pripravljene'))
  const content = node('div', { className: 'kitchen-board' }, ...reservations.map(record => {
    const next = nextPrep[record.kitchenStatus]
    return node('article', { className: 'kitchen-card', 'data-state': record.kitchenStatus },
      node('div', { className: 'kitchen-top' }, node('time', { dateTime: record.time }, record.time),
        node('div', {}, node('strong', {}, record.party + ' oseb' + (record.table ? ' · Miza ' + record.table : '')), node('div', { className: 'kitchen-ref' }, record.reference))),
      node('div', {}, pill(record.kitchenStatus, prep)),
      record.items.length ? node('ul', {}, ...record.items.map(item => node('li', {},
        node('strong', {}, item.quantity + '×'), node('span', {}, item.name,
          item.allergens ? node('span', { className: 'subtle' }, 'Alergeni: ' + item.allergens) : null)))) : para('Naročilo ob prihodu.'),
      record.guestNote ? para('Opomba gosta · ' + record.guestNote, 'kitchen-note') : null,
      record.staffNotes ? para(record.staffNotes, 'kitchen-note') : null,
      next && record.status !== 'completed' ? btn(next[1], event =>
        action(event, () => changeTicket(record.id, { kitchenStatus: next[0] }), 'Priprava je posodobljena.'),
      record.kitchenStatus === 'queued' ? 'button secondary' : 'button primary') : null)
  }))
  panel.replaceChildren(stats, node('div', { className: 'board-tools' }, node('strong', {}, dateLabel(date)), para('Samodejno osveževanje')),
    ...(byTime.size ? [schedule] : []),
    reservations.length ? content : para('Za izbrani datum ni potrjenih rezervacij.', 'empty'))
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
  form.append(controls, ...(dates.length ? [node('div', { className: 'kitchen-compact' }, ...dates.map(day =>
    btn(dateLabel(day), () => go('daily', day), 'button secondary small')))] : []),
    ...items.map((item, index) => editDish(item, () => {
      items.splice(index, 1)
      dirty = true
      renderContent()
    })),
    node('div', { className: 'editor-actions' }, add, daily ? btn(published ? 'Umik v osnutek' : 'Shrani osnutek', event => write(event)) : null,
      btn(daily ? (published ? 'Posodobi objavo' : 'Objavi meni') : 'Shrani spremembe', event => write(event, true), 'button primary')))
  return form
}

function mediaEditor() {
  const gallery = edit.gallery
  const galleryForm = node('form', { onsubmit: event => event.preventDefault() })
  galleryForm.append(node('div', { className: 'editor-top' }, node('h2', {}, 'Galerija'),
    uploadControl('+ Dodaj fotografijo', url => {
      if (gallery.length >= 40) return say(notice, 'Galerija lahko vsebuje največ 40 slik.', 'error')
      gallery.push({ src: url, alt: '' })
      renderContent()
      $$('.photo-edit input', panel).at(-1)?.focus()
    })))
  for (const [index, photo] of gallery.entries()) {
    galleryForm.append(node('div', { className: 'photo-edit' }, node('img', { src: mediaPath(photo.src) ? photo.src : undefined, alt: '' }),
      label('Opis fotografije', bind(photo, 'alt', { required: true, maxLength: 100 })),
      node('div', {}, btn('↑', () => {
        if (index < 1) return
        gallery.splice(index - 1, 2, gallery[index], gallery[index - 1])
        dirty = true
        renderContent()
      }, 'remove'), btn('Odstrani', () => { gallery.splice(index, 1); dirty = true; renderContent() }, 'remove'))))
  }
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
  return node('div', { className: 'editor' }, galleryForm)
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
      para(edit.preview ? 'Predogled: e-pošta se ne pošilja.' : edit.emailConfigured ? 'Potrditvena e-pošta je nastavljena.' : 'Pred vklopom rezervacij nastavite potrditveno e-pošto.'),
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
    $('#logout').hidden = !role
    $('#owner-link').hidden = role !== 'owner' || !kitchen
    $('#kitchen-link').hidden = role !== 'owner' || kitchen
    $('#owner-nav').hidden = kitchen || role !== 'owner'
    $('#signin-title').textContent = kitchen ? 'Kuhinja.' : 'Upravljanje.'
    say($('#preview-login'), session.preview ? 'Lokalni predogled · geslo: kosta-' + roleNeeded + '-demo' : '')
    if (!allowed) return
    document.body.classList.toggle('kitchen', kitchen)
    if (kitchen) $('#staff-eyebrow').textContent = 'KUHINJA · KÓŠTA'
    go('reservations')
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
  if (role && !$('#workspace').hidden && view === 'reservations' && !document.hidden && !dialog.open && !writes) load({ quiet: true })
}, 10_000)
boot()
