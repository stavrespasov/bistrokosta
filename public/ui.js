export const $ = (selector, root = document) => root.querySelector(selector)
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
export const currency = new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' })
export const price = cents => cents === null ? 'Po dogovoru' : currency.format(cents / 100)
export const dateLabel = date => new Intl.DateTimeFormat('sl-SI', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(date))
export const dateToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' }).format(new Date())
export const mediaPath = value => typeof value === 'string' && /^\/(?:media\/[a-z0-9-]+\.webp|api\/media\/[a-f0-9]{32})$/.test(value)

export function node(tag, properties = {}, ...children) {
  const element = document.createElement(tag)
  for (const [key, value] of Object.entries(properties)) {
    if (key.startsWith('aria-') || key.startsWith('data-')) element.setAttribute(key, value)
    else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value)
    else if (value !== undefined) element[key] = value
  }
  element.append(...children.filter(child => child != null))
  return element
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch('/api/' + path, {
    method, signal, headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error || 'Povezava ni uspela. Poskusite znova.')
    error.status = response.status
    throw error
  }
  return result
}

export function say(element, message, kind = '') {
  element.textContent = message
  element.hidden = !message
  if (kind) element.dataset.kind = kind
}
