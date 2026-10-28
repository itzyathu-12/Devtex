import type {
  AIProviderId,
  GeminiChatResponse,
  GeminiStatus,
  GeminiTestResult
} from '../../shared/settings'

export type AIProviderStatus = GeminiStatus

export interface AIProvider {
  readonly id: AIProviderId
  readonly label: string

  status(): Promise<AIProviderStatus>
  saveKey(key: unknown): Promise<AIProviderStatus>
  removeKey(): Promise<AIProviderStatus>
  setModel(value: unknown): Promise<AIProviderStatus>
  testConnection(): Promise<GeminiTestResult>
  chat(request: unknown): Promise<GeminiChatResponse>
}
