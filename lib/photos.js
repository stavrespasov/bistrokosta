import { seed } from './seed.js'

// Persisted bistro settings and older demo stores may still use the illustrated photo pack.
const previousGallery = ['gnudi', 'kare', 'rezanci', 'pasulj', 'rizota', 'lignji', 'riba',
  'peresniki', 'pesto', 'medaljoni', 'polpeti', 'rigatoni', 'enoloncnica'].map(name => '/media/' + name + '.webp')
const retired = new Set(['jadran', 'service-soup', 'focaccia', 'gnudi', 'rezanci', 'pasulj', 'pesto']
  .map(name => '/media/' + name + '.webp'))

export function currentPhotos(state) {
  for (const key of ['hero', 'storyPhoto', 'terracePhoto']) {
    if (retired.has(state.settings[key])) state.settings[key] = seed.settings[key]
  }
  const originalGallery = state.gallery.length === previousGallery.length &&
    state.gallery.every((photo, index) => photo.src === previousGallery[index] && photo.alt === previousCaptions[index])
  state.gallery = originalGallery ? seed.gallery : state.gallery.filter(photo => !retired.has(photo.src))
  for (const items of [state.regular, ...Object.values(state.daily).map(day => day.items)]) {
    for (const item of items) if (retired.has(item.photo)) delete item.photo
  }
  return state
}

const previousCaptions = ['Gnudi z jurčki', 'Kare z zelenjavo', 'Široki rezanci', 'Pasulj s klobaso',
  'Rižota', 'Lignji', 'Riba z limono', 'Peresniki', 'Testenine s pestom', 'Medaljoni s krompirjem',
  'Zelenjavni polpeti', 'Rigatoni', 'Paradižnikova enolončnica']
