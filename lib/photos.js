import { seed } from './seed.js'
import { editorialGallery, originalTerrace, storyPhoto } from '../public/media-catalog.js'

// Persisted bistro settings and older demo stores may still use the illustrated photo pack.
const previousGallery = ['gnudi', 'kare', 'rezanci', 'pasulj', 'rizota', 'lignji', 'riba',
  'peresniki', 'pesto', 'medaljoni', 'polpeti', 'rigatoni', 'enoloncnica'].map(name => '/media/' + name + '.webp')
const retired = new Set(['jadran', 'service-soup', 'focaccia', 'gnudi', 'rezanci', 'pasulj', 'pesto']
  .map(name => '/media/' + name + '.webp'))

const marendaGallery = [
  ['rizota', 'Rižota'], ['lignji', 'Lignji na nabodalih'], ['riba', 'Riba z limono'],
  ['kremna-juha', 'Kremna juha'], ['polpeti', 'Zelenjavni polpeti'], ['medaljoni', 'Medaljoni s krompirjem'],
  ['peresniki', 'Peresniki'], ['kare', 'Meso s pečenim krompirjem'], ['njoki', 'Njoki z zelenjavo'],
  ['rigatoni', 'Rigatoni s sirom'], ['predjed', 'Hladna predjed'], ['enoloncnica', 'Paradižnikova enolončnica'],
  ['kosta-steam', 'Bistro Kóšta'], ['kosta-soup', 'Juha iz Kóšte']
]
const firstEditorialGallery = [
  ['lignji', 'Lignji na nabodalih'], ['enoloncnica', 'Paradižnikova enolončnica'], ['njoki', 'Njoki z zelenjavo'],
  ['riba', 'Riba z limono'], ['predjed', 'Hladna predjed'], ['peresniki', 'Peresniki'], ['polpeti', 'Zelenjavni polpeti']
]
const upgrades = new Map([...editorialGallery, storyPhoto].map(photo => ['/media/' + photo.id + '.webp', photo.src]))
const earlierCovers = new Set(['/media/marenda-hero.webp', '/media/kosta-steam.webp', '/media/kosta-soup.webp'])
const earlierStories = new Set(['/media/kosta-steam.webp', '/media/kosta-bread.webp'])

export function currentPhotos(state) {
  for (const key of ['hero', 'storyPhoto', 'terracePhoto']) {
    if (retired.has(state.settings[key])) state.settings[key] = seed.settings[key]
  }
  if (earlierCovers.has(state.settings.hero)) state.settings.hero = seed.settings.hero
  if (earlierStories.has(state.settings.storyPhoto)) state.settings.storyPhoto = seed.settings.storyPhoto
  if (state.settings.terracePhoto === originalTerrace.src) state.settings.terracePhoto = seed.settings.terracePhoto
  const originalGallery = state.gallery.length === previousGallery.length &&
    state.gallery.every((photo, index) => photo.src === previousGallery[index] && photo.alt === previousCaptions[index])
  const defaultMarenda = state.gallery.length === marendaGallery.length &&
    state.gallery.every((photo, index) => photo.src === '/media/' + marendaGallery[index][0] + '.webp' && photo.alt === marendaGallery[index][1])
  const defaultEditorial = state.gallery.length === firstEditorialGallery.length &&
    state.gallery.every((photo, index) => photo.src === '/media/editorial-' + firstEditorialGallery[index][0] + '.webp' && photo.alt === firstEditorialGallery[index][1])
  state.gallery = originalGallery || defaultMarenda || defaultEditorial ? structuredClone(seed.gallery)
    : state.gallery.filter(photo => !retired.has(photo.src)).map(photo => ({ ...photo, src: upgrades.get(photo.src) ?? photo.src }))
  for (const items of [state.regular, ...Object.values(state.daily).map(day => day.items)]) {
    for (const item of items) if (retired.has(item.photo)) delete item.photo
  }
  return state
}

const previousCaptions = ['Gnudi z jurčki', 'Kare z zelenjavo', 'Široki rezanci', 'Pasulj s klobaso',
  'Rižota', 'Lignji', 'Riba z limono', 'Peresniki', 'Testenine s pestom', 'Medaljoni s krompirjem',
  'Zelenjavni polpeti', 'Rigatoni', 'Paradižnikova enolončnica']
