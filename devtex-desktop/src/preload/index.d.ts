import { ElectronAPI } from '@electron-toolkit/preload'
import type { GitHubConnectionStatus, GitHubRepositoryResult } from '../shared/github'

declare global {
  interface DevtexAuthAPI {
    openExternal(url: string): Promise<void>
    onAuthCallback(callback: (url: string) => void): () => void
    connectGitHubRepositories(): Promise<GitHubConnectionStatus>
    getGitHubRepositories(): Promise<GitHubRepositoryResult>
    disconnectGitHubRepositories(): Promise<GitHubConnectionStatus>
    openGitHubRepository(url: string): Promise<void>
    onGitHubConnectionChanged(callback: (status: GitHubConnectionStatus) => void): () => void
  }

  interface Window {
    electron: ElectronAPI
    api: DevtexAuthAPI
  }
}
