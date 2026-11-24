const rasterTypes = ['image/jpeg', 'image/png', 'image/webp']
const heicTypes = ['image/heic', 'image/heif']
export const photoAccept = [...rasterTypes, ...heicTypes, '.heic', '.heif'].join(',')
const maxBytes = 2_000_000

function drawScaled(canvas, image, width, height) {
  const scale = Math.min(1, 1500 / Math.max(width, height))
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
}

async function drawPhoto(canvas, file) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    drawScaled(canvas, image, image.naturalWidth, image.naturalHeight)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function drawHeic(canvas, file) {
  const buffer = await file.arrayBuffer()
  const decoder = new Worker(new URL('./heic-converter.js', import.meta.url))
  try {
    const data = await new Promise((resolve, reject) => {
      decoder.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.imageData)
      decoder.onerror = reject
      decoder.postMessage({ id: 0, buffer }, [buffer])
    })
    const bitmap = await createImageBitmap(data)
    try {
      drawScaled(canvas, bitmap, bitmap.width, bitmap.height)
    } finally {
      bitmap.close()
    }
  } finally {
    decoder.terminate()
  }
}

async function photoCanvas(file, heic) {
  const canvas = document.createElement('canvas')
  try {
    await drawPhoto(canvas, file)
  } catch {
    if (heic) {
      try {
        await drawHeic(canvas, file)
        return canvas
      } catch {
        // Tell the owner which format can be retried when this HEIC cannot be opened.
      }
    }
    throw new Error(heic ? 'Te fotografije HEIC ni mogoče odpreti. Poskusite z izvozom v JPEG.'
      : 'Fotografije ni mogoče odpreti. Izberite drugo datoteko.')
  }
  return canvas
}

function base64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1])
    reader.onerror = () => reject(new Error('Fotografije ni mogoče prebrati. Poskusite znova.'))
    reader.readAsDataURL(blob)
  })
}

export async function preparePhoto(file) {
  const heic = heicTypes.includes(file.type) || /\.hei[cf]$/i.test(file.name)
  if (!heic && !rasterTypes.includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error('Izberite fotografijo JPEG, PNG, WebP ali HEIC.')
  }
  const canvas = await photoCanvas(file, heic)
  for (const [type, quality] of [['image/webp', .88], ['image/jpeg', .86], ['image/jpeg', .68]]) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality))
    if (blob?.size > 0 && blob.size <= maxBytes && rasterTypes.includes(blob.type)) {
      return { mime: blob.type, data: await base64(blob) }
    }
  }
  throw new Error('Fotografije ni mogoče dovolj zmanjšati. Izberite manjšo datoteko.')
}
