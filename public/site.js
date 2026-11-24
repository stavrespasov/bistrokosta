import { $, $$, api, dateLabel, mediaPath, node, price, hostedReview } from './ui.js'

import { paintGallery } from './gallery.js'
import { imageAttributes, mediaBySource, originalTerrace, terraceVisualization } from './media-catalog.js'

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const text = (selector, value) => { $(selector).textContent = value }
let site
let menuTab = 'daily'

function paintMenu() {
  if (!site) return
  const example = menuTab === 'daily' && !site.menu.daily.length && site.example.length > 0
  const items = example ? site.example : site.menu[menuTab]
  text('#menu-date', menuTab === 'regular' ? 'Stalna ponudba' : example ? 'Primer · 15. april' : dateLabel(site.today))
  $('#menu-items').replaceChildren(
    example ? node('p', { className: 'menu-note' }, 'Današnji meni še ni objavljen. Spodaj je primer z dne 15. aprila.') : '',
    items.length ? node('ul', { className: 'menu-list' }, ...items.map(item => node('li', { className: 'menu-row' },
      node('div', {},
        mediaPath(item.photo) ? node('img', { className: 'dish-thumbnail', src: item.photo, alt: '', loading: 'lazy' }) : null,
        node('h3', {}, item.name),
        item.description ? node('p', { className: 'subtle' }, item.description) : null,
        item.allergens ? node('p', { className: 'subtle' }, 'Alergeni · ' + item.allergens) : null),
      node('p', { className: 'menu-price' }, price(item.price)))))
      : node('p', { className: 'empty' }, 'Za ponudbo nas pokličite.'))
}

function formatHours(periods) {
  return periods.map(pair => pair.join('–').replaceAll(':', '.')).join(' · ') || 'Zaprto'
}

function paintHours(hours) {
  const days = ['Ned', 'Pon', 'Tor', 'Sre', 'Čet', 'Pet', 'Sob']
  const groups = []
  for (const index of [1, 2, 3, 4, 5, 6, 0]) {
    const value = formatHours(hours[index])
    if (groups.at(-1)?.value === value) groups.at(-1).last = days[index]
    else groups.push({ first: days[index], value })
  }
  $('#hours').replaceChildren(...groups.map(group => node('div', {},
    node('dt', {}, group.last ? group.first + '–' + group.last.toLowerCase() : group.first), node('dd', {}, group.value))))
}

function applySite(next) {
  const previous = site
  site = next
  if (!previous || previous.today !== next.today || JSON.stringify(previous.menu) !== JSON.stringify(next.menu)) paintMenu()
  for (const [selector, field] of [
    ['#intro', 'intro'], ['#delivery', 'delivery'], ['#story-text', 'story'], ['#terrace-text', 'terrace'],
    ['#address', 'address'], ['#strip-address', 'address']
  ]) {
    if (next.settings[field] !== previous?.settings[field]) text(selector, next.settings[field])
  }
  const terracePath = hostedReview && next.settings.terracePhoto === originalTerrace.src
    ? terraceVisualization.src : next.settings.terracePhoto
  $('#obisk').classList.toggle('visit-wide', terracePath === terraceVisualization.src)
  for (const [selector, path, sizes] of [
    ['#hero-image', next.settings.hero, '(max-width: 700px) 100vw, 53vw'],
    ['#story-image', next.settings.storyPhoto, '(max-width: 700px) 100vw, 52vw'],
    ['#terrace-image', terracePath, '100vw']
  ]) {
    const image = $(selector)
    if (!mediaPath(path) || image.getAttribute('src') === path) continue
    const asset = mediaBySource.get(path)
    if (asset) Object.assign(image, imageAttributes(asset, sizes))
    else {
      image.removeAttribute('srcset')
      image.removeAttribute('sizes')
      image.alt = next.gallery.find(photo => photo.src === path)?.alt || 'Fotografija Bistra Kóšta'
    }
    image.src = path
  }
  if (next.settings.phone !== previous?.settings.phone) {
    for (const link of $$('[data-phone]')) {
      link.textContent = next.settings.phone
      link.href = 'tel:' + next.settings.phone.replace(/[^\d+]/g, '').replace(/^0/, '+386')
    }
  }
  $('#directions').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(next.settings.address)
  const weekday = new Date(next.today + 'T12:00:00Z').getUTCDay()
  text('#strip-hours', formatHours(next.settings.hours[weekday]))
  if (JSON.stringify(previous?.settings.hours) !== JSON.stringify(next.settings.hours)) paintHours(next.settings.hours)
  if (JSON.stringify(previous?.gallery) !== JSON.stringify(next.gallery)) {
    paintGallery(next.gallery)
  }
  if (!previous && ['#galerija', '#obisk'].includes(location.hash)) {
    const target = $(location.hash)
    if (!target.hidden) target.scrollIntoView({ behavior: 'instant' })
  }
}

async function refresh() {
  try { applySite(await api('site')) }
  catch {
    if (!site) text('#menu-items .empty', 'Menija trenutno ni mogoče naložiti. Za ponudbo nas pokličite.')
  }
}

for (const tab of $$('[data-menu]')) tab.addEventListener('click', () => {
  if (menuTab === tab.dataset.menu) return
  menuTab = tab.dataset.menu
  for (const option of $$('[data-menu]')) option.setAttribute('aria-pressed', String(option === tab))
  paintMenu()
  if (!reducedMotion.matches) $('#menu-items').animate([{opacity:.35,transform:'translateY(5px)'},{opacity:1,transform:'none'}], {duration:210,easing:'ease-out'})
})
for (const link of $$('.mobile-nav a')) link.addEventListener('click', () => { $('.mobile-nav').open = false })
if (hostedReview) {
  for (const link of $$('[data-book]')) link.href = '/rezervacije?demo=1'
  for (const link of $$('[data-owner]')) link.href = '/admin?demo=1'
}
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.remove('awaiting')
      observer.unobserve(entry.target)
    }
  }, {threshold:.13})
  for (const target of $$('.reveal')) {
    target.classList.add('awaiting')
    observer.observe(target)
  }
}
if ('BroadcastChannel' in window) new BroadcastChannel('kosta-menu').addEventListener('message', refresh)
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh() })
setInterval(() => { if (!document.hidden) refresh() }, 15_000)
refresh()
