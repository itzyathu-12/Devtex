import assert from 'node:assert/strict'
import test from 'node:test'
import { retryTransientRequest } from '../src/main/gemini-request.ts'
import { withLoadingState } from '../src/shared/async-state.ts'

/* JavaScript test fixtures intentionally rely on runtime assertions for types. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

function apiError(status) {
  const error = new Error(`HTTP ${status}`)
  error.status = status
  return error
}

const noDelay = async () => undefined

test('retries HTTP 503 twice, preserves the final status, and stops after three attempts', async () => {
  let attempts = 0
  const result = await retryTransientRequest(
    async () => {
      attempts += 1
      throw apiError(503)
    },
    { wait: noDelay, random: () => 0 }
  )

  assert.equal(result.success, false)
  if (!result.success) {
    assert.equal(result.attempts, 3)
    assert.equal(result.error.status, 503)
  }
  assert.equal(attempts, 3)
})

test('retries HTTP 429 and respects Retry-After seconds', async () => {
  let attempts = 0
  const delays = []
  const result = await retryTransientRequest(
    async () => {
      attempts += 1
      if (attempts === 1) throw apiError(429)
      return 'ok'
    },
    {
      retryAfter: () => '2',
      wait: async (milliseconds) => delays.push(milliseconds),
      random: () => 0
    }
  )

  assert.deepEqual(result, { success: true, value: 'ok', attempts: 2 })
  assert.deepEqual(delays, [2000])
})

test('respects Retry-After HTTP dates', async () => {
  let attempts = 0
  const delays = []
  const result = await retryTransientRequest(
    async () => {
      attempts += 1
      if (attempts === 1) throw apiError(503)
      return 'ok'
    },
    {
      now: () => 10_000,
      retryAfter: () => new Date(12_500).toUTCString(),
      wait: async (milliseconds) => delays.push(milliseconds),
      random: () => 0
    }
  )

  assert.deepEqual(result, { success: true, value: 'ok', attempts: 2 })
  assert.deepEqual(delays, [2000])
})

test('uses exponential backoff with bounded jitter', async () => {
  let attempts = 0
  const delays = []
  const result = await retryTransientRequest(
    async () => {
      attempts += 1
      if (attempts < 3) throw apiError(503)
      return 'ok'
    },
    {
      random: () => 0.5,
      wait: async (milliseconds) => delays.push(milliseconds)
    }
  )

  assert.deepEqual(result, { success: true, value: 'ok', attempts: 3 })
  assert.deepEqual(delays, [1000, 2000])
})

test('does not retry HTTP 400 or 403', async () => {
  for (const status of [400, 403]) {
    let attempts = 0
    const result = await retryTransientRequest(
      async () => {
        attempts += 1
        throw apiError(status)
      },
      { wait: noDelay }
    )

    assert.equal(result.success, false)
    if (!result.success) assert.equal(result.error.status, status)
    assert.equal(result.attempts, 1)
    assert.equal(attempts, 1)
  }
})

test('caps retries at configured maximum', async () => {
  let attempts = 0
  const result = await retryTransientRequest(
    async () => {
      attempts += 1
      throw apiError(503)
    },
    { maxRetries: 1, wait: noDelay }
  )

  assert.equal(result.success, false)
  if (!result.success) assert.equal(result.attempts, 2)
  assert.equal(attempts, 2)
})

test('resets loading state after success and rejection', async () => {
  const states = []
  assert.equal(
    await withLoadingState(
      async () => 'done',
      (loading) => states.push(loading)
    ),
    'done'
  )
  assert.deepEqual(states, [true, false])

  states.length = 0
  await assert.rejects(
    withLoadingState(
      async () => {
        throw new Error('failed')
      },
      (loading) => states.push(loading)
    ),
    /failed/
  )
  assert.deepEqual(states, [true, false])
})
