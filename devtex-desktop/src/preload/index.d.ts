import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  GitHubConnectionStatus,
  GitHubProfile,
  GitHubRepositoryResult
} from '../shared/github'
import type { AIProviderId, AppPreferences, AppRuntimeInfo } from '../shared/settings'
import type { GitRepositoryState, GitDiffResult } from '../shared/git'
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
  ProjectBugScanResult,
  RepoOrganizationApplyRequest,
  RepoOrganizationApplyResult
} from '../shared/settings'

declare global {
  interface DevtexAuthAPI {
    getGitStatus(path: string): Promise<GitRepositoryState>
    getGitDiff(request: { path: string; filePath: string; staged?: boolean }): Promise<GitDiffResult>
    stageGitFiles(request: { path: string; files: string[] }): Promise<void>
    unstageGitFiles(request: { path: string; files: string[] }): Promise<void>
    commitGitChanges(request: { path: string; message: string }): Promise<void>
    switchGitBranch(request: { path: string; branch: string; create?: boolean }): Promise<void>
    syncGitRepository(request: { path: string; action: 'fetch' | 'pull' | 'push' }): Promise<void>
    setGitRemote(request: { path: string; name: string; url: string }): Promise<void>
    initializeGitRepository(request: { path: string; branch?: string }): Promise<void>
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
    getRepoOrganizerContext(projectPath: string): Promise<string>
    applyRepoOrganization(request: RepoOrganizationApplyRequest): Promise<RepoOrganizationApplyResult>
    scanProjectForBugs(projectPath: string): Promise<ProjectBugScanResult>
    getIgnoredBugs(): Promise<string[]>
    ignoreBug(identifiers: string | string[]): Promise<string[]>
    unignoreBug(identifier: string): Promise<string[]>
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
