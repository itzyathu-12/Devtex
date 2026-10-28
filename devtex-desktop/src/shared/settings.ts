export type StartupPage = 'Dashboard' | 'Settings'

export type AIProviderId = 'gemini' | 'groq' | 'openai'

export type IntegrationState =
  'connected' | 'not-connected' | 'not-configured' | 'testing' | 'error'

export interface IntegrationStatus {
  service: 'GitHub' | 'Supabase' | 'AI provider'
  state: IntegrationState
  detail: string
}

export interface SanitizedDiagnosticEntry {
  timestamp: string
  level: 'info' | 'warning' | 'error'
  area: 'runtime' | 'github' | 'supabase' | 'configuration'
  message: string
}

export interface AppPreferences {
  reduceMotion: boolean
  startupPage: StartupPage
  geminiModel: string
  aiProvider: AIProviderId
  providerModels: Record<AIProviderId, string>
}

export interface GeminiStatus {
  provider: AIProviderId
  providerLabel: string
  configured: boolean
  model: string
  credentialState: GeminiCredentialState
  storageContext: GeminiStorageContext
}

export type GeminiTestFailureCategory =
  | 'timeout'
  | 'network'
  | 'invalid-key'
  | 'permission'
  | 'model-unavailable'
  | 'quota'
  | 'server'
  | 'request'
  | 'unknown'
  | 'credential'

export type GeminiTestResult =
  | { success: true; attempts: number }
  | {
      success: false
      category: GeminiTestFailureCategory
      message: string
      retryable: boolean
      attempts: number
      httpStatus?: number
    }

export type GeminiCredentialState = 'missing' | 'stored' | 'unreadable'

export interface GeminiStorageContext {
  userDataDirectory: string
  platform: string
  packaged: boolean
  backend: string
}

export interface GeminiChatMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface GeminiChatRequest {
  messages: GeminiChatMessage[]
  mode?: 'chat' | 'code-assistance' | 'code-review'
}

export type GeminiChatResponse =
  | { success: true; text: string }
  | {
      success: false
      category: GeminiTestFailureCategory
      message: string
      retryable: boolean
      attempts: number
      httpStatus?: number
    }

export interface AppRuntimeInfo {
  appVersion: string
  electronVersion: string
  chromiumVersion: string
  nodeVersion: string
  environment: 'development' | 'production'
  supabaseUrlStatus: ConfigurationValueStatus
  supabasePublishableKeyStatus: ConfigurationValueStatus
  githubOAuthClientStatus: ConfigurationValueStatus
}

export type ConfigurationValueStatus = 'missing' | 'empty' | 'configured' | 'invalid'

export type SettingsSection =
  'account' | 'api' | 'chat' | 'runtime' | 'integrations' | 'preferences' | 'diagnostics' | 'about'
