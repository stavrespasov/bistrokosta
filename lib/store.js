import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { initialState } from './seed.js'

const require = createRequire(import.meta.url)
let storage

function sqlite(preview) {
  const { DatabaseSync } = require('node:sqlite')
  const root = resolve(process.env.BISTRO_DATA_DIR || '.data')
  mkdirSync(root, { recursive: true })
  const db = new DatabaseSync(resolve(root, 'bistro.sqlite'))
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS bistro_state (id INTEGER PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bistro_media (id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL);
  `)
  db.prepare('INSERT OR IGNORE INTO bistro_state VALUES (1, ?)').run(JSON.stringify(initialState(preview)))
  const select = db.prepare('SELECT body FROM bistro_state WHERE id = 1')
  const save = db.prepare('UPDATE bistro_state SET body = ? WHERE id = 1')
  return {
    read: () => JSON.parse(select.get().body),
    change(update) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const state = JSON.parse(select.get().body)
        const result = update(state)
        save.run(JSON.stringify(state))
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    putMedia(id, mime, bytes) {
      db.prepare('INSERT INTO bistro_media VALUES (?, ?, ?)').run(id, mime, bytes)
    },
    getMedia(id) {
      return db.prepare('SELECT mime, bytes FROM bistro_media WHERE id = ?').get(id)
    }
  }
}

async function postgres() {
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000 })
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bistro_state (id INTEGER PRIMARY KEY, body JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS bistro_media (id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BYTEA NOT NULL);
  `)
  await pool.query('INSERT INTO bistro_state VALUES (1, $1) ON CONFLICT DO NOTHING', [initialState(false)])
  return {
    async read() {
      return (await pool.query('SELECT body FROM bistro_state WHERE id = 1')).rows[0].body
    },
    async change(update) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const state = (await client.query('SELECT body FROM bistro_state WHERE id = 1 FOR UPDATE')).rows[0].body
        const result = update(state)
        await client.query('UPDATE bistro_state SET body = $1 WHERE id = 1', [state])
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
    putMedia(id, mime, bytes) {
      return pool.query('INSERT INTO bistro_media VALUES ($1, $2, $3)', [id, mime, bytes])
    },
    async getMedia(id) {
      return (await pool.query('SELECT mime, bytes FROM bistro_media WHERE id = $1', [id])).rows[0]
    }
  }
}

export const production = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
export const preview = !production && !process.env.DATABASE_URL
export function getStore() {
  if (production && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  storage ??= Promise.resolve(process.env.DATABASE_URL ? postgres() : sqlite(preview)).catch(error => {
    storage = undefined
    throw error
  })
  return storage
}
