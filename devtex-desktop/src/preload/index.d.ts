import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  GitHubConnectionStatus,
  GitHubProfile,
  GitHubRepositoryResult
} from '../shared/github'
import type { AppPreferences, AppRuntimeInfo } from '../shared/settings'

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
    disconnectGitHubRepositories(): Promise<GitHubConnectionStatus>
    openGitHubRepository(url: string): Promise<void>
    onGitHubConnectionChanged(callback: (status: GitHubConnectionStatus) => void): () => void
  }

  interface Window {
    electron: ElectronAPI
    api: DevtexAuthAPI
  }
}
