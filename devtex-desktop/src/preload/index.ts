import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
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

// Custom APIs for renderer
const api = {
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('auth:open-external', url),
  onAuthCallback: (callback: (url: string) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, url: string): void => callback(url)
    ipcRenderer.on('auth:callback', listener)
    ipcRenderer.send('auth:renderer-ready')
    return () => ipcRenderer.removeListener('auth:callback', listener)
  },
  connectGitHubRepositories: (): Promise<GitHubConnectionStatus> =>
    ipcRenderer.invoke('github:connect'),
  getGitHubRepositories: (): Promise<GitHubRepositoryResult> =>
    ipcRenderer.invoke('github:repositories'),
  getGitHubProfile: (): Promise<GitHubProfile | null> => ipcRenderer.invoke('github:profile'),
  getRuntimeInfo: (): Promise<AppRuntimeInfo> => ipcRenderer.invoke('settings:runtime'),
  getPreferences: (): Promise<AppPreferences> => ipcRenderer.invoke('settings:get-preferences'),
  savePreferences: (preferences: AppPreferences): Promise<AppPreferences> =>
    ipcRenderer.invoke('settings:save-preferences', preferences),
  getGeminiStatus: (): Promise<GeminiStatus> => ipcRenderer.invoke('gemini:status'),
  saveGeminiKey: (key: string): Promise<GeminiStatus> => ipcRenderer.invoke('gemini:save-key', key),
  removeGeminiKey: (): Promise<GeminiStatus> => ipcRenderer.invoke('gemini:remove-key'),
  setGeminiModel: (model: string): Promise<GeminiStatus> =>
    ipcRenderer.invoke('gemini:set-model', model),
  testGeminiConnection: (): Promise<GeminiTestResult> => ipcRenderer.invoke('gemini:test'),
  sendGeminiChat: (request: GeminiChatRequest): Promise<GeminiChatResponse> =>
    ipcRenderer.invoke('gemini:chat', request),
  disconnectGitHubRepositories: (): Promise<GitHubConnectionStatus> =>
    ipcRenderer.invoke('github:disconnect'),
  openGitHubRepository: (url: string): Promise<void> =>
    ipcRenderer.invoke('github:open-repository', url),
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
