import { app, shell, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { GitHubRepositoryService } from './github-repositories'
import type { GitHubConnectionStatus } from '../shared/github'

declare const __GITHUB_OAUTH_CLIENT_ID__: string

const authProtocol = 'devtex'
const hasSingleInstanceLock = app.requestSingleInstanceLock()
let mainWindow: BrowserWindow | null = null
let pendingAuthCallback: string | null = null
let rendererReady = false

const githubRepositories = new GitHubRepositoryService({
  clientId: __GITHUB_OAUTH_CLIENT_ID__,
  getWindow: () => mainWindow,
  onStatusChanged: (status: GitHubConnectionStatus) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('github:connection-changed', status)
    }
  }
})

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    throw new Error('Untrusted IPC sender.')
  }
}

function deliverAuthCallback(): void {
  if (!pendingAuthCallback || !mainWindow || !rendererReady) return
  mainWindow.webContents.send('auth:callback', pendingAuthCallback)
  pendingAuthCallback = null
}

function handleAuthCallback(value: string): void {
  try {
    const callbackUrl = new URL(value)
    if (
      callbackUrl.protocol !== `${authProtocol}:` ||
      callbackUrl.hostname !== 'auth' ||
      callbackUrl.pathname !== '/callback'
    ) {
      return
    }

    pendingAuthCallback = value
    if (!mainWindow) {
      if (app.isReady()) createWindow()
      return
    }

    mainWindow.show()
    mainWindow.focus()
    deliverAuthCallback()
  } catch (error) {
    console.error('Invalid authentication callback:', error)
  }
}

if (hasSingleInstanceLock) {
  app.on('second-instance', (_event, commandLine) => {
    const callbackUrl = commandLine.find((argument) => argument.startsWith(`${authProtocol}://`))
    if (callbackUrl) handleAuthCallback(callbackUrl)
    else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })

  app.on('open-url', (event, value) => {
    event.preventDefault()
    handleAuthCallback(value)
  })
}

ipcMain.handle('auth:open-external', async (event, value: unknown) => {
  assertTrustedSender(event)
  if (typeof value !== 'string') throw new Error('Invalid external URL.')
  const url = new URL(value)
  if (url.protocol !== 'https:') {
    throw new Error('Only secure HTTPS URLs can be opened for sign-in.')
  }
  await shell.openExternal(url.toString())
})

ipcMain.handle('github:connect', async (event) => {
  assertTrustedSender(event)
  return githubRepositories.connect()
})

ipcMain.handle('github:repositories', async (event) => {
  assertTrustedSender(event)
  return githubRepositories.getRepositories()
})

ipcMain.handle('github:disconnect', async (event) => {
  assertTrustedSender(event)
  return githubRepositories.disconnect()
})

ipcMain.handle('github:open-repository', async (event, value: unknown) => {
  assertTrustedSender(event)
  await githubRepositories.openRepository(value)
})

ipcMain.on('auth:renderer-ready', (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return
  rendererReady = true
  deliverAuthCallback()
})

function createWindow(): void {
  const window = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  mainWindow = window
  rendererReady = false

  window.on('ready-to-show', () => {
    window.show()
  })
  window.webContents.on('did-start-loading', () => {
    rendererReady = false
  })

  window.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.whenReady().then(() => {
    if (is.dev) {
      app.setAsDefaultProtocolClient(authProtocol, process.execPath, [app.getAppPath()])
    } else {
      app.setAsDefaultProtocolClient(authProtocol)
    }

    electronApp.setAppUserModelId('com.electron')
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
    ipcMain.on('ping', () => console.log('pong'))

    const startupCallback = process.argv.find((argument) =>
      argument.startsWith(`${authProtocol}://`)
    )
    if (startupCallback) pendingAuthCallback = startupCallback

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
