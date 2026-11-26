import { HarnessError } from '@deepseek-ai/dsh-llm'

export const ERROR_CODES = Object.freeze({
  AUTH_001: 'AUTH_001',
  EMAIL_001: 'EMAIL_001',
  PERM_001: 'PERM_001',
  NET_001: 'NET_001',
  RATE_001: 'RATE_001',
  ATT_001: 'ATT_001',
})

export class ExchangeError extends HarnessError {
  constructor(code, message, details = {}, options) {
    super(message, code, options)
    this.details = details && typeof details === 'object' ? { ...details } : {}
  }
}

export function isAbortError(err) {
  if (!err || typeof err !== 'object') return false
  return (
    err.name === 'AbortError' ||
    err.code === 'ABORT_ERR' ||
    err.code === 'ERR_CANCELED'
  )
}

export function throwIfAborted(signal) {
  if (!signal?.aborted) return
  if (signal.reason !== undefined) {
    throw signal.reason
  }
  throw new DOMException('The operation was aborted', 'AbortError')
}
