import { GoogleGenAI } from '@google/genai'
import { app, safeStorage } from 'electron'
import * as fileSystem from 'node:fs/promises'
import { join } from 'node:path'
import type {
  GeminiChatMessage,
  GeminiChatResponse,
  GeminiStatus,
  GeminiTestFailureCategory,
  GeminiTestResult
} from '../shared/settings'
import { getPreferences, savePreferences } from './settings'
import { GeminiCredentialStore } from './gemini-credential-store'
import { isTransientError, retryTransientRequest } from './gemini-request'

const credentialPath = join(app.getPath('userData'), 'gemini-api-key.enc')
const credentialStore = new GeminiCredentialStore(
  credentialPath,
  safeStorage,
  fileSystem,
  process.platform
)
const chatRequestTimeoutMs = 30_000
const chatOverallTimeoutMs = 95_000
const geminiTestRequestTimeoutMs = 60_000
const geminiTestOverallTimeoutMs = 190_000
const geminiTestMaxRetries = 2
const maxMessages = 20
const maxMessageLength = 8_000
const maxConversationLength = 50_000
const maxResponseLength = maxMessageLength

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function validateGeminiModel(value: unknown): string {
  if (typeof value !== 'string' || !/^gemini-[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value)) {
    throw new Error(
      'Enter a model identifier beginning with "gemini-" using letters, numbers, dots, underscores, or hyphens.'
    )
  }
  return value
}

function getGeminiFailureCategory(error: unknown, signal: AbortSignal): GeminiTestFailureCategory {
  if (signal.aborted) return 'timeout'
  if (!isRecord(error)) return error instanceof TypeError ? 'network' : 'unknown'

  const nested = isRecord(error.error) ? error.error : null
  const details = Array.isArray(nested?.details) ? nested.details : []
  const reasons = details
    .filter(isRecord)
    .map((detail) => detail.reason)
    .filter((reason): reason is string => typeof reason === 'string')
  const reason = typeof nested?.status === 'string' ? nested.status : ''
  const status =
    typeof error.status === 'number'
      ? error.status
      : typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined
  const errorCode = typeof error.code === 'string' ? error.code : ''

  if (error.name === 'AbortError' || error.name === 'TimeoutError' || status === 408) {
    return 'timeout'
  }
  if (
    reasons.some((item) => item === 'API_KEY_INVALID' || item === 'INVALID_API_KEY') ||
    reason === 'UNAUTHENTICATED' ||
    status === 401
  ) {
    return 'invalid-key'
  }
  if (
    reasons.includes('RATE_LIMIT_EXCEEDED') ||
    reason === 'RESOURCE_EXHAUSTED' ||
    status === 429
  ) {
    return 'quota'
  }
  if (status === 403 || reason === 'PERMISSION_DENIED') return 'permission'
  if (status === 404) return 'model-unavailable'
  if (status !== undefined && status >= 500) return 'server'
  if (status === 400 || reason === 'INVALID_ARGUMENT') return 'request'
  if (
    error.name === 'TypeError' ||
    /^(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|UND_ERR_)/.test(errorCode)
  ) {
    return 'network'
  }
  return 'unknown'
}

function sanitizedGeminiMessage(
  category: GeminiTestFailureCategory,
  httpStatus?: number,
  attempts?: number
): string {
  const attemptDetail =
    attempts === undefined
      ? 'after retries'
      : `after ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}`
  switch (category) {
    case 'timeout':
      return 'Gemini did not respond before the request deadline. Check your connection and try again.'
    case 'network':
      return 'Could not reach Gemini. Check your network connection and try again.'
    case 'invalid-key':
      return 'Gemini rejected the API key. Check the key in API Configuration.'
    case 'permission':
      return 'This Gemini API key does not have permission to use the selected model.'
    case 'model-unavailable':
      return 'The selected Gemini model is unavailable. Choose another model in API Configuration.'
    case 'quota':
      return 'Gemini quota or rate limit reached. Check your Google AI Studio project quota and try again later.'
    case 'server':
      if (httpStatus === 503) {
        return `Gemini returned HTTP 503 (service unavailable) ${attemptDetail}. Google may be temporarily overloaded; check Google AI service status and try again shortly.`
      }
      if (httpStatus === 504) {
        return `Gemini returned HTTP 504 (gateway timeout) ${attemptDetail}. Check your connection and try again shortly.`
      }
      if (httpStatus === 502) {
        return `Gemini returned HTTP 502 (bad gateway) ${attemptDetail}. The upstream service may be temporarily unavailable.`
      }
      if (httpStatus !== undefined) {
        return `Gemini returned HTTP ${httpStatus} (server error) ${attemptDetail}. Try again shortly.`
      }
      return `Gemini is temporarily unavailable ${attemptDetail}. Try again shortly.`
    case 'request':
      return 'Gemini rejected the test request. Check the selected model in API Configuration.'
    case 'credential':
      return 'Gemini credentials are unavailable. Review API Configuration and secure storage status.'
    case 'unknown':
      return 'Gemini request failed. Check the connection and try again.'
  }
}

function getGeminiHttpStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined
  if (typeof error.status === 'number') return error.status
  return typeof error.statusCode === 'number' ? error.statusCode : undefined
}

export class GeminiService {
  async status(): Promise<GeminiStatus> {
    const credentialState = await credentialStore.state()
    return {
      provider: 'gemini',
      providerLabel: 'Google Gemini',
      configured: credentialState !== 'missing',
      credentialState,
      model: (await getPreferences()).geminiModel,
      storageContext: credentialStore.getContext(app.getPath('userData'), app.isPackaged)
    }
  }

  async setModel(value: unknown): Promise<GeminiStatus> {
    const model = validateGeminiModel(value)
    const preferences = await getPreferences()
    await savePreferences({
      ...preferences,
      geminiModel: model,
      providerModels: { ...preferences.providerModels, gemini: model }
    })
    return this.status()
  }

  async saveKey(value: unknown): Promise<GeminiStatus> {
    if (typeof value !== 'string') throw new Error('Enter a valid Gemini API key.')
    await credentialStore.saveKey(value)
    return this.status()
  }

  async removeKey(): Promise<GeminiStatus> {
    await credentialStore.removeKey()
    return this.status()
  }

  async testConnection(): Promise<GeminiTestResult> {
    let key: string
    let model: string
    try {
      key = await credentialStore.readKey()
      model = (await getPreferences()).geminiModel
    } catch (error) {
      return {
        success: false,
        category: 'credential',
        message: error instanceof Error ? error.message : 'Gemini credentials are unavailable.',
        retryable: false,
        attempts: 0
      }
    }

    const startedAt = Date.now()
    const controller = new AbortController()
    const totalTimer = setTimeout(() => controller.abort(), geminiTestOverallTimeoutMs)
    const ai = new GoogleGenAI({ apiKey: key })
    let retryAfterHeader: string | null = null
    const fetchWithRetryAfter: typeof fetch = async (input, init) => {
      const response = await fetch(input, init)
      retryAfterHeader = response.headers.get('retry-after')
      return response
    }
    try {
      const outcome = await retryTransientRequest(
        async () => {
          retryAfterHeader = null
          const response = await ai.models.generateContent({
            model,
            contents: 'Reply only OK.',
            config: {
              maxOutputTokens: 4,
              temperature: 0,
              abortSignal: controller.signal,
              httpOptions: {
                timeout: geminiTestRequestTimeoutMs,
                retryOptions: { attempts: 1, httpStatusCodes: [] },
                fetch: fetchWithRetryAfter
              }
            }
          })
          if (!response.text?.trim()) throw new Error('Gemini returned no usable response.')
          return undefined
        },
        {
          maxRetries: geminiTestMaxRetries,
          signal: controller.signal,
          deadlineAt: startedAt + geminiTestOverallTimeoutMs,
          retryAfter: () => retryAfterHeader
        }
      )

      if (outcome.success) {
        console.info('[Gemini test]', {
          elapsedMs: Date.now() - startedAt,
          category: 'success',
          attempts: outcome.attempts
        })
        return { success: true, attempts: outcome.attempts }
      }

      const category = getGeminiFailureCategory(outcome.error, controller.signal)
      const httpStatus = getGeminiHttpStatus(outcome.error)
      console.info('[Gemini test]', {
        elapsedMs: Date.now() - startedAt,
        category,
        attempts: outcome.attempts,
        ...(httpStatus === undefined ? {} : { httpStatus })
      })
      return {
        success: false,
        category,
        message: sanitizedGeminiMessage(category, httpStatus, outcome.attempts),
        retryable: isTransientError(outcome.error),
        attempts: outcome.attempts,
        ...(httpStatus === undefined ? {} : { httpStatus })
      }
    } finally {
      clearTimeout(totalTimer)
    }
  }

  async chat(value: unknown): Promise<GeminiChatResponse> {
    const messages = this.validateChatRequest(value)
    let key: string
    let model: string
    try {
      key = await credentialStore.readKey()
      model = (await getPreferences()).geminiModel
    } catch (error) {
      return {
        success: false,
        category: 'credential',
        message: error instanceof Error ? error.message : 'Gemini credentials are unavailable.',
        retryable: false,
        attempts: 0
      }
    }
    const startedAt = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), chatOverallTimeoutMs)
    let retryAfterHeader: string | null = null
    const fetchWithRetryAfter: typeof fetch = async (input, init) => {
      const response = await fetch(input, init)
      retryAfterHeader = response.headers.get('retry-after')
      return response
    }
    try {
      const outcome = await retryTransientRequest(
        async () => {
          retryAfterHeader = null
          const response = await new GoogleGenAI({ apiKey: key }).models.generateContent({
            model,
            contents: messages.map((message) => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.text }]
            })),
            config: {
              abortSignal: controller.signal,
              httpOptions: {
                timeout: chatRequestTimeoutMs,
                retryOptions: { attempts: 1, httpStatusCodes: [] },
                fetch: fetchWithRetryAfter
              }
            }
          })
          if (!response.text?.trim()) throw new Error('Gemini returned no usable response.')
          return response.text.trim().slice(0, maxResponseLength)
        },
        {
          maxRetries: geminiTestMaxRetries,
          signal: controller.signal,
          deadlineAt: startedAt + chatOverallTimeoutMs,
          retryAfter: () => retryAfterHeader
        }
      )
      if (outcome.success) return { success: true, text: outcome.value }

      const category = getGeminiFailureCategory(outcome.error, controller.signal)
      const httpStatus = getGeminiHttpStatus(outcome.error)
      return {
        success: false,
        category,
        message: sanitizedGeminiMessage(category, httpStatus, outcome.attempts),
        retryable: isTransientError(outcome.error),
        attempts: outcome.attempts,
        ...(httpStatus === undefined ? {} : { httpStatus })
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private validateChatRequest(value: unknown): GeminiChatMessage[] {
    if (!isRecord(value) || !Array.isArray(value.messages)) throw new Error('Invalid chat request.')
    if (value.messages.length === 0 || value.messages.length > maxMessages) {
      throw new Error(`Conversation must contain between 1 and ${maxMessages} messages.`)
    }
    let totalLength = 0
    const messages = value.messages.map((entry): GeminiChatMessage => {
      if (!isRecord(entry) || (entry.role !== 'user' && entry.role !== 'assistant')) {
        throw new Error('Conversation contains an invalid message.')
      }
      if (
        typeof entry.text !== 'string' ||
        !entry.text.trim() ||
        entry.text.length > maxMessageLength
      ) {
        throw new Error('Messages must contain 1 to 8,000 characters.')
      }
      totalLength += entry.text.length
      return { role: entry.role, text: entry.text.trim() }
    })
    if (totalLength > maxConversationLength)
      throw new Error('Conversation is too long. Start a new chat.')
    if (
      messages.some((message, index) => index > 0 && message.role === messages[index - 1]?.role)
    ) {
      throw new Error('Conversation messages must alternate between user and assistant.')
    }
    if (messages.at(-1)?.role !== 'user')
      throw new Error('The final conversation message must be from the user.')
    return messages
  }
}
