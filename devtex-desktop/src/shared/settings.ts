export type StartupPage = 'Dashboard' | 'Settings' | 'AI Chat' | 'Profile'

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

export interface WorkspaceProject {
  id: string
  name: string
  path: string
  addedAt: string
}

export interface AppPreferences {
  reduceMotion: boolean
  startupPage: StartupPage
  geminiModel: string
  aiProvider: AIProviderId
  providerModels: Record<AIProviderId, string>
  projects?: WorkspaceProject[]
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
  mode?: 'chat' | 'code-assistance' | 'code-review' | 'bug-fix' | 'code-edit'
  projectPath?: string
}

export interface ProjectFileEditRequest {
  projectPath: string
  filePath: string
  newContent?: string
  originalContent?: string
  searchSnippet?: string
  replaceSnippet?: string
}

export interface ProjectFileEditResult {
  success: boolean
  error?: string
  backupPath?: string
  appliedPath?: string
}

export interface ProjectFileReadRequest {
  projectPath: string
  filePath: string
}

export interface ProjectFileReadResult {
  success: boolean
  content?: string
  error?: string
}

export interface DetectedBug {
  id: string
  file: string
  line?: number
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  suggestedFix?: string
  snippet?: string
}

export interface ProjectBugScanRequest {
  projectPath: string
}

export interface ProjectBugScanResult {
  success: boolean
  bugs: DetectedBug[]
  scannedFilesCount: number
  summary: string
  error?: string
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

export interface HardwareProfile {
  collectedAt: string
  operatingSystem: { platform: string; release: string; architecture: string }
  cpu: { model: string; logicalCores: number }
  memory: { totalBytes: number; freeBytes: number; usedBytes: number }
  appProcess: {
    residentSetBytes: number
    heapUsedBytes: number
    heapTotalBytes: number
    uptimeSeconds: number
  }
  runtime: { electron: string; node: string; appVersion: string }
}

export interface AdaptiveResourcePolicy {
  tier: 'conserve' | 'balanced' | 'performance'
  backgroundConcurrency: number
  indexingBatchSize: number
  pauseNonessentialBackgroundWork: boolean
  featureAvailability: 'full'
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
