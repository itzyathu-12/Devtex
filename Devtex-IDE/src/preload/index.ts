import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('devtex', {
  openProject: () => ipcRenderer.invoke('project:open'),
  getTree: () => ipcRenderer.invoke('project:tree'),
  getRoot: () => ipcRenderer.invoke('project:root'),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('file:write', filePath, content),
  create: (filePath: string, kind: 'file'|'directory') => ipcRenderer.invoke('file:create', filePath, kind)
})