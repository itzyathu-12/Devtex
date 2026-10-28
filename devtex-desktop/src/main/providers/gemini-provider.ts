import type { AIProvider, AIProviderStatus } from './ai-provider'
import { GeminiService } from '../gemini'
import type { GeminiChatResponse, GeminiTestResult } from '../../shared/settings'

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const
  readonly label = 'Google Gemini'
  private readonly service = new GeminiService()

  async status(): Promise<AIProviderStatus> {
    return this.service.status()
  }

  async saveKey(key: unknown): Promise<AIProviderStatus> {
    return this.service.saveKey(key)
  }

  async removeKey(): Promise<AIProviderStatus> {
    return this.service.removeKey()
  }

  async setModel(value: unknown): Promise<AIProviderStatus> {
    return this.service.setModel(value)
  }

  async testConnection(): Promise<GeminiTestResult> {
    return this.service.testConnection()
  }

  async chat(request: unknown): Promise<GeminiChatResponse> {
    return this.service.chat(request)
  }
}
