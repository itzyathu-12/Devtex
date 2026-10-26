import { GoogleGenAI } from '@google/genai'
import { app, safeStorage } from 'electron'
import * as fileSystem from 'node:fs/promises'
import { join } from 'node:path'
import type { GeminiChatMessage, GeminiStatus } from '../shared/settings'
import { getPreferences, savePreferences } from './settings'
import { GeminiCredentialStore } from './gemini-credential-store'

/* SDK and storage errors are intentionally sanitized before crossing IPC. */
/* eslint-disable preserve-caught-error */

const credentialPath = join(app.getPath('userData'), 'gemini-api-key.enc')
const credentialStore = new GeminiCredentialStore(
  credentialPath,
  safeStorage,
  fileSystem,
  process.platform
)
const requestTimeoutMs = 30_000
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

function sanitizeGeminiError(error: unknown): string {
  let status: unknown
  if (isRecord(error)) {
    status = error.status ?? error.statusCode ?? error.code
    if (isRecord(error.error)) status = error.error.code ?? status
  }
  if (status === 429 || status === '429')
    return 'Gemini rate limit reached. Wait a moment and try again.'
  if (status === 400 || status === '400')
    return 'Gemini rejected the request. Check the model and message, then try again.'
  if (status === 401 || status === 403 || status === '401' || status === '403') {
    return 'Gemini rejected this API key. Check the key in API Configuration.'
  }
  if (status === 404 || status === '404')
    return 'The selected Gemini model was not found or is unavailable to this key.'
  if (error instanceof TypeError)
    return 'Could not reach Gemini. Check your network connection and try again.'
  return 'Gemini request failed. Check the connection and try again.'
}

export class GeminiService {
  async status(): Promise<GeminiStatus> {
    const credentialState = await credentialStore.state()
    return {
      configured: credentialState !== 'missing',
      credentialState,
      model: (await getPreferences()).geminiModel,
      storageContext: credentialStore.getContext(app.getPath('userData'), app.isPackaged)
    }
  }

  async setModel(value: unknown): Promise<GeminiStatus> {
    const model = validateGeminiModel(value)
    const preferences = await getPreferences()
    await savePreferences({ ...preferences, geminiModel: model })
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

  async testConnection(): Promise<void> {
    const key = await credentialStore.readKey()
    const model = (await getPreferences()).geminiModel
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const response = await new GoogleGenAI({ apiKey: key }).models.generateContent({
        model,
        contents: 'Reply with OK.',
        config: { maxOutputTokens: 8, abortSignal: controller.signal }
      })
      if (!response.text?.trim()) throw new Error('Gemini returned no usable response.')
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Gemini request timed out. Try again.')
      if (error instanceof Error && error.message === 'Gemini returned no usable response.') {
        throw error
      }
      throw new Error(sanitizeGeminiError(error))
    } finally {
      clearTimeout(timer)
    }
  }

  async chat(value: unknown): Promise<{ text: string }> {
    const messages = this.validateChatRequest(value)
    const key = await credentialStore.readKey()
    const model = (await getPreferences()).geminiModel
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const response = await new GoogleGenAI({ apiKey: key }).models.generateContent({
        model,
        contents: messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.text }]
        })),
        config: { abortSignal: controller.signal }
      })
      if (!response.text?.trim()) throw new Error('Gemini returned no usable response.')
      const text = response.text?.trim()
      if (!text) throw new Error('Gemini returned an empty response.')
      return { text: text.slice(0, maxResponseLength) }
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Gemini request timed out. Try again.')
      if (error instanceof Error && error.message === 'Gemini returned no usable response.')
        throw error
      if (error instanceof Error && error.message === 'Gemini returned an empty response.')
        throw error
      throw new Error(sanitizeGeminiError(error))
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
