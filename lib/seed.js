import { coverPhoto, editorialGallery, originalTerrace, storyPhoto } from '../public/media-catalog.js'

export const exampleMenu = [
  { id: 'fennel', name: 'Koromačeva juha s krompirčkom', price: 470, allergens: '7, 9', active: true, preorder: true },
  { id: 'pasulj', name: 'Pasulj', price: 650, allergens: '1', active: true, preorder: true },
  { id: 'sausage', name: 'Pasulj s klobaso', price: 780, allergens: '1', active: true, preorder: true },
  { id: 'kare', name: 'Kare na žaru z batato, zelenjavo in rožmarinom iz pečice', price: 920, allergens: '', active: true, preorder: true },
  { id: 'pasta', name: 'Široki rezanci z mediteransko zelenjavo in mozzarello', price: 810, allergens: '1, 3, 7', active: true, preorder: true }
]

export const seed = {
  settings: {
    address: 'Ferrarska ulica 5B, 6000 Koper',
    phone: '070 172 114',
    delivery: 'Dostava po Kopru do 11.00 ali po 13.00.',
    terrace: 'Za rojstne dneve, obletnice in skupna kosila. Na terasi je prostora za 47 gostov.',
    intro: 'Dnevne malice, domača focaccia in nekaj dobrega na žlico. Vsak dan na Ferrarski v Kopru.',
    story: 'Testo za focaccio zamesimo in spečemo sami. Tudi njoki in olivni pesto nastanejo v naši kuhinji. Kadar zadiši po govejem golažu, ga postrežemo s še toplo focaccio.',
    hours: [
      [['11:00', '16:00']], [['09:00', '15:00']], [['09:00', '15:00']],
      [['09:00', '15:00'], ['18:00', '22:00']], [['09:00', '15:00'], ['18:00', '22:00']],
      [['09:00', '15:00'], ['18:00', '22:00']], [['09:00', '15:00'], ['18:00', '22:00']]
    ],
    hero: coverPhoto.src,
    storyPhoto: storyPhoto.src,
    terracePhoto: originalTerrace.src,
    bookingOpen: false,
    autoConfirm: false,
    seats: 24,
    maxParty: 8,
    duration: 90,
    leadMinutes: 60,
    daysAhead: 30
  },
  gallery: editorialGallery.map(({ src, title }) => ({ src, alt: title })),
  regular: [
    { id: 'gnudi', name: 'Gnudi z jurčki', price: 1140, allergens: '', active: true, preorder: true },
    { id: 'salad', name: 'Solata s piščancem in avokadovim prelivom', price: 1140, allergens: '', active: true, preorder: true },
    { id: 'stew', name: 'Goveji golaž z domačo focaccio', price: null, allergens: '', active: true, preorder: false }
  ],
  daily: {},
  reservations: [],
  limits: {}
}

export function initialState(preview) {
  const state = structuredClone(seed)
  if (preview) {
    state.settings.bookingOpen = true
    state.settings.autoConfirm = true
  }
  return state
}
