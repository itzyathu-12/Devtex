import { app, shell, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join, basename } from 'path'
// Replaced @electron-toolkit utils with minimal stubs
const electronApp = { setAppUserModelId: (_id: string) => { } } as const;
const optimizer = { watchWindowShortcuts: (_window: any) => { } } as const;
const is = { dev: process.env.NODE_ENV !== 'production' } as const;
// const { electronApp, optimizer, is } = require('@electron-toolkit/utils');
import icon from '../../resources/icon.png?asset'
import { GitHubRepositoryService } from './github-repositories'
import { getCurrentAIProvider } from './providers/provider-factory'

import {
  getPreferences,
  getProjects,
  addProject,
  removeProject,
  getRuntimeInfo,
  savePreferences
} from './settings'
import {
  chooseProjectFolder,
  inspectProject,
  readProjectFile,
  applyProjectFileEdit,
  scanProjectForBugs
} from './project-inspector'
import type { GitHubConnectionStatus } from '../shared/github'
import type {
  WorkspaceProject,
  GeminiChatRequest,
  GeminiChatMessage,
  ProjectFileEditRequest,
  ProjectFileReadRequest
} from '../shared/settings'

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
  } catch {
    return
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

ipcMain.handle('github:profile', async (event) => {
  assertTrustedSender(event)
  return githubRepositories.getGitHubProfile()
})

ipcMain.handle('github:disconnect', async (event) => {
  assertTrustedSender(event)
  return githubRepositories.disconnect()
})

ipcMain.handle('github:open-repository', async (event, value: unknown) => {
  assertTrustedSender(event)
  await githubRepositories.openRepository(value)
})

ipcMain.handle('settings:runtime', (event) => {
  assertTrustedSender(event)
  return getRuntimeInfo()
})

ipcMain.handle('settings:get-preferences', async (event) => {
  assertTrustedSender(event)
  return getPreferences()
})

ipcMain.handle('settings:save-preferences', async (event, value: unknown) => {
  assertTrustedSender(event)
  return savePreferences(value)
})

ipcMain.handle('ai:status', async (event) => {
  assertTrustedSender(event);
  const provider = await getCurrentAIProvider();
  return provider.status();
});

ipcMain.handle('ai:set-provider', async (event, value: unknown) => {
  assertTrustedSender(event)
  if (value !== 'gemini' && value !== 'groq' && value !== 'openai') {
    throw new Error('Choose a supported AI provider.')
  }
  const preferences = await getPreferences()
  await savePreferences({ ...preferences, aiProvider: value })
  return getCurrentAIProvider().then((provider) => provider.status())
})

ipcMain.handle('ai:save-key', async (event, value) => {
  assertTrustedSender(event);
  const provider = await getCurrentAIProvider();
  return provider.saveKey(value);
});

ipcMain.handle('ai:remove-key', async (event) => {
  assertTrustedSender(event);
  const provider = await getCurrentAIProvider();
  return provider.removeKey();
});

ipcMain.handle('ai:set-model', async (event, value) => {
  assertTrustedSender(event);
  const provider = await getCurrentAIProvider();
  return provider.setModel(value);
});

ipcMain.handle('ai:test', async (event) => {
  assertTrustedSender(event);
  const provider = await getCurrentAIProvider();
  return provider.testConnection();
});

ipcMain.handle('projects:get', async (event) => {
  assertTrustedSender(event)
  return getProjects()
})

ipcMain.handle('projects:choose-and-add', async (event) => {
  assertTrustedSender(event)
  const chosen = await chooseProjectFolder(mainWindow)
  if (!chosen) return null
  const project: WorkspaceProject = {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: chosen.name,
    path: chosen.path,
    addedAt: new Date().toISOString()
  }
  return addProject(project)
})

ipcMain.handle('projects:remove', async (event, id: unknown) => {
  assertTrustedSender(event)
  if (typeof id !== 'string' || !id) throw new Error('Invalid project identifier.')
  return removeProject(id)
})

ipcMain.handle('ai:chat', async (event, value: unknown) => {
  assertTrustedSender(event);
  let requestValue = value;
  if (
    value &&
    typeof value === 'object' &&
    'projectPath' in value &&
    typeof (value as { projectPath?: unknown }).projectPath === 'string' &&
    (value as { projectPath: string }).projectPath.trim()
  ) {
    const rawReq = value as GeminiChatRequest;
    const projectPath = rawReq.projectPath!.trim();
    if (Array.isArray(rawReq.messages) && rawReq.messages.length > 0) {
      const lastUserIdx = rawReq.messages.map((m) => m.role).lastIndexOf('user');
      const lastUserMessage = lastUserIdx !== -1 ? rawReq.messages[lastUserIdx] : undefined;
      if (lastUserMessage && lastUserMessage.text) {
        try {
          const userText = lastUserMessage.text.trim();
          // Leave room for user question and wrapper so total message stays under 8,000 chars
          const contextBudget = Math.max(1200, Math.min(3800, 7200 - userText.length));
          const projectContext = await inspectProject(projectPath, userText, contextBudget);
          const projectName = basename(projectPath) || 'project';
          const codeEditGuide = `[DEVTEX System Guidance: Code Editing & Bug Fixing]
When asked to write code, edit code, or fix bugs, explain your solution clearly. Then output the exact code change in one of these structured blocks:
Option 1 (Replacing code in existing file):
\`\`\`devtex-edit
file: relative/path/to/file.ext
<<<<<<< SEARCH
exact lines to replace
=======
exact replacement lines
>>>>>>>
\`\`\`
Option 2 (New file or rewriting whole file):
\`\`\`devtex-write:relative/path/to/file.ext
// full new file content
\`\`\`
The user will review the interactive diff and must approve before any change is written to disk.`;

          const enrichedUserText = `[Project Context: ${projectName}]\n${projectContext}\n\n${codeEditGuide}\n\n[User Request]\n${userText}`.slice(0, 7800);

          const enrichedMessages: GeminiChatMessage[] = rawReq.messages.map((m, idx) =>
            idx === lastUserIdx ? { ...m, text: enrichedUserText } : m
          );
          requestValue = { ...rawReq, messages: enrichedMessages };
        } catch (error) {
          console.warn('[Project inspection notice]', error);
        }
      }
    }
  }
  const provider = await getCurrentAIProvider();
  return provider.chat(requestValue);
});

ipcMain.handle('project:read-file', async (event, req: unknown) => {
  assertTrustedSender(event);
  if (!req || typeof req !== 'object' || !('projectPath' in req) || !('filePath' in req)) {
    throw new Error('Invalid project file read request.');
  }
  const { projectPath, filePath } = req as ProjectFileReadRequest;
  try {
    const content = await readProjectFile(projectPath, filePath);
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to read file.' };
  }
});

ipcMain.handle('project:apply-edit', async (event, req: unknown) => {
  assertTrustedSender(event);
  if (!req || typeof req !== 'object' || !('projectPath' in req) || !('filePath' in req)) {
    throw new Error('Invalid project file edit request.');
  }
  return applyProjectFileEdit(req as ProjectFileEditRequest);
});

ipcMain.handle('project:scan-bugs', async (event, projectPath: unknown) => {
  assertTrustedSender(event);
  if (typeof projectPath !== 'string' || !projectPath.trim()) {
    throw new Error('Invalid project path for bug scan.');
  }
  let aiChatCallback: ((prompt: string) => Promise<string>) | undefined;
  try {
    const provider = await getCurrentAIProvider();
    const status = await provider.status();
    if (status.configured) {
      aiChatCallback = async (prompt: string): Promise<string> => {
        const resp = await provider.chat({
          messages: [{ role: 'user', text: prompt }],
          mode: 'bug-fix'
        });
        if (resp.success) return resp.text;
        throw new Error(resp.message || 'AI bug scan request failed');
      };
    }
  } catch {
    // Fall back to heuristic scanning without failing
  }
  return scanProjectForBugs(projectPath.trim(), aiChatCallback);
});

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
    ...(['win32', 'linux'].includes(process.platform) ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
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
