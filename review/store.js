import { initialState, exampleMenu } from '../lib/seed.js'
import { addDays, localClock, serviceSlots } from '../lib/bookings.js'

export const preview = true
export const displayOnly = false
let connection

function sampleService() {
  const state = initialState(true)
  const [today] = localClock()
  for (let offset = 0; offset < 7; offset++) {
    state.daily[addDays(today, offset)] = { published: true, items: structuredClone(exampleMenu) }
  }
  state.reservations.push({
    id: crypto.randomUUID(), reference: 'DEMO-04', date: today, time: '12:30',
    name: 'Vzorčna miza', email: 'demo@example.com', phone: '000000000', party: 4,
    table: '4', duration: 90, status: 'confirmed', kitchenStatus: 'queued',
    items: [{ id: 'regular:gnudi', name: 'Gnudi z jurčki', quantity: 4, price: 1140, allergens: '' }],
    emailStatus: 'preview', confirmationVersion: 1, notes: '', staffNotes: '', createdAt: new Date().toISOString()
  })
  const examples = [
    [-6, 'DEMO-06', 'completed', 3, 'web'], [-4, 'DEMO-07', 'completed', 8, 'desk'],
    [-2, 'DEMO-08', 'completed', 5, 'web'], [-2, 'DEMO-09', 'no-show', 2, 'web'],
    [-1, 'DEMO-10', 'completed', 6, 'desk'], [0, 'DEMO-11', 'seated', 2, 'desk'],
    [0, 'DEMO-12', 'pending', 4, 'web'], [1, 'DEMO-13', 'confirmed', 5, 'web'],
    [2, 'DEMO-14', 'pending', 6, 'web'], [4, 'DEMO-15', 'confirmed', 4, 'desk']
  ]
  for (const [offset, reference, status, party, source] of examples) {
    const date = addDays(today, offset)
    const slots = serviceSlots({ ...state.settings, leadMinutes: 0 }, date, new Date(date + 'T00:00:00Z'))
    const time = slots.find(slot => slot >= '12:00') ?? slots[0]
    const items = status === 'pending' ? [] : [{ id: 'regular:gnudi', name: 'Gnudi z jurčki', quantity: party, price: 1140, allergens: '' }]
    state.reservations.push({
      id: crypto.randomUUID(), reference, date, time, party, source, status, duration: 90,
      name: 'Vzorčna miza ' + reference.slice(-2), phone: '000000000', email: source === 'web' ? 'demo@example.com' : '',
      table: '', kitchenStatus: status === 'seated' ? 'preparing' : status === 'completed' ? 'served' : 'queued',
      items, emailStatus: source === 'desk' ? 'phone' : 'preview', confirmationVersion: 1, notes: '', staffNotes: '', createdAt: new Date().toISOString()
    })
  }
  return state
}

function open() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('kosta-review-v1', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('service').put(sampleService(), 'state')
      request.result.createObjectStore('photos')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch(error => { connection = undefined; throw error })
  return connection
}

async function transaction(table, mode, key, operation) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(table, mode)
    const store = tx.objectStore(table)
    const read = store.get(key)
    let output
    read.onsuccess = () => {
      try { output = operation(read.result, store) }
      catch (error) { tx.abort(); reject(error) }
    }
    tx.oncomplete = () => resolve(output)
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Shranjevanje ni uspelo.'))
  })
}

export function getStore() {
  return {
    read: () => transaction('service', 'readonly', 'state', state => state),
    change: update => transaction('service', 'readwrite', 'state', (state, store) => {
      const output = update(state)
      store.put(state, 'state')
      return output
    }),
    getMedia: id => transaction('photos', 'readonly', id, value => value),
    putMedia: (id, mime, bytes) => transaction('photos', 'readwrite', id, (_, store) => { store.put({ mime, bytes }, id) })
  }
}
