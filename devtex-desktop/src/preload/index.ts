import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { GitHubConnectionStatus, GitHubRepositoryResult } from '../shared/github'

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
