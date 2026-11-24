const asset = (id, title, alt, width, height, featured = false) => ({
  id, title, alt, width, height, featured,
  src: '/media/editorial-' + id + '.webp',
  small: '/media/editorial-' + id + '-small.webp'
})

export const coverPhoto = asset('bistro', 'Bistro Kóšta', 'Skleda hladne predjedi pod znakom Bistra Kóšta', 1169, 1280)
export const storyPhoto = asset('kremna-juha', 'Kremna juha', 'Kremna juha v belem krožniku na kamniti mizi', 1280, 853)

export const editorialGallery = [
  asset('lignji', 'Lignji na nabodalih', 'Zapečeni lignji na nabodalih z zelenjavo in limono', 1280, 853, true),
  asset('enoloncnica', 'Paradižnikova enolončnica', 'Paradižnikova enolončnica v poslikani skledi', 1254, 1254),
  asset('njoki', 'Njoki z zelenjavo', 'Zapečeni njoki z zelenjavo na belem krožniku', 1169, 1280),
  asset('riba', 'Riba z limono', 'Pečena riba z limono na temnem krožniku', 1169, 1280),
  asset('predjed', 'Hladna predjed', 'Hladna predjed v belem krožniku z valovitim robom', 1254, 1254, true),
  asset('peresniki', 'Peresniki', 'Peresniki v belem krožniku na kamniti mizi', 1169, 1280),
  asset('polpeti', 'Zelenjavni polpeti', 'Zelenjavni polpeti z omako na belem krožniku', 1169, 1280),
  asset('rigatoni', 'Rigatoni s sirom', 'Rigatoni z naribanim sirom na belem krožniku', 1169, 1280),
  asset('kare', 'Meso s pečenim krompirjem', 'Pečeno meso s krompirjem in korenjem', 1280, 853, true)
].map((photo, index) => ({ ...photo, order: index }))

export const originalTerrace = {
  id: 'terrace', src: '/media/kosta-terrace.webp', title: 'Terasa na Ferrarski',
  alt: 'Vhod v Bistro Kóšta in mize pod drevesom', width: 320, height: 240
}

const assets = [coverPhoto, storyPhoto, originalTerrace, ...editorialGallery]
export const mediaBySource = new Map(assets.map(photo => [photo.src, photo]))

export function imageAttributes(photo, sizes) {
  return {
    alt: photo.alt,
    width: photo.width,
    height: photo.height,
    srcset: photo.small ? photo.small + ' 640w, ' + photo.src + ' ' + photo.width + 'w' : '',
    sizes: photo.small ? sizes : ''
  }
}
