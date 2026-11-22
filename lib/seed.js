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
    hero: '/media/kosta-soup.webp',
    storyPhoto: '/media/kosta-bread.webp',
    terracePhoto: '/media/kosta-terrace.webp',
    bookingOpen: false,
    autoConfirm: false,
    seats: 24,
    maxParty: 8,
    duration: 90,
    leadMinutes: 60,
    daysAhead: 30
  },
  gallery: [
    { src: '/media/rizota.webp', alt: 'Rižota' },
    { src: '/media/lignji.webp', alt: 'Lignji na nabodalih' },
    { src: '/media/riba.webp', alt: 'Riba z limono' },
    { src: '/media/kremna-juha.webp', alt: 'Kremna juha' },
    { src: '/media/polpeti.webp', alt: 'Zelenjavni polpeti' },
    { src: '/media/medaljoni.webp', alt: 'Medaljoni s krompirjem' },
    { src: '/media/peresniki.webp', alt: 'Peresniki' },
    { src: '/media/kare.webp', alt: 'Meso s pečenim krompirjem' },
    { src: '/media/njoki.webp', alt: 'Njoki z zelenjavo' },
    { src: '/media/rigatoni.webp', alt: 'Rigatoni s sirom' },
    { src: '/media/predjed.webp', alt: 'Hladna predjed' },
    { src: '/media/enoloncnica.webp', alt: 'Paradižnikova enolončnica' },
    { src: '/media/kosta-steam.webp', alt: 'Bistro Kóšta' },
    { src: '/media/kosta-soup.webp', alt: 'Juha iz Kóšte' }
  ],
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
