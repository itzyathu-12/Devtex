import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  GitHubConnectionStatus,
  GitHubProfile,
  GitHubRepositoryResult
} from '../shared/github'
import type { AppPreferences, AppRuntimeInfo } from '../shared/settings'
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
    getGeminiStatus(): Promise<GeminiStatus>
    saveGeminiKey(key: string): Promise<GeminiStatus>
    removeGeminiKey(): Promise<GeminiStatus>
    setGeminiModel(model: string): Promise<GeminiStatus>
    testGeminiConnection(): Promise<GeminiTestResult>
    sendGeminiChat(request: GeminiChatRequest): Promise<GeminiChatResponse>
    disconnectGitHubRepositories(): Promise<GitHubConnectionStatus>
    openGitHubRepository(url: string): Promise<void>
    onGitHubConnectionChanged(callback: (status: GitHubConnectionStatus) => void): () => void
  }

  interface Window {
    electron: ElectronAPI
    api: DevtexAuthAPI
  }
}
