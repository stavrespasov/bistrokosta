import { Buffer } from 'buffer'
export const randomUUID = () => crypto.randomUUID()
export const randomBytes = count => Buffer.from(crypto.getRandomValues(new Uint8Array(count)))
