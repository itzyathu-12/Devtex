import { app, safeStorage } from 'electron'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AIProviderId,
  GeminiChatMessage,
  GeminiChatRequest,
  GeminiChatResponse,
  GeminiStatus,
  GeminiTestFailureCategory,
  GeminiTestResult
} from '../../shared/settings'
import { GeminiCredentialStore } from '../gemini-credential-store'
import { getPreferences, savePreferences } from '../settings'
import type { AIProvider, AIProviderStatus } from './ai-provider'

const requestTimeoutMs = 45_000
const maxMessages = 20
const maxMessageLength = 8_000
const maxConversationLength = 50_000

interface ProviderOptions {
  id: 'groq' | 'openai'
  label: string
  endpoint: string
  defaultModel: string
}

interface ChatCompletionPayload {
  choices?: Array<{ message?: { content?: unknown } }>
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: AIProviderId
  readonly label: string
  private readonly endpoint: string
  private readonly defaultModel: string
  private readonly credentialStore: GeminiCredentialStore

  constructor(options: ProviderOptions) {
    this.id = options.id
    this.label = options.label
    this.endpoint = options.endpoint
    this.defaultModel = options.defaultModel
    this.credentialStore = new GeminiCredentialStore(
      join(app.getPath('userData'), `${options.id}-api-key.enc`),
      safeStorage,
      fs,
      process.platform,
      options.label
    )
  }

  async status(): Promise<AIProviderStatus> {
    const [credentialState, preferences] = await Promise.all([
      this.credentialStore.state(),
      getPreferences()
    ])
    const model = preferences.providerModels[this.id] ?? this.defaultModel
    const storageContext = this.credentialStore.getContext(app.getPath('userData'), app.isPackaged)
    const status: GeminiStatus = {
      provider: this.id,
      providerLabel: this.label,
      configured: credentialState !== 'missing',
      credentialState,
      model,
      storageContext
    }
    return status
  }

  async saveKey(value: unknown): Promise<AIProviderStatus> {
    if (typeof value !== 'string') throw new Error(`Enter a valid ${this.label} API key.`)
    await this.credentialStore.saveKey(value)
    return this.status()
  }

  async removeKey(): Promise<AIProviderStatus> {
    await this.credentialStore.removeKey()
    return this.status()
  }

  async setModel(value: unknown): Promise<AIProviderStatus> {
    if (
      typeof value !== 'string' ||
      value.trim().length > 120 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*(?:\/[A-Za-z0-9][A-Za-z0-9._:-]*)*$/.test(value.trim())
    ) {
      throw new Error(`Enter a valid ${this.label} model identifier.`)
    }
    const preferences = await getPreferences()
    const model = value.trim()
    await savePreferences({
      ...preferences,
      providerModels: { ...preferences.providerModels, [this.id]: model }
    })
    return this.status()
  }

  async testConnection(): Promise<GeminiTestResult> {
    try {
      const key = await this.credentialStore.readKey()
      const { model } = await this.status()
      const result = await this.request(key, model, [{ role: 'user', text: 'Reply only OK.' }], 'chat')
      return result.success
        ? { success: true, attempts: 1 }
        : { ...result, attempts: 1 }
    } catch (error) {
      return {
        success: false,
        category: 'credential',
        message: error instanceof Error ? error.message : `${this.label} credentials are unavailable.`,
        retryable: false,
        attempts: 0
      }
    }
  }

  async chat(value: unknown): Promise<GeminiChatResponse> {
    let messages: GeminiChatMessage[]
    let mode: NonNullable<GeminiChatRequest['mode']>
    try {
      ({ messages, mode } = this.validateRequest(value))
    } catch (error) {
      return {
        success: false,
        category: 'request',
        message: error instanceof Error ? error.message : 'Invalid AI chat request.',
        retryable: false,
        attempts: 0
      }
    }

    try {
      const [key, preferences] = await Promise.all([
        this.credentialStore.readKey(),
        getPreferences()
      ])
      return await this.request(
        key,
        preferences.providerModels[this.id] ?? this.defaultModel,
        messages,
        mode
      )
    } catch (error) {
      return {
        success: false,
        category: 'credential',
        message: error instanceof Error ? error.message : `${this.label} credentials are unavailable.`,
        retryable: false,
        attempts: 0
      }
    }
  }

  private async request(
    key: string,
    model: string,
    messages: GeminiChatMessage[],
    mode: NonNullable<GeminiChatRequest['mode']>
  ): Promise<GeminiChatResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
    const requestMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = messages.map((message) => ({
      role: message.role,
      content: message.text
    }))
    if (mode === 'code-assistance' || mode === 'code-review') {
      const instruction = mode === 'code-review'
        ? 'Act as a careful code reviewer. Identify concrete bugs, security risks, and missing tests. Prioritize findings by severity, cite relevant code excerpts or locations when provided, and do not claim to have executed code.'
        : 'Act as a practical programming assistant. Explain the issue, propose a focused solution, and provide code when useful. Do not claim to have run code.'
      requestMessages.unshift({ role: 'system', content: instruction })
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: requestMessages,
          temperature: 0.2,
          max_completion_tokens: 2048,
        }),
        signal: controller.signal
      })
      if (!response.ok) {
        const category = this.failureCategory(response.status)
        return {
          success: false,
          category,
          message: this.failureMessage(category, response.status),
          retryable: response.status === 408 || response.status === 429 || response.status >= 500,
          attempts: 1,
          httpStatus: response.status
        }
      }
      const payload: unknown = await response.json()
      const text = this.extractResponse(payload)
      if (!text) {
        return {
          success: false,
          category: 'unknown',
          message: `${this.label} returned an empty response. Try again.`,
          retryable: true,
          attempts: 1
        }
      }
      return { success: true, text: text.slice(0, maxMessageLength) }
    } catch (error) {
      const timedOut = controller.signal.aborted
      return {
        success: false,
        category: timedOut ? 'timeout' : 'network',
        message: timedOut
          ? `${this.label} did not respond before the request deadline. Try again.`
          : `Could not reach ${this.label}. Check your network connection and try again.`,
        retryable: true,
        attempts: 1
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private validateRequest(value: unknown): GeminiChatRequest & { mode: NonNullable<GeminiChatRequest['mode']> } {
    if (!value || typeof value !== 'object' || !('messages' in value)) {
      throw new Error('Invalid chat request.')
    }
    const request = value as GeminiChatRequest
    const mode = request.mode ?? 'chat'
    if (!['chat', 'code-assistance', 'code-review'].includes(mode)) {
      throw new Error('Choose a valid AI mode.')
    }
    if (!Array.isArray(request.messages) || request.messages.length === 0 || request.messages.length > maxMessages) {
      throw new Error(`Conversation must contain between 1 and ${maxMessages} messages.`)
    }
    let totalLength = 0
    const messages = request.messages.map((message) => {
      if (!message || !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string') {
        throw new Error('Conversation contains an invalid message.')
      }
      const text = message.text.trim()
      if (!text || text.length > maxMessageLength) throw new Error('Messages must contain 1 to 8,000 characters.')
      totalLength += text.length
      return { role: message.role, text }
    })
    if (totalLength > maxConversationLength) throw new Error('Conversation is too long. Start a new chat.')
    if (messages.at(-1)?.role !== 'user') throw new Error('The final conversation message must be from the user.')
    return { messages, mode }
  }

  private extractResponse(value: unknown): string {
    if (!value || typeof value !== 'object') return ''
    const choices = (value as ChatCompletionPayload).choices
    const content = choices?.[0]?.message?.content
    return typeof content === 'string' ? content.trim() : ''
  }

  private failureCategory(status: number): GeminiTestFailureCategory {
    if (status === 401) return 'invalid-key'
    if (status === 403) return 'permission'
    if (status === 404) return 'model-unavailable'
    if (status === 408) return 'timeout'
    if (status === 429) return 'quota'
    if (status >= 500) return 'server'
    return 'request'
  }

  private failureMessage(category: GeminiTestFailureCategory, status: number): string {
    switch (category) {
      case 'invalid-key': return `${this.label} rejected the API key. Check API Configuration.`
      case 'permission': return `This ${this.label} key does not have permission to use the selected model.`
      case 'model-unavailable': return `The selected ${this.label} model is unavailable. Check the model identifier.`
      case 'timeout': return `${this.label} timed out (HTTP ${status}). Try again.`
      case 'quota': return `${this.label} quota or rate limit was reached. Try again later.`
      case 'server': return `${this.label} is temporarily unavailable (HTTP ${status}). Try again shortly.`
      default: return `${this.label} rejected the request (HTTP ${status}). Check the selected model and request.`
    }
  }
}