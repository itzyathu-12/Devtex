export type StartupPage = 'Dashboard' | 'Settings'

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
  'account' | 'api' | 'runtime' | 'integrations' | 'preferences' | 'diagnostics' | 'about'
