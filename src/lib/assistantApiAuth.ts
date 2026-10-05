import { createHash, timingSafeEqual } from 'node:crypto'

/** Fail closed. The caller never supplies the account or a database credential. */
export function authorizedAssistant(header: string | null, expectedHash: string | undefined): boolean {
  if (!expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false
  const match = header?.match(/^Bearer ([A-Za-z0-9_-]{43,256})$/)
  if (!match) return false
  const actual = createHash('sha256').update(match[1]).digest()
  return timingSafeEqual(actual, Buffer.from(expectedHash, 'hex'))
}
