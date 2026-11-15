import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  GitHubConnectionStatus,
  GitHubProfile,
  GitHubRepositoryResult,
  GitHubRepository
} from '../shared/github'
import type { AppPreferences, AppRuntimeInfo } from '../shared/settings'
import type { GitRepositoryState, GitDiffResult } from '../shared/git'
import type {
  GeminiChatRequest,
  GeminiChatResponse,
  AIProviderId,
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

// Custom APIs for renderer
const api = {
  getGitStatus: (path: string): Promise<GitRepositoryState> => ipcRenderer.invoke('git:status', path),
  getGitDiff: (request: { path: string; filePath: string; staged?: boolean }): Promise<GitDiffResult> => ipcRenderer.invoke('git:diff', request),
  stageGitFiles: (request: { path: string; files: string[] }): Promise<void> => ipcRenderer.invoke('git:stage', request),
  unstageGitFiles: (request: { path: string; files: string[] }): Promise<void> => ipcRenderer.invoke('git:unstage', request),
  commitGitChanges: (request: { path: string; message: string }): Promise<void> => ipcRenderer.invoke('git:commit', request),
  switchGitBranch: (request: { path: string; branch: string; create?: boolean }): Promise<void> => ipcRenderer.invoke('git:branch', request),
  syncGitRepository: (request: { path: string; action: 'fetch' | 'pull' | 'push' }): Promise<void> => ipcRenderer.invoke('git:sync', request),
  setGitRemote: (request: { path: string; name: string; url: string }): Promise<void> => ipcRenderer.invoke('git:set-remote', request),
  initializeGitRepository: (request: { path: string; branch?: string }): Promise<void> => ipcRenderer.invoke('git:init', request),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('auth:open-external', url),
  onAuthCallback: (callback: (url: string) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, url: string): void => callback(url)
    ipcRenderer.on('auth:callback', listener)
    ipcRenderer.send('auth:renderer-ready')
    return () => ipcRenderer.removeListener('auth:callback', listener)
  },
  connectGitHubRepositories: (): Promise<GitHubConnectionStatus> =>
    ipcRenderer.invoke('github:connect'),
  connectGitHubWithToken: (token: string): Promise<GitHubConnectionStatus> =>
    ipcRenderer.invoke('github:connect-token', token),
  createGitHubRepository: (request: { name: string; description?: string; isPrivate: boolean }): Promise<GitHubRepository> =>
    ipcRenderer.invoke('github:create-repository', request),
  cloneGitHubRepository: (url: string): Promise<WorkspaceProject | null> =>
    ipcRenderer.invoke('github:clone-repository', url),
  getGitHubRepositories: (): Promise<GitHubRepositoryResult> =>
    ipcRenderer.invoke('github:repositories'),
  getGitHubProfile: (): Promise<GitHubProfile | null> => ipcRenderer.invoke('github:profile'),
  getRuntimeInfo: (): Promise<AppRuntimeInfo> => ipcRenderer.invoke('settings:runtime'),
  getPreferences: (): Promise<AppPreferences> => ipcRenderer.invoke('settings:get-preferences'),
  savePreferences: (preferences: AppPreferences): Promise<AppPreferences> =>
    ipcRenderer.invoke('settings:save-preferences', preferences),
  getAIStatus: (): Promise<GeminiStatus> => ipcRenderer.invoke('ai:status'),
  setAIProvider: (provider: AIProviderId): Promise<GeminiStatus> =>
    ipcRenderer.invoke('ai:set-provider', provider),
  saveAIKey: (key: string): Promise<GeminiStatus> => ipcRenderer.invoke('ai:save-key', key),
  removeAIKey: (): Promise<GeminiStatus> => ipcRenderer.invoke('ai:remove-key'),
  setAIModel: (model: string): Promise<GeminiStatus> => ipcRenderer.invoke('ai:set-model', model),
  testAIConnection: (): Promise<GeminiTestResult> => ipcRenderer.invoke('ai:test'),
  sendAIChat: (request: GeminiChatRequest): Promise<GeminiChatResponse> =>
    ipcRenderer.invoke('ai:chat', request),
  readProjectFile: (request: ProjectFileReadRequest): Promise<ProjectFileReadResult> =>
    ipcRenderer.invoke('project:read-file', request),
  applyProjectFileEdit: (request: ProjectFileEditRequest): Promise<ProjectFileEditResult> =>
    ipcRenderer.invoke('project:apply-edit', request),
  applyRepoOrganization: (request: RepoOrganizationApplyRequest): Promise<RepoOrganizationApplyResult> =>
    ipcRenderer.invoke('project:apply-organization', request),
  scanProjectForBugs: (projectPath: string): Promise<ProjectBugScanResult> =>
    ipcRenderer.invoke('project:scan-bugs', projectPath),
  getIgnoredBugs: (): Promise<string[]> => ipcRenderer.invoke('bugs:get-ignored'),
  ignoreBug: (identifiers: string | string[]): Promise<string[]> =>
    ipcRenderer.invoke('bugs:ignore', identifiers),
  unignoreBug: (identifier: string): Promise<string[]> =>
    ipcRenderer.invoke('bugs:unignore', identifier),
  disconnectGitHubRepositories: (): Promise<GitHubConnectionStatus> =>
    ipcRenderer.invoke('github:disconnect'),
  openGitHubRepository: (url: string): Promise<void> =>
    ipcRenderer.invoke('github:open-repository', url),
  getProjects: (): Promise<WorkspaceProject[]> => ipcRenderer.invoke('projects:get'),
  chooseAndAddProject: (): Promise<WorkspaceProject[] | null> =>
    ipcRenderer.invoke('projects:choose-and-add'),
  removeProject: (id: string): Promise<WorkspaceProject[]> =>
    ipcRenderer.invoke('projects:remove', id),
  onGitHubConnectionChanged: (callback: (status: GitHubConnectionStatus) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, status: GitHubConnectionStatus): void =>
      callback(status)
    ipcRenderer.on('github:connection-changed', listener)
    return () => ipcRenderer.removeListener('github:connection-changed', listener)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
