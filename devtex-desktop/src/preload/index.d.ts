import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  GitHubConnectionStatus,
  GitHubProfile,
  GitHubRepositoryResult
} from '../shared/github'
import type { AIProviderId, AppPreferences, AppRuntimeInfo } from '../shared/settings'
import type {
  GeminiChatRequest,
  GeminiChatResponse,
  GeminiStatus,
  GeminiTestResult
} from '../shared/settings'

declare global {
  interface DevtexAuthAPI {
    openExternal(url: string): Promise<void>
    onAuthCallback(callback: (url: string) => void): () => void
    connectGitHubRepositories(): Promise<GitHubConnectionStatus>
    getGitHubRepositories(): Promise<GitHubRepositoryResult>
    getGitHubProfile(): Promise<GitHubProfile | null>
    getRuntimeInfo(): Promise<AppRuntimeInfo>
    getPreferences(): Promise<AppPreferences>
    savePreferences(preferences: AppPreferences): Promise<AppPreferences>
    getAIStatus(): Promise<GeminiStatus>
    setAIProvider(provider: AIProviderId): Promise<GeminiStatus>
    saveAIKey(key: string): Promise<GeminiStatus>
    removeAIKey(): Promise<GeminiStatus>
    setAIModel(model: string): Promise<GeminiStatus>
    testAIConnection(): Promise<GeminiTestResult>
    sendAIChat(request: GeminiChatRequest): Promise<GeminiChatResponse>
    disconnectGitHubRepositories(): Promise<GitHubConnectionStatus>
    openGitHubRepository(url: string): Promise<void>
    onGitHubConnectionChanged(callback: (status: GitHubConnectionStatus) => void): () => void
  }

  interface Window {
    electron: ElectronAPI
    api: DevtexAuthAPI
  }
}
