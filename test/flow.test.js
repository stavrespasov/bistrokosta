import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { addDays, localClock } from '../lib/bookings.js'

test('a published menu travels from the owner to a guest booking and the kitchen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kosta-flow-'))
  Object.assign(process.env, {
    DATABASE_URL: '', VERCEL: '', NODE_ENV: 'test', BISTRO_DATA_DIR: dir,
    OWNER_PASSWORD: '', KITCHEN_PASSWORD: '', RESEND_API_KEY: '', RESERVATION_FROM: ''
  })
  const { default: handler } = await import('../api/handler.js')
  const server = createServer(handler)
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const base = 'http://127.0.0.1:' + server.address().port
    const [today] = localClock()
    const date = addDays(today, 1)
    const call = async (path, { method = 'GET', body, cookie } = {}) => {
      const response = await fetch(base + '/api/' + path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined
      })
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }

    assert.equal((await call('content')).status, 401)
    const owner = await call('session', { method: 'POST', body: { role: 'owner', password: 'kosta-owner-demo' } })
    const kitchen = await call('session', { method: 'POST', body: { role: 'kitchen', password: 'kosta-kitchen-demo' } })
    assert.equal(owner.status, 200)
    assert.equal(kitchen.status, 200)
    assert.equal((await call('content', { cookie: kitchen.cookie })).status, 403)

    const initial = (await call('content?date=' + date, { cookie: owner.cookie })).data
    const put = body => call('content', { method: 'PUT', cookie: owner.cookie, body })
    assert.equal((await put({ section: 'settings', settings: { ...initial.settings, seats: 4, maxParty: 4, autoConfirm: false } })).status, 200)
    const items = [{ id: 'soup', name: 'Juha za test', price: 540, allergens: '9', active: true, preorder: true }]
    for (const day of [today, date]) {
      assert.equal((await put({ section: 'daily', date: day, published: false, items })).status, 200)
      if (day === today) assert.deepEqual((await call('site')).data.menu.daily, [])
      assert.equal((await put({ section: 'daily', date: day, published: true, items })).status, 200)
    }
    assert.equal((await call('site')).data.menu.daily[0].name, 'Juha za test')
    const choices = await call('availability?' + new URLSearchParams({ date, party: 4 }))
    assert.equal(choices.data.menu.daily[0].price, 540)
    const [time] = choices.data.slots
    assert.ok(time)
    const input = {
      date, time, party: 4, name: 'Test Gost', phone: '070 000 001', email: 'guest@example.com',
      notes: 'Alergija na oreščke', consent: true, key: randomUUID(),
      items: [{ id: 'daily:soup', quantity: 4 }, { id: 'regular:gnudi', quantity: 1 }]
    }
    const post = body => call('reservations', { method: 'POST', body })
    const inputs = [input, { ...input, key: randomUUID(), email: 'other@example.com' }]
    const competing = await Promise.all(inputs.map(post))
    assert.deepEqual(competing.map(result => result.status).sort(), [201, 409])
    const winnerIndex = competing.findIndex(result => result.status === 201)
    const winner = competing[winnerIndex]
    assert.equal((await post(inputs[winnerIndex])).data.reference, winner.data.reference)
    assert.equal(winner.data.status, 'pending')
    const readBoard = session => call('board?date=' + date, { cookie: session.cookie })
    assert.deepEqual((await readBoard(kitchen)).data.reservations, [])
    const { id } = (await readBoard(owner)).data.reservations[0]
    const patch = (session, body) => call('reservations/' + id, { method: 'PATCH', cookie: session.cookie, body })
    assert.equal((await patch(kitchen, { status: 'confirmed' })).status, 404)
    assert.equal((await patch(owner, { status: 'confirmed' })).status, 200)
    assert.equal((await readBoard(owner)).data.reservations[0].emailStatus, 'preview')

    const [ticket] = (await readBoard(kitchen)).data.reservations
    assert.equal(ticket.items[0].quantity, 4)
    assert.equal(ticket.items[0].price, 540)
    assert.equal(ticket.items[1].name, 'Gnudi z jurčki')
    assert.equal(ticket.guestNote, input.notes)
    const ownerKitchen = await call('board?date=' + date + '&view=kitchen', { cookie: owner.cookie })
    assert.deepEqual(ownerKitchen.data.reservations, [ticket])
    assert.equal(ticket.email, undefined)
    assert.equal(ticket.phone, undefined)
    assert.equal(ticket.name, undefined)
    assert.equal((await patch(kitchen, { kitchenStatus: 'ready', status: 'cancelled' })).status, 200)
    const [updated] = (await readBoard(owner)).data.reservations
    assert.equal(updated.kitchenStatus, 'ready')
    assert.equal(updated.status, 'confirmed')
    assert.equal((await put({ section: 'daily', date, published: false, items: [] })).status, 200)
    assert.equal((await readBoard(kitchen)).data.reservations[0].items[0].name, 'Juha za test')

    // The owner can take phone bookings while public reservations are closed.
    const phoneDay = addDays(date, 1)
    await put({ section: 'settings', settings: { ...initial.settings, bookingOpen: false, seats: 4, maxParty: 4 } })
    const deskUrl = 'availability?date=' + phoneDay + '&party=4&desk=1'
    assert.deepEqual((await call('availability?date=' + phoneDay + '&party=4')).data.slots, [])
    assert.equal((await call(deskUrl)).status, 401)
    const [deskTime] = (await call(deskUrl, { cookie: owner.cookie })).data.slots
    const phoneBooking = { date: phoneDay, time: deskTime, party: 4, name: 'Telefonski gost', phone: '070000002', key: randomUUID() }
    const desk = (body, cookie) => call('desk-reservations', { method: 'POST', body, cookie })
    assert.equal((await desk(phoneBooking, kitchen.cookie)).status, 403)
    assert.equal((await desk(phoneBooking)).status, 401)
    assert.equal((await post({ ...phoneBooking, consent: true })).status, 400)
    const saved = await desk(phoneBooking, owner.cookie)
    assert.equal(saved.status, 201)
    assert.equal(saved.data.emailStatus, 'phone')
    assert.equal(saved.data.status, 'confirmed')
    assert.equal((await desk(phoneBooking, owner.cookie)).data.reference, saved.data.reference)
    assert.equal((await desk({ ...phoneBooking, key: randomUUID() }, owner.cookie)).status, 409)
    const service = await call('board?date=' + phoneDay, { cookie: kitchen.cookie })
    assert.equal(service.data.reservations[0].reference, saved.data.reference)
    assert.equal(service.data.service, undefined)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})
