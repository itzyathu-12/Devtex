export interface RetryRequestOptions {
  maxRetries?: number
  signal?: AbortSignal
  deadlineAt?: number
  retryAfter?: () => string | null
  now?: () => number
  random?: () => number
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  maxBackoffMs?: number
}

export type RetryRequestResult<T> =
  | { success: true; value: T; attempts: number }
  | { success: false; error: unknown; attempts: number }

export async function retryTransientRequest<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryRequestOptions = {}
): Promise<RetryRequestResult<T>> {
  const maxRetries = options.maxRetries ?? 2
  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const wait = options.wait ?? waitForRetry
  const maxBackoffMs = options.maxBackoffMs ?? 10_000
  const deadlineAt = options.deadlineAt ?? Number.POSITIVE_INFINITY

  for (let attempt = 0; ; attempt += 1) {
    if (options.signal?.aborted) {
      return { success: false, error: new Error('Gemini request cancelled.'), attempts: attempt }
    }
    try {
      return { success: true, value: await operation(attempt), attempts: attempt + 1 }
    } catch (error) {
      const retryable = isTransientError(error)
      if (!retryable || attempt >= maxRetries || options.signal?.aborted) {
        return { success: false, error, attempts: attempt + 1 }
      }

      const retryAfterMs = parseRetryAfter(options.retryAfter?.() ?? null, now())
      const exponentialMs = Math.min(maxBackoffMs, 1_000 * 2 ** attempt)
      const jitteredMs = Math.round(exponentialMs * (0.5 + Math.min(1, Math.max(0, random()))))
      const delayMs = retryAfterMs ?? jitteredMs
      if (now() + delayMs >= deadlineAt) {
        return { success: false, error, attempts: attempt + 1 }
      }
      try {
        await wait(delayMs, options.signal)
      } catch {
        return {
          success: false,
          error: new Error('Gemini request cancelled.'),
          attempts: attempt + 1
        }
      }
    }
  }
}

export function isTransientError(error: unknown): boolean {
  const status = getStatus(error)
  if (status === 429 || (status !== undefined && status >= 500 && status <= 599)) return true
  if (status !== undefined) return false
  if (!(error instanceof Error)) return false
  if (error.name === 'TypeError') return true
  return (
    typeof (error as Error & { code?: unknown }).code === 'string' &&
    /^(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|UND_ERR_)/.test(
      (error as Error & { code: string }).code
    )
  )
}

export function getStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const status = 'status' in error ? error.status : undefined
  if (typeof status === 'number') return status
  const statusCode = 'statusCode' in error ? error.statusCode : undefined
  return typeof statusCode === 'number' ? statusCode : undefined
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000)
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - now)
}

function waitForRetry(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Gemini request cancelled.'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new Error('Gemini request cancelled.'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
