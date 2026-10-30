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
  GeminiTestResult,
  WorkspaceProject,
  ProjectFileReadRequest,
  ProjectFileReadResult,
  ProjectFileEditRequest,
  ProjectFileEditResult,
  ProjectBugScanResult
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
    readProjectFile(request: ProjectFileReadRequest): Promise<ProjectFileReadResult>
    applyProjectFileEdit(request: ProjectFileEditRequest): Promise<ProjectFileEditResult>
    scanProjectForBugs(projectPath: string): Promise<ProjectBugScanResult>
    disconnectGitHubRepositories(): Promise<GitHubConnectionStatus>
    openGitHubRepository(url: string): Promise<void>
    getProjects(): Promise<WorkspaceProject[]>
    chooseAndAddProject(): Promise<WorkspaceProject[] | null>
    removeProject(id: string): Promise<WorkspaceProject[]>
    onGitHubConnectionChanged(callback: (status: GitHubConnectionStatus) => void): () => void
  }

  interface Window {
    electron: ElectronAPI
    api: DevtexAuthAPI
  }
}
