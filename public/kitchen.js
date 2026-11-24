import { dateLabel, node } from './ui.js'

const stages = {
  queued: { label: 'Za pripravo', action: 'Začni pripravo', next: 'preparing' },
  preparing: { label: 'V pripravi', action: 'Označi pripravljeno', next: 'ready' },
  ready: { label: 'Pripravljeno', action: 'Označi postreženo', next: 'served' },
  served: { label: 'Postreženo' }
}

function dishPlan(records) {
  const hours = new Map()
  let portions = 0
  for (const record of records) {
    if (record.kitchenStatus === 'ready' || !record.items.length) continue
    const dishes = hours.get(record.time) || new Map()
    hours.set(record.time, dishes)
    for (const item of record.items) {
      // Keep different allergen declarations visible even when dish names match.
      const key = JSON.stringify([item.name, item.allergens || ''])
      const portion = dishes.get(key) || { ...item, quantity: 0 }
      portion.quantity += item.quantity
      portions += item.quantity
      dishes.set(key, portion)
    }
  }
  return { hours, portions }
}

function dishList(items, className) {
  return node('ul', { className }, ...Array.from(items, item => node('li', {},
    node('span', { className: 'k-quantity' }, item.quantity + ' ×'),
    node('span', { className: 'k-dish' }, item.name, item.allergens
      ? node('small', {}, 'Alergeni: ' + item.allergens) : null))))
}

function ticket(record, advance) {
  const stage = stages[record.kitchenStatus] || stages.queued
  const complete = record.status === 'completed'
  const table = record.table ? 'Miza ' + record.table : 'Rezervacija ' + record.reference
  const next = stage.next && !complete ? node('button', {
    type: 'button', className: 'k-advance', 'data-ticket-action': record.id,
    onclick: event => advance(event, record.id, stage.next)
  }, stage.action) : null

  return node('article', {
    className: 'kitchen-card', 'data-state': record.kitchenStatus, 'aria-label': table + ' · ' + record.time
  },
  node('div', { className: 'k-ticket-head' },
    node('div', { className: 'k-table' }, node('time', { dateTime: record.time }, record.time),
      node('div', {}, node('h3', {}, table), node('p', {}, record.party + ' oseb' + (record.status === 'seated' ? ' · Pri mizi' : '')))),
    node('span', { className: 'k-state' }, complete ? 'Zaključeno' : stage.label)),
  record.items.length ? dishList(record.items, 'k-order') : node('p', { className: 'k-on-arrival' }, 'Naročilo ob prihodu.'),
  record.guestNote ? node('p', { className: 'k-note' }, node('strong', {}, 'Opomba gosta · '), record.guestNote) : null,
  record.staffNotes ? node('p', { className: 'k-note' }, node('strong', {}, 'Opomba ekipe · '), record.staffNotes) : null,
  node('div', { className: 'k-ticket-foot' },
    record.table ? node('small', { className: 'k-ref' }, record.reference) : null, next))
}

function metric(label, value) {
  return node('div', { className: 'k-metric' }, node('dt', {}, label), node('dd', {}, String(value)))
}

export function renderKitchen({ panel, reservations, date, changeTicket, action }) {
  const active = reservations.filter(record => record.kitchenStatus !== 'served' && record.status !== 'completed')
  const finished = reservations.filter(record => record.kitchenStatus === 'served' || record.status === 'completed')
  const { hours, portions } = dishPlan(active)
  const sameDay = panel.dataset.kitchenDate === date
  const selected = sameDay ? panel.querySelector('.k-filter')?.value || '' : ''
  const keepHistoryOpen = sameDay && panel.querySelector('.k-history')?.open
  const focused = document.activeElement
  const focus = focused?.dataset.ticketAction
  const previousView = sameDay ? panel.querySelector('.k-worklist')?.dataset.view : 'orders'
  panel.dataset.kitchenDate = date

  const advance = (event, id, next) => action(event,
    () => changeTicket(id, { kitchenStatus: next }), 'Priprava je posodobljena.')
  const tickets = node('div', { className: 'kitchen-board' })
  const filter = node('select', {
    className: 'k-filter', 'aria-label': 'Filtriraj mize po stanju priprave'
  }, node('option', { value: '' }, 'Vsa stanja'),
  ...['queued', 'preparing', 'ready'].map(key => node('option', { value: key }, stages[key].label)))
  const showTickets = () => {
    const records = active.filter(record => !filter.value || record.kitchenStatus === filter.value)
    tickets.replaceChildren(...(records.length ? records.map(record => ticket(record, advance)) : [
      node('p', { className: 'k-empty' }, 'V tem stanju trenutno ni miz.')
    ]))
  }
  filter.value = selected
  filter.addEventListener('change', showTickets)
  if (active.length) showTickets()
  else tickets.append(node('p', { className: 'k-empty' },
    finished.length ? 'Vse mize za ta dan so zaključene.' : 'Za izbrani datum ni potrjenih rezervacij.'))

  const history = finished.length ? node('details', { className: 'k-history', open: Boolean(keepHistoryOpen) },
    node('summary', {}, 'Zaključene mize (' + finished.length + ')'),
    ...finished.map(record => ticket(record, advance))) : null
  const schedule = node('section', { id: 'k-schedule', className: 'prep-plan', 'aria-labelledby': 'k-plan-title' },
    node('div', { className: 'k-section-heading' }, node('h2', { id: 'k-plan-title' }, 'Porcije po urah')),
    hours.size ? node('div', { className: 'k-schedule' }, ...Array.from(hours, ([time, dishes]) =>
      node('section', { className: 'prep-slot' }, node('h3', {}, node('time', { dateTime: time }, time)),
        dishList(dishes.values(), 'k-prep-items'))))
      : node('p', { className: 'k-empty' }, 'Ni prednaročenih porcij za pripravo.'))
  const orders = node('section', { id: 'k-orders', className: 'k-orders', 'aria-labelledby': 'k-orders-title' },
    node('div', { className: 'k-section-heading' }, node('h2', { id: 'k-orders-title' }, 'Naročila za mize'),
      active.length ? filter : null), tickets, history)

  const workspace = node('div', { className: 'k-worklist', 'data-view': previousView || 'orders' }, orders, schedule)
  const switcher = node('div', { className: 'k-switch', role: 'group', 'aria-label': 'Pogled kuhinje' })
  for (const [view, label] of [['orders', 'Mize'], ['schedule', 'Porcije po urah']]) {
    switcher.append(node('button', {
      type: 'button', 'data-pane': view, 'aria-controls': 'k-' + view, 'aria-pressed': workspace.dataset.view === view,
      onclick: () => {
        workspace.dataset.view = view
        for (const button of switcher.children) button.setAttribute('aria-pressed', String(button.dataset.pane === view))
      }
    }, label))
  }
  panel.replaceChildren(
    node('dl', { className: 'stats k-stats', 'aria-label': 'Servis · ' + dateLabel(date) },
      metric('Prva odprta miza', active[0]?.time || '—'),
      metric('Gostje v servisu', active.reduce((sum, record) => sum + record.party, 0)),
      metric('Porcije za pripravo', portions),
      metric('Pripravljene mize', active.filter(record => record.kitchenStatus === 'ready').length)),
    switcher, workspace)
  if (focused?.matches('.k-filter')) filter.focus({ preventScroll: true })
  if (focused?.dataset.pane) switcher.querySelector('[data-pane="' + focused.dataset.pane + '"]')?.focus({ preventScroll: true })
  if (focus) {
    const nextFocus = Array.from(panel.querySelectorAll('[data-ticket-action]')).find(el => el.dataset.ticketAction === focus)
    const target = nextFocus || panel.querySelector('.k-history summary') || panel.querySelector('.k-filter')
    target?.focus({ preventScroll: true })
  }
}
