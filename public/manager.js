import { dateLabel, node, price } from './ui.js'

const smallDate = new Intl.DateTimeFormat('sl-SI', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' })
const weekday = new Intl.DateTimeFormat('sl-SI', { weekday: 'long', timeZone: 'UTC' })
const shortDay = day => smallDate.format(new Date(day))
const addDays = (date, offset) => new Date(Date.parse(date) + offset * 86400000).toISOString().slice(0, 10)
const confirmedCovers = day => day.visits.confirmed + day.visits.seated + day.visits.completed
const arrivedCovers = day => day.visits.seated + day.visits.completed
const bookedTables = day => day.groups.confirmed + day.groups.seated + day.groups.completed
const count = (days, read) => days.reduce((total, day) => total + read(day), 0)

const caption = value => node('p', { className: 'subtle' }, value)
const button = (value, onclick, name = 'button secondary small') => node('button', { type: 'button', className: name, onclick }, value)
const chip = (value, state = '') => node('span', { className: 'manager-chip', 'data-tone': state }, value)
const metric = (title, value, note) => node('div', { className: 'manager-metric' },
  node('dt', {}, title), node('dd', {}, node('strong', {}, String(value)), node('span', {}, note)))
const metrics = (...items) => node('dl', { className: 'manager-metrics' }, ...items)
const section = (title, description, action) => node('div', { className: 'manager-card-heading' },
  node('div', {}, node('h2', {}, title), description ? caption(description) : null), action)
const bar = (value, limit, description, tone = '') => node('progress', {
  max: Math.max(1, limit), value, 'aria-label': description, 'data-tone': tone
})
const menuState = menu => menu.published ? chip('Meni objavljen', 'good')
  : menu.dishes ? chip('Meni v osnutku', 'wait') : chip('Brez menija')
const periodText = days => dateLabel(days[0].date) + ' – ' + dateLabel(days.at(-1).date)

export function serviceOverview({ date, today, time, service, reservations, row, navigate, create, kitchenHref }) {
  const { day, seats, pending, pendingCount } = service
  const planned = reservations.filter(record => ['confirmed', 'pending', 'seated'].includes(record.status))
  const nextArrival = date >= today && planned.find(record => record.status === 'confirmed' && (date !== today || record.time >= time))
  const openHours = day.hours.map(period => period.join('–')).join(' · ')
  const queue = pendingCount ? node('ul', { className: 'manager-queue' }, ...pending.map(record => node('li', {},
    button(node('span', {}, node('strong', {}, record.name), node('small', {}, shortDay(record.date) + ' · ' + record.time + ' · ' + record.party + ' oseb')),
      () => navigate('reservations', record.date, record.reference), 'manager-queue-link')))) : caption('Vse prejete zahteve so pregledane.')
  const kitchenAction = node('a', { className: 'button secondary small', href: kitchenHref }, 'Odpri kuhinjo ↗')
  return node('div', { className: 'manager-dashboard' },
    node('div', { className: 'manager-service' },
      node('div', {}, node('p', { className: 'eyebrow' }, weekday.format(new Date(date)) + (date === today ? ' · danes' : '')),
        node('h2', {}, dateLabel(date)), caption(openHours ? 'Odpiralni čas · ' + openHours : 'Bistro je ta dan zaprt.')),
      node('div', { className: 'manager-service-next' },
        node('span', {}, 'Naslednji potrjeni prihod'),
        node('strong', {}, nextArrival ? nextArrival.time + ' · ' + nextArrival.party + ' oseb' : '—'),
        button('+ Vpiši rezervacijo', create, 'button primary small'))),
    metrics(
      metric('Potrjeni gostje', confirmedCovers(day), bookedTables(day) + ' potrjenih ali obiskanih miz'),
      metric('Čakajo na potrditev', day.groups.pending, day.visits.pending + ' gostov za izbrani dan'),
      metric('Največ hkrati', day.peak.covers + '/' + seats, day.peak.at ? 'Zasedeni sedeži ob ' + day.peak.at + ' · s čakajočimi' : 'Še ni zasedenih sedežev'),
      metric('Prednaročene porcije', day.portions, 'Vrednost prednaročil · ' + price(day.preorderCents))),
    node('div', { className: 'manager-grid' },
      node('section', { className: 'manager-card manager-attention' },
        section('Za urediti', 'Nepotrjene zahteve od danes naprej', chip(String(pendingCount), pendingCount ? 'wait' : 'good')),
        queue, pendingCount > pending.length ? button('Več zahtev v planerju →', () => navigate('planner', today), 'plain') : null,
        node('div', { className: 'manager-checklist' },
          node('div', {}, node('strong', {}, 'Dnevni meni'), menuState(day.menu),
            button('Uredi meni →', () => navigate('daily'), 'plain')),
          node('div', {}, node('strong', {}, 'Spletne rezervacije'),
            caption(service.bookingOpen ? (service.confirmationChannel === 'phone' ? 'Odprte · potrditev po telefonu' : 'Odprte · potrditev po e-pošti') : 'Zaprte · rezervacije po telefonu'),
            button('Nastavitve rezervacij →', () => navigate('settings'), 'plain')))),
      node('section', { className: 'manager-card manager-arrivals' },
        section('Prihodi', 'Odprte in potrjene mize za izbrani dan', button('Vse rezervacije →', () => navigate('reservations'), 'plain')),
        node('div', { className: 'tickets' }, ...(planned.length ? planned.map(row) : [
          node('div', { className: 'empty-board' }, node('h3', {}, 'Ni napovedanih miz'),
            caption('Telefonsko rezervacijo lahko vpišete za izbrani dan.'))
        ]))),
      node('section', { className: 'manager-card manager-kitchen' },
        section('Priprava v kuhinji', 'Porcije za potrjene goste pri odprtih mizah', kitchenAction),
        node('dl', { className: 'manager-prep' }, ...[
          ['queued', 'Za pripravo'], ['preparing', 'V pripravi'], ['ready', 'Pripravljeno'], ['served', 'Postreženo']
        ].map(([key, title]) => node('div', {}, node('dt', {}, title), node('dd', {}, String(day.prep[key]))))),
        day.prepItems.length ? node('ul', { className: 'manager-dish-list' }, ...day.prepItems.map(item =>
          node('li', {}, node('strong', {}, item.quantity + ' ×'), node('span', {}, item.name))))
          : caption('Kuhinja trenutno nima porcij za pripravo.'))))
}

function rangeOptions(days, change) {
  const selector = node('select', { 'aria-label': 'Dolžina obdobja', onchange: event => change(Number(event.currentTarget.value)) },
    ...[7, 14, 30].map(value => node('option', { value }, value + ' dni')))
  selector.value = String(days)
  return selector
}

function periodHeader({ report, days, changeRange, changeDate, extra }) {
  const length = days.length
  const anchor = report ? days.at(-1).date : days[0].date
  return node('div', { className: 'manager-period' },
    node('div', {}, node('h2', {}, report ? 'Rezervacije v obdobju' : 'Prihajajoči servis'), caption(periodText(days))),
    node('div', { className: 'manager-period-actions' },
      node('div', { className: 'manager-period-arrows' },
        node('button', { type: 'button', className: 'button secondary small', 'aria-label': 'Prejšnje obdobje', onclick: () => changeDate(addDays(anchor, -length)) }, '←'),
        node('button', { type: 'button', className: 'button secondary small', 'aria-label': 'Naslednje obdobje', onclick: () => changeDate(addDays(anchor, length)) }, '→')),
      rangeOptions(length, changeRange), extra))
}

export function planner({ snapshot, changeRange, changeDate, navigate }) {
  const { days, seats, today } = snapshot
  const upcoming = count(days, confirmedCovers)
  const waiting = count(days, day => day.groups.pending)
  const openMenus = days.filter(day => day.hours.length && !day.menu.published).length
  return node('div', { className: 'manager-dashboard' },
    periodHeader({ days, changeRange, changeDate }),
    metrics(metric('Potrjeni gostje', upcoming, 'V prikazanem obdobju'),
      metric('Čakajo na potrditev', waiting, 'Zahteve v prikazanem obdobju'),
      metric('Dnevi brez objave menija', openMenus, 'Med dnevi, ko je bistro odprt')),
    node('section', { className: 'manager-card manager-plan' },
      section('Rezervacije po dnevih', 'Vrh prikazuje največje sočasno število sedežev, vključno s čakajočimi zahtevami. Omejitev je ' + seats + ' sedežev.'),
      node('ul', { className: 'manager-plan-list' }, ...days.map(day => node('li', { 'data-today': String(day.date === today) },
        node('div', { className: 'manager-plan-date' },
          node('time', { dateTime: day.date }, shortDay(day.date)),
          caption(day.hours.length ? day.hours.map(period => period.join('–')).join(' · ') : 'Zaprto')),
        node('div', { className: 'manager-plan-covers' }, node('strong', {}, confirmedCovers(day) + ' potrjenih gostov'),
          day.groups.pending ? button(day.groups.pending + ' za potrditev →',
            () => navigate('reservations', day.date, '', 'pending'), 'plain') : null),
        node('div', { className: 'manager-plan-load' },
          bar(day.peak.covers, Math.max(seats, day.peak.covers), 'Vrh zasedenosti · ' + shortDay(day.date), day.peak.covers >= seats ? 'wait' : ''),
          caption(day.peak.covers + '/' + seats + ' sedežev' + (day.peak.at ? ' ob ' + day.peak.at : ''))),
        node('div', { className: 'manager-plan-actions' }, menuState(day.menu),
          button('Dnevni pregled →', () => navigate('overview', day.date), 'plain')))))))
}

function downloadReport(days) {
  const header = ['Datum', 'Potrjene mize', 'Potrjeni gostje', 'Gostje pri mizi ali postreženi', 'Neprihodi (mize)', 'Preklici (mize)', 'Spletne rezervacije', 'Ročni vpisi', 'Drugo', 'Prednaročene porcije', 'Vrednost prednaročil (EUR)']
  const rows = days.map(day => [day.date, bookedTables(day), confirmedCovers(day), arrivedCovers(day), day.groups['no-show'],
    day.groups.cancelled, day.channels.web, day.channels.desk, day.channels.unknown, day.portions,
    (day.preorderCents / 100).toFixed(2).replace('.', ',')])
  const csv = '\ufeff' + [header, ...rows].map(row => row.join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = node('a', { href: url, download: 'kosta-rezervacije-' + days[0].date + '--' + days.at(-1).date + '.csv' })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function reports({ snapshot, changeRange, changeDate, navigate }) {
  const { days } = snapshot
  const guests = count(days, confirmedCovers)
  const arrived = count(days, arrivedCovers)
  const noShow = count(days, day => day.groups['no-show'])
  const closed = noShow + count(days, day => day.groups.seated + day.groups.completed)
  const rate = closed ? new Intl.NumberFormat('sl-SI', { style: 'percent', maximumFractionDigits: 0 }).format(noShow / closed) : '—'
  const portions = count(days, day => day.portions)
  const total = count(days, day => day.preorderCents)
  const maximum = Math.max(1, ...days.map(confirmedCovers))
  return node('div', { className: 'manager-dashboard' },
    periodHeader({ report: true, days, changeRange, changeDate, extra: button('Izvozi CSV ↓', () => downloadReport(days), 'button primary small') }),
    metrics(metric('Potrjeni gostje', guests, count(days, bookedTables) + ' potrjenih ali obiskanih miz'),
      metric('Obiskali bistro', arrived, 'Gostje pri mizi ali v zaključenih rezervacijah'),
      metric('Delež neprihodov', rate, noShow + ' neprihodov od ' + closed + ' zabeleženih prihodov in neprihodov'),
      metric('Vrednost prednaročil', price(total), portions + ' porcij · brez prodaje na lokaciji')),
    node('div', { className: 'manager-report-grid' },
      node('section', { className: 'manager-card' },
        section('Gostje po dnevih', 'Potrjeni gostje in zabeleženi prihodi.'),
        node('div', { className: 'manager-key' }, chip('Potrjeni'), chip('Prišli', 'good')),
        node('ul', { className: 'manager-series' }, ...days.map(day => node('li', {},
          button(shortDay(day.date), () => navigate('reservations', day.date), 'plain'),
          node('div', { className: 'manager-series-bars' },
            bar(confirmedCovers(day), maximum, 'Potrjeni · ' + shortDay(day.date)),
            bar(arrivedCovers(day), maximum, 'Prišli · ' + shortDay(day.date), 'good')),
          node('span', { className: 'manager-series-count' }, confirmedCovers(day) + ' / ' + arrivedCovers(day)))))),
      node('section', { className: 'manager-card' },
        section('Vir rezervacij', 'Vse rezervacije v obdobju, tudi preklicane.'),
        node('dl', { className: 'manager-sources' }, ...[
          ['web', 'Prek spleta'], ['desk', 'Ročni vpis'], ['unknown', 'Vir ni zabeležen']
        ].map(([key, title]) => node('div', {}, node('dt', {}, title), node('dd', {}, String(count(days, day => day.channels[key])))))),
        caption('Preklicane mize · ' + count(days, day => day.groups.cancelled)))))
}
