import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
let rootPath: string | null = null
const windowOptions = {
  width: 1480, height: 920, minWidth: 980, minHeight: 640,
  backgroundColor: '#080b10',
  webPreferences: {
    preload: path.join(here, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  }
}

function isInsideRoot(target: string): boolean {
  if (!rootPath) return false
  const resolved = path.resolve(rootPath, target)
  return resolved === rootPath || resolved.startsWith(rootPath + path.sep)
}
function safePath(relativePath: string): string {
  if (!rootPath || path.isAbsolute(relativePath)) throw new Error('No project is open or path is invalid.')
  const target = path.resolve(rootPath, relativePath)
  if (!isInsideRoot(target)) throw new Error('Path escapes the project directory.')
  return target
}
async function scan(dir: string, prefix = ''): Promise<Array<{name:string;path:string;kind:'file'|'directory'}>> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const result: Array<{name:string;path:string;kind:'file'|'directory'}> = []
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const relative = prefix ? prefix + '/' + entry.name : entry.name
    result.push({ name: entry.name, path: relative, kind: entry.isDirectory() ? 'directory' : 'file' })
    if (entry.isDirectory()) result.push(...await scan(path.join(dir, entry.name), relative))
  }
  return result
}
function createWindow(): void {
  const win = new BrowserWindow(windowOptions)
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(here, '../renderer/index.html'))
}
ipcMain.handle('project:open', async () => {
  const picked = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (picked.canceled || !picked.filePaths[0]) return null
  rootPath = picked.filePaths[0]
  return { name: path.basename(rootPath), files: await scan(rootPath) }
})
ipcMain.handle('project:tree', async () => rootPath ? scan(rootPath) : [])
ipcMain.handle('file:read', async (_event, relativePath: string) => fs.readFile(safePath(relativePath), 'utf8'))
ipcMain.handle('file:write', async (_event, relativePath: string, content: string) => {
  const target = safePath(relativePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content, 'utf8')
  return true
})
ipcMain.handle('file:create', async (_event, relativePath: string, kind: 'file'|'directory') => {
  const target = safePath(relativePath)
  if (kind === 'directory') await fs.mkdir(target, { recursive: true })
  else { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, '', { flag: 'wx' }) }
  return scan(rootPath!)
})
ipcMain.handle('project:root', () => rootPath)
app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() }) })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })