import { $, $$, mediaPath, node } from './ui.js'
import { imageAttributes, mediaBySource } from './media-catalog.js'

const section = $('#galerija')
const track = $('#gallery')
const progress = $('#gallery-progress')
const previousButton = $('#gallery-prev')
const nextButton = $('#gallery-next')
const viewer = $('#photo-viewer')
const stage = $('.photo-stage', viewer)
const image = $('#photo-full')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const sizes = '(max-width: 700px) 87vw, (max-width: 1000px) 65vw, 59vw'
const countLabel = (index, count) => [index + 1, count].map(value => String(value).padStart(2, '0')).join(' / ')
let slides = []
let photos = []
let active = 0
let requested
let current = 0
let opener
let frame
let settleTimer
let swipe

function syncGallery() {
  const max = track.scrollWidth - track.clientWidth
  const position = Math.max(0, Math.min(track.scrollLeft, max))
  const index = position <= 2 ? 0 : max - position < 2 ? slides.length - 1
    : slides.reduce((nearest, slide, index) => Math.abs(slide.offsetLeft - slides[0].offsetLeft - position) <
        Math.abs(slides[nearest].offsetLeft - slides[0].offsetLeft - position) ? index : nearest, 0)
  progress.value = max > 1 ? position / max : 1
  previousButton.disabled = position <= 2
  nextButton.disabled = position >= max - 2
  if (index !== active || !$('#gallery-count').textContent) {
    active = index
    $('#gallery-caption').textContent = photos[active].title
    $('#gallery-count').textContent = countLabel(active, photos.length)
  }
}

function moveTo(index) {
  const target = Math.max(0, Math.min(photos.length - 1, index))
  requested = target
  const last = target === photos.length - 1
  const left = last ? track.scrollWidth - track.clientWidth : slides[target].offsetLeft - slides[0].offsetLeft
  track.scrollTo({ left, behavior: reducedMotion.matches ? 'instant' : 'smooth' })
}

function showPhoto(index) {
  current = (index + photos.length) % photos.length
  const photo = photos[current]
  image.src = photo.src
  image.alt = photo.alt
  $('#photo-title').textContent = photo.title
  $('#photo-count').textContent = countLabel(current, photos.length)
}

function openViewer(index, trigger) {
  if (!photos.length) return
  opener = trigger
  showPhoto(index)
  viewer.showModal()
  document.documentElement.classList.add('photo-open')
  $('#photo-close').focus({ preventScroll: true })
}

viewer.addEventListener('close', () => {
  document.documentElement.classList.remove('photo-open')
  if (opener?.isConnected) opener.focus({ preventScroll: true })
  opener = undefined
})
viewer.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  showPhoto(current + (event.key === 'ArrowLeft' ? -1 : 1))
})
for (const button of $$('[data-photo-delta]')) button.addEventListener('click', () => showPhoto(current + Number(button.dataset.photoDelta)))

stage.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch' || !event.isPrimary) return
  swipe = { x: event.clientX, y: event.clientY }
})
stage.addEventListener('pointerup', event => {
  if (!swipe || event.pointerType !== 'touch' || !event.isPrimary) return
  const distance = event.clientX - swipe.x
  const height = event.clientY - swipe.y
  swipe = undefined
  if (Math.abs(distance) > 48 && Math.abs(distance) > Math.abs(height) * 1.5) showPhoto(current + (distance < 0 ? 1 : -1))
})
stage.addEventListener('pointercancel', () => { swipe = undefined })

track.addEventListener('scroll', () => {
  if (!frame) frame = requestAnimationFrame(() => {
    frame = undefined
    if (slides.length) syncGallery()
  })
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => { requested = undefined }, 160)
}, { passive: true })
track.addEventListener('pointerdown', () => { requested = undefined })
track.addEventListener('keydown', event => {
  if (event.target !== track || !photos.length) return
  const base = requested ?? active
  const target = { ArrowLeft: base - 1, ArrowRight: base + 1, Home: 0, End: photos.length - 1 }[event.key]
  if (target === undefined) return
  event.preventDefault()
  moveTo(target)
})
previousButton.addEventListener('click', () => moveTo((requested ?? active) - 1))
nextButton.addEventListener('click', () => moveTo((requested ?? active) + 1))
$('#gallery-expand').addEventListener('click', event => openViewer(active, event.currentTarget))
if ('ResizeObserver' in window) new ResizeObserver(() => { if (slides.length) syncGallery() }).observe(track)

export function paintGallery(photosFromMenu) {
  if (viewer.open) viewer.close()
  const focusedSlide = track.contains(document.activeElement)
  const lastSource = photos[active]?.src
  photos = photosFromMenu.filter(photo => mediaPath(photo.src)).map(photo => {
    const asset = mediaBySource.get(photo.src)
    return { ...asset, src: photo.src, title: photo.alt, alt: asset?.title === photo.alt ? asset.alt : photo.alt }
  })
  section.hidden = !photos.length
  if (!photos.length) {
    slides = []
    track.replaceChildren()
    return
  }
  const start = Math.max(0, photos.findIndex(photo => photo.src === lastSource))
  active = -1
  $('#gallery-count').textContent = ''
  slides = photos.map((photo, index) => node('figure', { className: 'gallery-plate', 'data-featured': Boolean(photo.featured), 'data-landscape': photo.width > photo.height },
    node('a', { href: photo.src, 'aria-label': 'Odpri fotografijo: ' + photo.title, onclick: event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      openViewer(index, event.currentTarget)
    } }, node('img', { ...imageAttributes(photo, sizes), src: photo.src, loading: 'lazy', decoding: 'async' })),
    node('figcaption', {}, photo.title)))
  track.replaceChildren(...slides)
  track.scrollTo({ left: slides[start].offsetLeft - slides[0].offsetLeft, behavior: 'instant' })
  requested = undefined
  syncGallery()
  if (focusedSlide) $('a', slides[start]).focus({ preventScroll: true })
}
