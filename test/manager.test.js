import assert from 'node:assert/strict'
import test from 'node:test'
import { daySummary, periodSummary } from '../lib/manager.js'
import { initialState } from '../lib/seed.js'

test('manager summaries count overlapping reservations, exclude cancelled preorders, and group work for the kitchen', () => {
  const state = initialState(false)
  const date = '2026-11-28'
  const item = { name: 'Juha', quantity: 2, price: 400 }
  const record = { date, party: 4, time: '12:00', duration: 90, status: 'confirmed', source: 'web', kitchenStatus: 'queued', items: [item] }
  state.reservations = [
    record,
    { ...record, time: '12:30', party: 3, duration: 60, status: 'pending' },
    { ...record, time: '13:30', party: 5, source: 'desk', kitchenStatus: 'preparing', items: [item, { name: 'Njoki', quantity: 3, price: 700 }] },
    { ...record, party: 10, status: 'cancelled' },
    { ...record, party: 2, status: 'completed' }
  ]
  const summary = daySummary(state, date, state.reservations, true)
  assert.deepEqual(summary.peak, { covers: 7, at: '12:30' })
  assert.equal(summary.visits.pending, 3)
  assert.equal(summary.visits.completed, 2)
  assert.equal(summary.groups.cancelled, 1)
  assert.deepEqual(summary.channels, { web: 4, desk: 1, unknown: 0 })
  assert.equal(summary.portions, 9)
  assert.equal(summary.preorderCents, 4500)
  assert.deepEqual(summary.prep, { queued: 2, preparing: 5, ready: 0, served: 0 })
  assert.deepEqual(summary.prepItems, [{ name: 'Juha', quantity: 4 }, { name: 'Njoki', quantity: 3 }])
  const future = periodSummary(state, date, 7, false)
  const history = periodSummary(state, date, 7, true)
  assert.equal(future[0].date, date)
  assert.equal(future[1].visits.confirmed, 0)
  assert.equal(history.at(-1).portions, 9)
  assert.equal(history[0].date, '2026-11-22')
})
