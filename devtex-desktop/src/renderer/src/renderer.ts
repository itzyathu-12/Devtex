import { createClient } from '@supabase/supabase-js'
import type { GitHubConnectionStatus, GitHubProfile, GitHubRepository } from '../../shared/github'
import type {
  AppPreferences,
  AppRuntimeInfo,
  AIProviderId,
  GeminiChatMessage,
  GeminiStatus,
  SettingsSection,
  StartupPage,
  WorkspaceProject
} from '../../shared/settings'
import { withLoadingState } from '../../shared/async-state'

let activeAIProjectPath: string | null = null
const activeChatMessages: GeminiChatMessage[] = []

const settingsTitles: Record<SettingsSection, string> = {
  account: 'Account',
  api: 'API Configuration',
  chat: 'AI Chat',
  runtime: 'Environment & Runtime',
  integrations: 'Integrations',
  preferences: 'Preferences',
  diagnostics: 'Security & Diagnostics',
  about: 'About DEVTEX'
}
const settingsDescriptions: Record<SettingsSection, string> = {
  account: 'Manage your DEVTEX sign-in session.',
  api: 'Choose an AI provider and manage its API key and model.',
  chat: 'Chat, get code assistance, or review code with your selected AI provider.',
  runtime: 'Review non-sensitive application and configuration status.',
  integrations: 'Check the independent status of connected services.',
  preferences: 'Choose application behavior that persists on this device.',
  diagnostics: 'Review safe runtime and integration diagnostics.',
  about: 'Application version and runtime details.'
}
type WorkspacePage = StartupPage | 'Projects' | 'Testing Engine' | 'Reports' | 'AI Chat' | 'Profile'
let currentAccountEmail: string | null = null
let currentGitHubStatus: GitHubConnectionStatus = { connected: false, connecting: false }
let currentGitHubProfile: GitHubProfile | null = null
let currentGitHubRepositories: GitHubRepository[] = []
let activeWorkspacePage: WorkspacePage = 'Dashboard'
let workspaceProjects: WorkspaceProject[] = []
type ScanReport = { id: number; projectName: string; projectPath: string; summary: string; issueCount: number; critical: number; warning: number; info: number; createdAt: Date }
const scanReports: ScanReport[] = []
let currentRuntimeInfo: AppRuntimeInfo | null = null
let currentPreferences: AppPreferences = {
  reduceMotion: false,
  startupPage: 'Dashboard',
  geminiModel: 'gemini-2.5-flash-lite',
  aiProvider: 'gemini',
  providerModels: {
    gemini: 'gemini-2.5-flash-lite',
    groq: 'llama-3.3-70b-versatile',
    openai: 'gpt-4o-mini'
  }
}
let activeSettingsSection: SettingsSection = 'account'
let currentAIStatus: GeminiStatus = {
  provider: 'gemini',
  providerLabel: 'Google Gemini',
  configured: false,
  model: 'gemini-2.5-flash-lite',
  credentialState: 'missing',
  storageContext: {
    userDataDirectory: 'Unavailable',
    platform: 'unknown',
    packaged: false,
    backend: 'unknown'
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

function isValidSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')
  } catch {
    return false
  }
}

function isValidSupabasePublishableKey(value: string): boolean {
  return (
    value.startsWith('sb_publishable_') ||
    (value.startsWith('eyJ') && value.split('.').length === 3)
  )
}

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Supabase configuration is missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.'
  )
}

const supabase =
  supabaseUrl &&
  supabaseKey &&
  isValidSupabaseUrl(supabaseUrl) &&
  isValidSupabasePublishableKey(supabaseKey)
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          flowType: 'pkce'
        }
      })
    : null

function init(): void {
  window.addEventListener('DOMContentLoaded', () => {
    showVersions()
    setupNavigation()
    setupProjects()
    setupTestingEngine()
    setupWorkspacePages()
    setupGitHubRepositories()
    setupAuthentication()
    setupProfileMenu()
    setupSettings()
    void loadSettingsBootstrap()
  })
}

function showVersions(): void {
  const versions = window.electron.process.versions

  replaceText('.electron-version', `Electron v${versions.electron}`)
  replaceText('.chrome-version', `Chromium v${versions.chrome}`)
  replaceText('.node-version', `Node v${versions.node}`)

  document.getElementById('footer-author-link')?.addEventListener('click', (event) => {
    event.preventDefault()
    void window.api.openExternal('https://github.com/itzyathu_12')
  })
}

function replaceText(selector: string, text: string): void {
  const element = document.querySelector<HTMLElement>(selector)
  if (element) element.innerText = text
}

function addActivity(title: string, description: string): void {
  const list = document.getElementById('activity-list')
  if (!list) return

  const row = document.createElement('div')
  row.className = 'activity-row'

  const dot = document.createElement('span')
  dot.className = 'activity-dot purple-dot'

  const copy = document.createElement('div')
  copy.className = 'activity-copy'

  const heading = document.createElement('strong')
  heading.textContent = title

  const detail = document.createElement('span')
  detail.textContent = description

  const time = document.createElement('time')
  time.textContent = 'JUST NOW'

  copy.append(heading, detail)
  row.append(dot, copy, time)
  list.prepend(row)
}

function setupNavigation(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.nav-item')
  const descriptions: Record<string, string> = {
    Dashboard: 'Build, test, and improve your software from one workspace.',
    Projects: 'Browse, search, and manage your local development projects.',
    'AI Chat': 'Chat, explore local projects, and review code with AI.',
    'Testing Engine': 'Run DEVTEX static defect analysis against a selected project.',
    Reports: 'Review scan history and findings captured during this session.',
    Profile: 'View your connected GitHub profile and repositories.',
    Settings: 'Your DEVTEX workspace preferences.'
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const page = button.dataset.page as WorkspacePage | undefined
      if (!page) return
      if (page === 'Settings') {
        openSettings(activeSettingsSection)
        return
      }
      showPage(page, descriptions[page] || '')
      if (page !== 'Dashboard') {
        addActivity(`Opened ${page}`, 'Workspace navigation updated.')
      }
    })
  })
}

function showPage(page: WorkspacePage, description = ''): void {
  activeWorkspacePage = page
  const buttons = document.querySelectorAll<HTMLButtonElement>('.nav-item')
  const breadcrumb = document.getElementById('breadcrumb-page')
  const title = document.getElementById('page-title')
  const subtitle = document.getElementById('page-subtitle')
  const dashboard = document.getElementById('dashboard-view')
  const projectsView = document.getElementById('projects-view')
  const testingView = document.getElementById('testing-view')
  const reportsView = document.getElementById('reports-view')
  const settings = document.getElementById('settings-view')
  const aiChatView = document.getElementById('ai-chat-view')
  const profileView = document.getElementById('profile-view')

  buttons.forEach((button) => button.classList.toggle('active', button.dataset.page === page))
  if (breadcrumb) breadcrumb.textContent = page
  if (title) {
    title.textContent = page === 'Dashboard' ? '' : page
    if (page === 'Dashboard') title.innerHTML = 'Welcome to <span>DEVTEX.</span>'
  }
  if (subtitle) subtitle.textContent = description

  if (dashboard) dashboard.hidden = page !== 'Dashboard'
  if (projectsView) projectsView.hidden = page !== 'Projects'
  if (testingView) testingView.hidden = page !== 'Testing Engine'
  if (reportsView) reportsView.hidden = page !== 'Reports'
  if (settings) settings.hidden = page !== 'Settings'
  if (aiChatView) aiChatView.hidden = page !== 'AI Chat'
  if (profileView) profileView.hidden = page !== 'Profile'

  if (page === 'Projects') renderWorkspaceProjectsPage()
  if (page === 'Reports') renderReportsPage()

  if (page === 'AI Chat') {
    renderAIChatPage()
  } else if (page === 'Profile') {
    renderProfilePage()
  }
}

function setupProjects(): void {
  let projects: WorkspaceProject[] = []
  const count = document.getElementById('project-count')
  const list = document.getElementById('project-list')

  function renderProjects(): void {
    if (count) {
      count.textContent = String(projects.length).padStart(2, '0')
    }

    if (!list) return

    list.replaceChildren()

    if (projects.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'empty-state'

      const icon = document.createElement('div')
      icon.className = 'empty-icon'
      icon.textContent = '⌘'

      const heading = document.createElement('h3')
      heading.textContent = 'Your workspace starts here'

      const description = document.createElement('p')
      description.textContent = 'Add a local project to begin building with DEVTEX.'

      const button = document.createElement('button')
      button.className = 'button button-secondary'
      button.id = 'add-first-project'
      button.textContent = '＋ Add your first project'
      button.addEventListener('click', () => void handleAddProject())

      empty.append(icon, heading, description, button)
      list.append(empty)
      return
    }

    projects.forEach((project) => {
      const row = document.createElement('div')
      row.className = 'project-item'

      const symbol = document.createElement('div')
      symbol.className = 'project-symbol'
      symbol.textContent = '</>'

      const meta = document.createElement('div')
      meta.className = 'project-meta'

      const heading = document.createElement('strong')
      heading.textContent = project.name

      const description = document.createElement('span')
      description.textContent = project.path
      description.title = project.path

      const actions = document.createElement('div')
      actions.style.display = 'flex'
      actions.style.alignItems = 'center'
      actions.style.gap = '8px'

      const exploreBtn = document.createElement('button')
      exploreBtn.type = 'button'
      exploreBtn.className = 'button button-secondary'
      exploreBtn.style.padding = '5px 12px'
      exploreBtn.style.minHeight = '28px'
      exploreBtn.style.fontSize = '10px'
      exploreBtn.textContent = 'Explore with AI ↗'
      exploreBtn.title = `Explore ${project.name} using AI`
      exploreBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        activeAIProjectPath = project.path
        showPage('AI Chat', 'Chat, explore local projects, and review code with AI.')
      })

      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = 'text-button'
      removeBtn.style.padding = '5px 8px'
      removeBtn.style.minHeight = '28px'
      removeBtn.style.fontSize = '10px'
      removeBtn.textContent = 'Remove'
      removeBtn.title = 'Remove project from workspace'
      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (window.confirm(`Remove "${project.name}" from your DEVTEX workspace?`)) {
          try {
            projects = await window.api.removeProject(project.id)
            workspaceProjects = projects
            renderWorkspaceProjectsPage()
            if (activeAIProjectPath === project.path) {
              activeAIProjectPath = null
            }
            renderProjects()
            addActivity(`Removed project: ${project.name}`, 'Project removed from workspace.')
          } catch (error) {
            window.alert(error instanceof Error ? error.message : 'Could not remove project.')
          }
        }
      })

      meta.append(heading, description)
      actions.append(exploreBtn, removeBtn)
      row.append(symbol, meta, actions)
      list.append(row)
    })
  }

  async function handleAddProject(): Promise<void> {
    try {
      const updated = await window.api.chooseAndAddProject()
      if (!updated) return
      projects = updated
      workspaceProjects = projects
      renderProjects()
      renderWorkspaceProjectsPage()
      const newest = updated[0]
      if (newest) {
        addActivity(`Added project: ${newest.name}`, newest.path)
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not add project.')
    }
  }

  document.getElementById('new-project')?.addEventListener('click', () => void handleAddProject())
  document.getElementById('add-first-project')?.addEventListener('click', () => void handleAddProject())

  document.getElementById('view-projects')?.addEventListener('click', () => {
    document.querySelector<HTMLButtonElement>('[data-page="Projects"]')?.click()
  })

  void window.api
    .getProjects()
    .then((loaded) => {
      projects = loaded
      workspaceProjects = projects
      renderProjects()
      renderWorkspaceProjectsPage()
    })
    .catch(() => {
      renderProjects()
    })
}


function setupWorkspacePages(): void {
  const enginePanel = document.querySelector<HTMLElement>('.engine-panel')
  const engineHost = document.getElementById('testing-engine-content')
  if (enginePanel && engineHost) engineHost.append(enginePanel)

  document.getElementById('projects-add')?.addEventListener('click', () => {
    document.getElementById('new-project')?.click()
  })
  const search = document.getElementById('projects-search') as HTMLInputElement | null
  search?.addEventListener('input', () => renderWorkspaceProjectsPage(search.value))
  renderWorkspaceProjectsPage()
  renderReportsPage()
}

function renderWorkspaceProjectsPage(query = ''): void {
  const list = document.getElementById('workspace-project-list')
  const count = document.getElementById('workspace-project-count')
  if (!list) return
  if (count) count.textContent = String(workspaceProjects.length).padStart(2, '0')
  list.replaceChildren()
  const normalized = query.trim().toLowerCase()
  const filtered = workspaceProjects.filter((project) =>
    project.name.toLowerCase().includes(normalized) || project.path.toLowerCase().includes(normalized)
  )
  if (filtered.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'workspace-empty'
    const heading = document.createElement('h3')
    heading.textContent = workspaceProjects.length ? 'No matching projects' : 'No projects in this workspace'
    const detail = document.createElement('p')
    detail.textContent = workspaceProjects.length
      ? 'Try another project name or path.'
      : 'Add a local repository or project folder to start working with DEVTEX.'
    empty.append(heading, detail)
    list.append(empty)
    return
  }
  filtered.forEach((project) => {
    const row = document.createElement('article')
    row.className = 'workspace-project-row'
    const identity = document.createElement('div')
    identity.className = 'workspace-project-identity'
    const icon = document.createElement('span')
    icon.className = 'workspace-project-icon'
    icon.textContent = '</>'
    const copy = document.createElement('div')
    const name = document.createElement('strong')
    name.textContent = project.name
    const path = document.createElement('code')
    path.textContent = project.path
    path.title = project.path
    copy.append(name, path)
    identity.append(icon, copy)
    const actions = document.createElement('div')
    actions.className = 'workspace-project-actions'
    const scan = document.createElement('button')
    scan.type = 'button'
    scan.className = 'button button-secondary'
    scan.textContent = 'Test project'
    scan.addEventListener('click', () => {
      showPage('Testing Engine', 'Run DEVTEX static defect analysis against a selected project.')
      const selector = document.getElementById('engine-project-select') as HTMLSelectElement | null
      if (selector) selector.value = project.path
    })
    const explore = document.createElement('button')
    explore.type = 'button'
    explore.className = 'button button-secondary'
    explore.textContent = 'Explore with AI'
    explore.addEventListener('click', () => {
      activeAIProjectPath = project.path
      showPage('AI Chat', 'Chat, explore local projects, and review code with AI.')
    })
    actions.append(scan, explore)
    row.append(identity, actions)
    list.append(row)
  })
}

function renderReportsPage(): void {
  const list = document.getElementById('reports-list')
  const total = document.getElementById('reports-total')
  const issues = document.getElementById('reports-issues')
  if (!list) return
  if (total) total.textContent = String(scanReports.length).padStart(2, '0')
  if (issues) issues.textContent = String(scanReports.reduce((sum, report) => sum + report.issueCount, 0))
  list.replaceChildren()
  if (!scanReports.length) {
    const empty = document.createElement('div')
    empty.className = 'workspace-empty'
    const heading = document.createElement('h3')
    heading.textContent = 'No scan reports yet'
    const detail = document.createElement('p')
    detail.textContent = 'Run a project scan in Testing Engine. Completed scans will appear here for this app session.'
    empty.append(heading, detail)
    list.append(empty)
    return
  }
  [...scanReports].reverse().forEach((report) => {
    const row = document.createElement('article')
    row.className = 'report-row'
    const main = document.createElement('div')
    const title = document.createElement('strong')
    title.textContent = report.projectName
    const summary = document.createElement('p')
    summary.textContent = report.summary
    const time = document.createElement('time')
    time.textContent = report.createdAt.toLocaleString()
    main.append(title, summary, time)
    const counts = document.createElement('div')
    counts.className = 'report-counts'
    const total = document.createElement('strong')
    total.textContent = String(report.issueCount)
    const label = document.createElement('span')
    label.textContent = 'findings'
    const severity = document.createElement('small')
    severity.textContent = `Critical ${report.critical} · Warning ${report.warning} · Info ${report.info}`
    counts.append(total, label, severity)
    row.append(main, counts)
    list.append(row)
  })
}

interface CodeEditBlock {
  raw: string
  filePath: string
  type: 'patch' | 'write'
  searchSnippet?: string
  replaceSnippet?: string
  newContent?: string
}

function parseCodeEditBlocks(text: string): {
  segments: Array<{ isEdit: boolean; text?: string; edit?: CodeEditBlock }>
} {
  const segments: Array<{ isEdit: boolean; text?: string; edit?: CodeEditBlock }> = []
  const blockRegex = /```(?:devtex-edit|devtex-write:?([^\n]*))\s*([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = blockRegex.exec(text)) !== null) {
    const startIdx = match.index
    if (startIdx > lastIndex) {
      segments.push({ isEdit: false, text: text.slice(lastIndex, startIdx) })
    }

    const fullMatch = match[0]
    const writeArg = match[1]?.trim()
    const blockBody = match[2]

    if (writeArg || fullMatch.startsWith('```devtex-write')) {
      let filePath = writeArg || ''
      let fileContent = blockBody
      if (!filePath) {
        const fileMatch = /^file:\s*([^\n]+)/m.exec(blockBody)
        if (fileMatch) {
          filePath = fileMatch[1].trim()
          fileContent = blockBody.replace(/^file:[^\n]+\n?/, '')
        }
      }
      if (filePath) {
        segments.push({
          isEdit: true,
          edit: {
            raw: fullMatch,
            filePath,
            type: 'write',
            newContent: fileContent.trim()
          }
        })
      } else {
        segments.push({ isEdit: false, text: fullMatch })
      }
    } else {
      const fileMatch = /^file:\s*([^\n]+)/m.exec(blockBody)
      const filePath = fileMatch ? fileMatch[1].trim() : ''

      if (filePath && blockBody.includes('<<<<<<< SEARCH') && blockBody.includes('=======')) {
        const searchPart = blockBody.split('<<<<<<< SEARCH')[1]?.split('=======')[0] || ''
        const replacePart = blockBody.split('=======')[1]?.split('>>>>>>>')[0] || ''
        segments.push({
          isEdit: true,
          edit: {
            raw: fullMatch,
            filePath,
            type: 'patch',
            searchSnippet: searchPart.replace(/^\r?\n/, '').replace(/\r?\n$/, ''),
            replaceSnippet: replacePart.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
          }
        })
      } else if (filePath && blockBody.includes('search:') && blockBody.includes('replace:')) {
        const searchPart = blockBody.split('search:')[1]?.split('replace:')[0] || ''
        const replacePart = blockBody.split('replace:')[1] || ''
        segments.push({
          isEdit: true,
          edit: {
            raw: fullMatch,
            filePath,
            type: 'patch',
            searchSnippet: searchPart.trim(),
            replaceSnippet: replacePart.trim()
          }
        })
      } else if (filePath) {
        const content = blockBody.replace(/^file:[^\n]+\n?/, '').trim()
        segments.push({
          isEdit: true,
          edit: {
            raw: fullMatch,
            filePath,
            type: 'write',
            newContent: content
          }
        })
      } else {
        segments.push({ isEdit: false, text: fullMatch })
      }
    }

    lastIndex = match.index + fullMatch.length
  }

  if (lastIndex < text.length) {
    segments.push({ isEdit: false, text: text.slice(lastIndex) })
  }

  return { segments }
}

function createEditCard(edit: CodeEditBlock, targetProjectPath?: string): HTMLElement {
  const card = document.createElement('div')
  card.className = 'devtex-edit-card'

  const header = document.createElement('div')
  header.className = 'devtex-edit-header'

  const fileInfo = document.createElement('div')
  fileInfo.className = 'devtex-edit-file'
  fileInfo.textContent = `📝 ${edit.filePath}`

  const statusBadge = document.createElement('span')
  statusBadge.className = 'devtex-status-badge pending'
  statusBadge.textContent = 'Pending Approval'

  header.append(fileInfo, statusBadge)
  card.append(header)

  const diffContainer = document.createElement('div')
  diffContainer.className = 'devtex-diff-container'

  if (edit.type === 'patch') {
    const meta = document.createElement('div')
    meta.className = 'devtex-diff-line meta'
    meta.textContent = `@@ Proposed Modification in ${edit.filePath} @@`
    diffContainer.append(meta)

    const searchLines = (edit.searchSnippet || '').split('\n')
    searchLines.forEach((l) => {
      const line = document.createElement('div')
      line.className = 'devtex-diff-line deletion'
      line.textContent = `- ${l}`
      diffContainer.append(line)
    })

    const replaceLines = (edit.replaceSnippet || '').split('\n')
    replaceLines.forEach((l) => {
      const line = document.createElement('div')
      line.className = 'devtex-diff-line addition'
      line.textContent = `+ ${l}`
      diffContainer.append(line)
    })
  } else {
    const meta = document.createElement('div')
    meta.className = 'devtex-diff-line meta'
    meta.textContent = `+++ New / Rewritten File: ${edit.filePath} +++`
    diffContainer.append(meta)

    const writeLines = (edit.newContent || '').split('\n')
    writeLines.forEach((l) => {
      const line = document.createElement('div')
      line.className = 'devtex-diff-line addition'
      line.textContent = `+ ${l}`
      diffContainer.append(line)
    })
  }

  card.append(diffContainer)

  const actions = document.createElement('div')
  actions.className = 'devtex-edit-actions'

  const prompt = document.createElement('span')
  prompt.className = 'devtex-edit-prompt'
  prompt.textContent = '⚠️ Ask Before Changing: Review diff before writing to disk'

  const btnGroup = document.createElement('div')
  btnGroup.className = 'devtex-btn-group'

  const applyBtn = document.createElement('button')
  applyBtn.type = 'button'
  applyBtn.className = 'devtex-apply-btn'
  applyBtn.textContent = 'Apply Changes'

  const discardBtn = document.createElement('button')
  discardBtn.type = 'button'
  discardBtn.className = 'devtex-discard-btn'
  discardBtn.textContent = 'Discard'

  applyBtn.addEventListener('click', async () => {
    if (!targetProjectPath) {
      alert('No workspace project is currently selected. Select a project in the selector above to apply file changes.')
      return
    }

    const confirmed = window.confirm(
      `Confirm Code Modification:\n\nApply changes to "${edit.filePath}" in project?\n\nA backup copy (.devtex.bak) will be created before saving.`
    )
    if (!confirmed) return

    applyBtn.disabled = true
    applyBtn.textContent = 'Applying...'

    try {
      const result = await window.api.applyProjectFileEdit({
        projectPath: targetProjectPath,
        filePath: edit.filePath,
        searchSnippet: edit.searchSnippet,
        replaceSnippet: edit.replaceSnippet,
        newContent: edit.newContent
      })

      if (result.success) {
        statusBadge.className = 'devtex-status-badge applied'
        statusBadge.textContent = '✔ Applied to disk'
        prompt.textContent = `Saved to disk! Backup created at ${result.backupPath || 'backup file'}`
        applyBtn.remove()
        discardBtn.remove()
        addActivity('Code change applied', `Updated ${edit.filePath} on disk with AI fix`)
      } else {
        applyBtn.disabled = false
        applyBtn.textContent = 'Retry Apply'
        prompt.style.color = '#ef4444'
        prompt.textContent = `Failed: ${result.error || 'Could not apply change'}`
      }
    } catch (err) {
      applyBtn.disabled = false
      applyBtn.textContent = 'Retry Apply'
      prompt.style.color = '#ef4444'
      prompt.textContent = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
    }
  })

  discardBtn.addEventListener('click', () => {
    statusBadge.className = 'devtex-status-badge rejected'
    statusBadge.textContent = 'Discarded'
    prompt.textContent = 'Change rejected by user.'
    applyBtn.remove()
    discardBtn.remove()
  })

  btnGroup.append(applyBtn, discardBtn)
  actions.append(prompt, btnGroup)
  card.append(actions)

  return card
}

function openAIChatWithFixPrompt(
  projectPath: string,
  bug: { file: string; line?: number; title: string; description: string }
): void {
  activeAIProjectPath = projectPath
  showPage('AI Chat', 'Chat, explore local projects, and review code with AI.')
  const input = document.getElementById('gemini-chat-input') as HTMLTextAreaElement | null
  const projectSelector = document.getElementById('ai-chat-project') as HTMLSelectElement | null
  const modeSelect = document.getElementById('ai-chat-mode') as HTMLSelectElement | null

  if (projectSelector) {
    projectSelector.value = projectPath
  }
  if (modeSelect) {
    modeSelect.value = 'bug-fix'
  }
  if (input) {
    input.value = `Fix the bug in ${bug.file}${bug.line ? ` at line ${bug.line}` : ''}: "${bug.title}".\nDetails: ${bug.description}\nPlease provide the exact code modification inside a devtex-edit block.`
    input.focus()
  }
}

function setupTestingEngine(): void {
  const button = document.getElementById('run-scan') as HTMLButtonElement | null
  const result = document.getElementById('scan-result')
  const projectSelect = document.getElementById('engine-project-select') as HTMLSelectElement | null

  async function populateProjects(): Promise<void> {
    if (!projectSelect) return
    try {
      const projects = await window.api.getProjects()
      projectSelect.replaceChildren()
      if (projects.length === 0) {
        const opt = document.createElement('option')
        opt.value = ''
        opt.textContent = 'No local projects added yet'
        projectSelect.append(opt)
        return
      }
      projects.forEach((p, idx) => {
        const opt = document.createElement('option')
        opt.value = p.path
        opt.textContent = `Project: ${p.name}`
        if (activeAIProjectPath ? activeAIProjectPath === p.path : idx === 0) {
          opt.selected = true
        }
        projectSelect.append(opt)
      })
    } catch {
      // ignore
    }
  }

  void populateProjects()

  button?.addEventListener('click', async () => {
    if (!button || !result) return
    const targetPath = projectSelect?.value || activeAIProjectPath
    if (!targetPath) {
      result.textContent = 'Please add or select a workspace project first.'
      return
    }

    button.disabled = true
    button.textContent = 'Scanning code for bugs...'
    result.replaceChildren()

    const loadingP = document.createElement('p')
    loadingP.className = 'gemini-chat-pending'
    loadingP.textContent = 'Inspecting project files, running static defect checks and AI analysis...'
    result.append(loadingP)

    try {
      const scanRes = await window.api.scanProjectForBugs(targetPath)
      result.replaceChildren()

      scanReports.push({
        id: Date.now(),
        projectName: projectSelect?.selectedOptions[0]?.textContent?.replace(/^Project: /, '') || targetPath.split(/[\\\\/]/).filter(Boolean).pop() || targetPath,
        projectPath: targetPath,
        summary: scanRes.summary,
        issueCount: scanRes.bugs.length,
        critical: scanRes.bugs.filter((bug) => bug.severity === 'critical').length,
        warning: scanRes.bugs.filter((bug) => bug.severity === 'warning').length,
        info: scanRes.bugs.filter((bug) => bug.severity === 'info').length,
        createdAt: new Date()
      })
      renderReportsPage()
      const summaryDiv = document.createElement('div')
      summaryDiv.style.marginBottom = '12px'
      summaryDiv.style.padding = '8px 12px'
      summaryDiv.style.borderRadius = '6px'
      summaryDiv.style.background = 'rgba(139, 106, 255, 0.12)'
      summaryDiv.style.border = '1px solid rgba(139, 106, 255, 0.3)'
      summaryDiv.style.fontSize = '11px'
      summaryDiv.style.color = '#e2e8f0'
      summaryDiv.textContent = scanRes.summary
      result.append(summaryDiv)

      if (scanRes.bugs.length === 0) {
        const emptyState = document.createElement('p')
        emptyState.className = 'gemini-chat-empty'
        emptyState.textContent = 'No critical bugs or syntax defects discovered in scanned files.'
        result.append(emptyState)
      } else {
        const bugList = document.createElement('div')
        bugList.className = 'engine-scan-results'

        scanRes.bugs.forEach((bug) => {
          const card = document.createElement('div')
          card.className = `bug-card ${bug.severity}`

          const header = document.createElement('div')
          header.className = 'bug-header'

          const titleWrap = document.createElement('div')
          titleWrap.className = 'bug-title-wrap'

          const badge = document.createElement('span')
          badge.className = `bug-severity ${bug.severity}`
          badge.textContent = bug.severity

          const titleEl = document.createElement('span')
          titleEl.className = 'bug-title'
          titleEl.textContent = bug.title

          titleWrap.append(badge, titleEl)

          const fileEl = document.createElement('span')
          fileEl.className = 'bug-file'
          fileEl.textContent = `${bug.file}${bug.line ? `:${bug.line}` : ''}`

          header.append(titleWrap, fileEl)

          const desc = document.createElement('p')
          desc.className = 'bug-desc'
          desc.textContent = bug.description

          card.append(header, desc)

          if (bug.snippet) {
            const snip = document.createElement('div')
            snip.className = 'bug-snippet'
            snip.textContent = bug.snippet
            card.append(snip)
          }

          if (bug.suggestedFix) {
            const fixHint = document.createElement('p')
            fixHint.style.fontSize = '10px'
            fixHint.style.color = '#86efac'
            fixHint.style.margin = '2px 0 0'
            fixHint.textContent = `Suggested Fix: ${bug.suggestedFix}`
            card.append(fixHint)
          }

          const fixBtn = document.createElement('button')
          fixBtn.type = 'button'
          fixBtn.className = 'bug-fix-btn'
          fixBtn.textContent = 'Fix with AI ✦'
          fixBtn.addEventListener('click', () => {
            openAIChatWithFixPrompt(targetPath, bug)
          })

          card.append(fixBtn)
          bugList.append(card)
        })

        result.append(bugList)
      }

      addActivity('Bug scan completed', scanRes.summary)
    } catch (err) {
      result.replaceChildren()
      const errP = document.createElement('p')
      errP.style.color = '#ef4444'
      errP.style.fontSize = '11px'
      errP.textContent = err instanceof Error ? err.message : 'Bug scan failed.'
      result.append(errP)
    } finally {
      button.disabled = false
      button.textContent = 'Scan Project for Bugs 🔍'
    }
  })
}

function setupGitHubRepositories(): void {
  const connectButton = document.getElementById('connect-github')
  const refreshButton = document.getElementById('github-refresh') as HTMLButtonElement | null
  const disconnectButton = document.getElementById('github-disconnect') as HTMLButtonElement | null
  const searchInput = document.getElementById('github-repository-search') as HTMLInputElement | null
  const statusLabel = document.getElementById('github-connection-label')
  const message = document.getElementById('github-repository-message')
  const count = document.getElementById('github-repository-count')
  const list = document.getElementById('github-repository-list')
  let connection: GitHubConnectionStatus = { connected: false, connecting: false }
  let repositories: GitHubRepository[] = []
  let loading = false

  function setMessage(value: string, kind = ''): void {
    if (!message) return
    message.textContent = value
    message.dataset.kind = kind
  }

  function renderRepositories(): void {
    currentGitHubStatus = connection
    if (activeSettingsSection === 'integrations' || activeSettingsSection === 'diagnostics') {
      renderSettingsSection(activeSettingsSection)
    }
    if (statusLabel) {
      statusLabel.textContent = connection.connecting
        ? 'Waiting for GitHub authorization'
        : connection.connected
          ? `Connected as @${connection.username ?? 'GitHub user'}`
          : 'Not connected'
    }
    if (connectButton) {
      connectButton.textContent = connection.connected ? 'GitHub connected' : 'Connect GitHub'
      ;(connectButton as HTMLButtonElement).disabled = connection.connecting || loading
    }
    if (refreshButton) refreshButton.disabled = !connection.connected || loading
    if (disconnectButton)
      disconnectButton.disabled = !connection.connected && !connection.connecting
    if (searchInput) searchInput.disabled = !connection.connected
    if (!list) return

    list.replaceChildren()
    if (!connection.connected) {
      if (count) count.textContent = ''
      return
    }

    const query = searchInput?.value.trim().toLowerCase() ?? ''
    const filtered = repositories.filter((repository) =>
      `${repository.fullName} ${repository.description ?? ''} ${repository.language ?? ''}`
        .toLowerCase()
        .includes(query)
    )
    if (count) {
      count.textContent = `${filtered.length} of ${repositories.length} ${repositories.length === 1 ? 'repository' : 'repositories'}`
    }

    if (filtered.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'github-repository-empty'
      empty.textContent =
        repositories.length === 0
          ? 'No repositories are available for the connected GitHub account.'
          : 'No repositories match your search.'
      list.append(empty)
      return
    }

    filtered.forEach((repository) => {
      const row = document.createElement('article')
      row.className = 'github-repository-row'

      const details = document.createElement('div')
      details.className = 'github-repository-details'
      const name = document.createElement('button')
      name.className = 'github-repository-name'
      name.type = 'button'
      name.textContent = repository.fullName
      name.title = `Open ${repository.fullName} on GitHub`
      name.addEventListener('click', () => {
        void window.api.openGitHubRepository(repository.url).catch((error: unknown) => {
          setMessage(
            error instanceof Error ? error.message : 'Could not open this repository.',
            'error'
          )
        })
      })

      const summary = document.createElement('span')
      summary.textContent = repository.description || 'No description'
      details.append(name, summary)

      const metadata = document.createElement('div')
      metadata.className = 'github-repository-metadata'
      const visibility = document.createElement('span')
      visibility.className = `repository-visibility ${repository.visibility}`
      visibility.textContent = repository.visibility
      metadata.append(visibility)
      if (repository.language) {
        const language = document.createElement('span')
        language.textContent = repository.language
        metadata.append(language)
      }
      if (repository.defaultBranch) {
        const branch = document.createElement('span')
        branch.textContent = repository.defaultBranch
        metadata.append(branch)
      }

      row.append(details, metadata)
      list.append(row)
    })
  }

  async function loadRepositories(): Promise<void> {
    if (loading) return
    loading = true
    setMessage('Loading repositories...')
    renderRepositories()
    try {
      const result = await window.api.getGitHubRepositories()
      connection = {
        connected: result.connected,
        connecting: result.connecting,
        ...(result.username ? { username: result.username } : {}),
        ...(result.message ? { message: result.message } : {})
      }
      repositories = result.repositories
      currentGitHubRepositories = result.repositories
      if (result.connected) {
        try {
          currentGitHubProfile = await window.api.getGitHubProfile()
        } catch {
          currentGitHubProfile = null
        }
      } else {
        currentGitHubProfile = null
      }
      updateAvatarUI()
      updateProfileMenuIdentity()
      if (activeWorkspacePage === 'Profile') {
        renderProfilePage()
      }
      setMessage(
        result.connected
          ? result.repositories.length === 0
            ? 'No repositories were returned by GitHub.'
            : `Showing repositories available to @${currentGitHubProfile?.username ?? result.username}.`
          : result.message || 'Connect GitHub to list accessible repositories.',
        result.connected && result.repositories.length > 0 ? 'success' : ''
      )
    } catch (error) {
      repositories = []
      currentGitHubRepositories = []
      currentGitHubProfile = null
      connection = { connected: false, connecting: false }
      currentGitHubStatus = { connected: false, connecting: false }
      updateAvatarUI()
      updateProfileMenuIdentity()
      if (activeWorkspacePage === 'Profile') {
        renderProfilePage()
      }
      setMessage(
        error instanceof Error ? error.message : 'Could not load GitHub repositories.',
        'error'
      )
    } finally {
      loading = false
      renderRepositories()
    }
  }

  connectButton?.addEventListener('click', () => {
    if (connection.connected) {
      showPage('Profile', 'View your connected GitHub profile and repositories.')
      return
    }
    if (connection.connecting) return
    connection = { connected: false, connecting: true }
    setMessage('GitHub will open in your browser. Follow the one-time authorization prompt.')
    renderRepositories()
    void window.api
      .connectGitHubRepositories()
      .then((status) => {
        connection = status
        currentGitHubStatus = status
        setMessage(
          status.message ||
            (status.connected
              ? `Connected as @${status.username}.`
              : 'Waiting for GitHub authorization.')
        )
        renderRepositories()
        if (status.connected) void loadRepositories()
      })
      .catch((error: unknown) => {
        connection = { connected: false, connecting: false }
        currentGitHubStatus = { connected: false, connecting: false }
        setMessage(error instanceof Error ? error.message : 'Could not connect to GitHub.', 'error')
        renderRepositories()
      })
  })

  refreshButton?.addEventListener('click', () => void loadRepositories())
  searchInput?.addEventListener('input', renderRepositories)
  disconnectButton?.addEventListener('click', () => {
    if (!window.confirm('Disconnect GitHub and remove its saved credential from this device?')) {
      return
    }
    void window.api
      .disconnectGitHubRepositories()
      .then((status) => {
        connection = status
        currentGitHubStatus = status
        repositories = []
        currentGitHubRepositories = []
        currentGitHubProfile = null
        updateAvatarUI()
        updateProfileMenuIdentity()
        if (activeWorkspacePage === 'Profile') renderProfilePage()
        setMessage('GitHub credential removed from this device.')
        renderRepositories()
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Could not disconnect GitHub.', 'error')
      })
  })

  window.api.onGitHubConnectionChanged((status) => {
    connection = status
    currentGitHubStatus = status
    if (!status.connected) {
      repositories = []
      currentGitHubRepositories = []
      currentGitHubProfile = null
      updateAvatarUI()
      updateProfileMenuIdentity()
      if (activeWorkspacePage === 'Profile') renderProfilePage()
    }
    setMessage(status.message || (status.connected ? `Connected as @${status.username}.` : ''))
    renderRepositories()
    if (status.connected) void loadRepositories()
  })

  void loadRepositories()
}

function setupAuthentication(): void {
  const modal = document.getElementById('auth-modal')
  const signInButton = document.getElementById('sign-in')
  const closeButton = document.getElementById('close-auth')
  const googleButton = document.getElementById('google-sign-in')
  const githubButton = document.getElementById('github-sign-in')
  const authFootnote = document.querySelector<HTMLElement>('.auth-footnote')

  function showAuthMessage(message: string): void {
    if (authFootnote) authFootnote.textContent = message
  }

  function openModal(): void {
    if (modal) modal.hidden = false
    closeButton?.focus()
  }

  function closeModal(): void {
    if (modal) modal.hidden = true
    signInButton?.focus()
  }

  async function signInWithProvider(provider: 'google' | 'github'): Promise<void> {
    if (!supabase) {
      showAuthMessage(
        'Supabase is not configured. Add the project URL and publishable key to .env.'
      )
      return
    }

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: 'devtex://auth/callback',
          ...(provider === 'github' ? { scopes: 'read:user user:email' } : {}),
          skipBrowserRedirect: true
        }
      })

      if (error) throw error

      if (!data.url) {
        throw new Error('Supabase did not return an OAuth URL.')
      }

      await window.api.openExternal(data.url)
      addActivity(
        `${provider === 'google' ? 'Google' : 'GitHub'} sign-in started`,
        'Finish authentication in your browser.'
      )
    } catch (error) {
      void error
      window.alert('Sign-in could not start. Check your Supabase configuration and try again.')
    }
  }

  async function completeAuth(callbackUrl: string): Promise<void> {
    if (!supabase) return

    const callback = new URL(callbackUrl)
    const providerError = callback.searchParams.get('error_description')
    if (providerError) {
      showAuthMessage(providerError)
      return
    }

    const code = callback.searchParams.get('code')
    if (!code) {
      showAuthMessage('Sign-in callback did not include an authorization code.')
      return
    }

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      showAuthMessage('Sign-in could not be completed. Restart the sign-in flow and try again.')
      return
    }

    if (modal) modal.hidden = true
    addActivity('Signed in', 'Your Supabase session is ready.')
  }

  function updateAccount(email?: string): void {
    currentAccountEmail = email || null
    const signedIn = Boolean(email)
    if (signInButton) signInButton.textContent = signedIn ? 'Sign out' : 'Sign in'
    updateAvatarUI()
    updateProfileMenuIdentity()
    if (activeWorkspacePage === 'Profile') {
      renderProfilePage()
    }
    if (
      activeSettingsSection === 'account' ||
      activeSettingsSection === 'integrations' ||
      activeSettingsSection === 'diagnostics'
    ) {
      renderSettingsSection(activeSettingsSection)
    }
  }

  signInButton?.addEventListener('click', () => {
    if (!supabase) {
      openModal()
      showAuthMessage(
        'Supabase is not configured. Add the project URL and publishable key to .env.'
      )
      return
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        if (window.confirm('Sign out of your DEVTEX account?')) void supabase.auth.signOut()
      } else openModal()
    })
  })

  closeButton?.addEventListener('click', closeModal)

  modal?.addEventListener('click', (event: MouseEvent) => {
    if (event.target === modal) closeModal()
  })

  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape' && modal && !modal.hidden) {
      closeModal()
    }
  })

  googleButton?.addEventListener('click', () => {
    void signInWithProvider('google')
  })

  githubButton?.addEventListener('click', () => {
    void signInWithProvider('github')
  })

  window.api.onAuthCallback((callbackUrl) => {
    void completeAuth(callbackUrl).catch((error: unknown) => {
      void error
      showAuthMessage('Sign-in could not be completed. Restart the sign-in flow and try again.')
    })
  })

  if (supabase) {
    void supabase.auth.getSession().then(({ data, error }) => {
      void error
      updateAccount(data.session?.user.email)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      updateAccount(session?.user.email)
    })
  } else {
    updateAccount()
  }
}

init()

function updateAvatarUI(): void {
  const avatar = document.getElementById('user-avatar')
  if (!avatar) return
  if (currentGitHubProfile?.avatarUrl) {
    avatar.replaceChildren()
    const img = document.createElement('img')
    img.className = 'avatar-img'
    img.src = currentGitHubProfile.avatarUrl
    img.alt = `@${currentGitHubProfile.username}`
    avatar.append(img)
    avatar.title = currentGitHubProfile.displayName
      ? `${currentGitHubProfile.displayName} (@${currentGitHubProfile.username})`
      : `@${currentGitHubProfile.username}`
  } else if (currentAccountEmail) {
    avatar.replaceChildren()
    avatar.textContent = currentAccountEmail.charAt(0).toUpperCase()
    avatar.title = currentAccountEmail
  } else {
    avatar.replaceChildren()
    avatar.innerHTML = `<svg class="avatar-fallback-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
    avatar.title = 'Developer Profile & Settings'
  }
}

function updateProfileMenuIdentity(): void {
  const identity = document.getElementById('profile-menu-identity')
  const status = document.getElementById('profile-menu-status')
  if (currentGitHubProfile) {
    if (identity) {
      identity.textContent = currentGitHubProfile.displayName
        ? `${currentGitHubProfile.displayName} (@${currentGitHubProfile.username})`
        : `@${currentGitHubProfile.username}`
    }
    if (status) {
      status.textContent = `GitHub connected · ${currentGitHubRepositories.length} repos available`
    }
  } else {
    if (identity) identity.textContent = currentAccountEmail || 'Signed out'
    if (status) status.textContent = currentAccountEmail ? 'Supabase account' : 'No account connected'
  }
}

function setupProfileMenu(): void {
  const trigger = document.getElementById('user-avatar') as HTMLButtonElement | null
  const menu = document.getElementById('profile-menu')
  const control = document.querySelector('.profile-control')
  if (!trigger || !menu || !control) return
  updateAvatarUI()
  updateProfileMenuIdentity()

  const items = (): HTMLButtonElement[] =>
    Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
  const closeMenu = (restoreFocus = false): void => {
    menu.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    if (restoreFocus) trigger.focus()
  }
  const openMenu = (): void => {
    menu.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    items()[0]?.focus()
  }

  trigger.addEventListener('click', () => {
    if (menu.hidden) openMenu()
    else closeMenu()
  })

  document.getElementById('menu-view-profile')?.addEventListener('click', () => {
    showPage('Profile', 'View your connected GitHub profile and repositories.')
    closeMenu()
  })
  document.getElementById('menu-open-chat')?.addEventListener('click', () => {
    showPage('AI Chat', 'Chat, explore local projects, and review code with AI.')
    closeMenu()
  })

  menu.addEventListener('click', (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof HTMLButtonElement)) return
    const section = target.dataset.settingSection as SettingsSection | undefined
    if (section) openSettings(section)
    closeMenu()
  })
  document.addEventListener('pointerdown', (event: PointerEvent) => {
    if (!menu.hidden && event.target instanceof Node && !control.contains(event.target)) {
      closeMenu()
    }
  })
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (menu.hidden) return
    const menuItems = items()
    const index = menuItems.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const offset = event.key === 'ArrowDown' ? 1 : -1
      menuItems[(index + offset + menuItems.length) % menuItems.length]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      menuItems[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      menuItems.at(-1)?.focus()
    } else if (event.key === 'Tab') {
      closeMenu()
    }
  })
}

function setupSettings(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-setting-section]').forEach((button) => {
    if (button.closest('#profile-menu')) return
    button.addEventListener('click', () => {
      const section = button.dataset.settingSection as SettingsSection | undefined
      if (section) openSettings(section)
    })
  })
}

function openSettings(section: SettingsSection): void {
  activeSettingsSection = section
  showPage('Settings', 'Account, integrations, and application preferences.')
  const description = document.getElementById('settings-description')
  if (description) description.textContent = settingsDescriptions[section]
  document
    .querySelectorAll<HTMLButtonElement>('.settings-navigation [data-setting-section]')
    .forEach((button) => {
      const selected = button.dataset.settingSection === section
      button.classList.toggle('active', selected)
      button.setAttribute('aria-current', selected ? 'page' : 'false')
    })
  renderSettingsSection(section)
  document.querySelector<HTMLElement>('#settings-panel h2')?.focus()
}

function createInfoRow(label: string, value: string, detail?: string): HTMLElement {
  const row = document.createElement('div')
  row.className = 'settings-info-row'
  const copy = document.createElement('div')
  const heading = document.createElement('strong')
  heading.textContent = label
  copy.append(heading)
  if (detail) {
    const help = document.createElement('p')
    help.textContent = detail
    copy.append(help)
  }
  const state = document.createElement('span')
  state.className = 'settings-state'
  state.textContent = value
  row.append(copy, state)
  return row
}

function appendSettingsHeader(panel: HTMLElement, section: SettingsSection): void {
  const heading = document.createElement('h2')
  heading.textContent = settingsTitles[section]
  heading.tabIndex = -1
  const description = document.createElement('p')
  description.className = 'settings-help'
  description.textContent = settingsDescriptions[section]
  panel.append(heading, description)
}

function renderSettingsSection(section: SettingsSection): void {
  const panel = document.getElementById('settings-panel')
  if (!panel) return
  panel.replaceChildren()
  appendSettingsHeader(panel, section)

  if (section === 'account') {
    panel.append(
      createInfoRow('Supabase authentication', currentAccountEmail ? 'Signed in' : 'Not signed in'),
      createInfoRow('Account identity', currentAccountEmail || 'No account identity available')
    )
    const action = document.createElement('button')
    action.type = 'button'
    action.className = 'button button-secondary settings-action'
    action.textContent = currentAccountEmail ? 'Sign out' : 'Sign in'
    action.addEventListener('click', () => {
      const authButton = document.getElementById('sign-in') as HTMLButtonElement | null
      authButton?.click()
    })
    panel.append(action)
    return
  }

  if (section === 'api') {
    renderGeminiConfiguration(panel)
    return
  }

  if (section === 'chat') {
    showPage('AI Chat', 'Chat, explore local projects, and review code with AI.')
    return
  }

  if (section === 'runtime' || section === 'about' || section === 'diagnostics') {
    if (!currentRuntimeInfo) {
      const loading = document.createElement('p')
      loading.className = 'settings-help'
      loading.textContent = 'Loading sanitized runtime information…'
      panel.append(loading)
      return
    }
    const info = currentRuntimeInfo
    if (section === 'about') {
      panel.append(
        createInfoRow('Application', 'DEVTEX Desktop'),
        createInfoRow('Version', info.appVersion)
      )
    }
    panel.append(
      createInfoRow('Environment', info.environment),
      createInfoRow('Electron', info.electronVersion),
      createInfoRow('Chromium', info.chromiumVersion),
      createInfoRow('Node.js', info.nodeVersion)
    )
    if (section !== 'about') {
      panel.append(
        createInfoRow('Supabase project URL', configurationLabel(info.supabaseUrlStatus)),
        createInfoRow(
          'Supabase publishable key',
          configurationLabel(info.supabasePublishableKeyStatus)
        ),
        createInfoRow('GitHub OAuth Client ID', configurationLabel(info.githubOAuthClientStatus)),
        createInfoRow(currentAIStatus.providerLabel, aiCredentialLabel(), `Model: ${currentAIStatus.model}`)
      )
    }
    if (section === 'diagnostics') {
      panel.append(
        createInfoRow('GitHub repository authorization', connectionLabel(currentGitHubStatus)),
        createInfoRow('Supabase session', currentAccountEmail ? 'Signed in' : 'Not signed in')
      )
      const note = document.createElement('p')
      note.className = 'settings-notice'
      note.textContent =
        'This build does not retain a safe application error history. No security audit is implied by these status checks.'
      panel.append(note)
    }
    if (section === 'runtime') {
      const restart = document.createElement('p')
      restart.className = 'settings-notice'
      restart.textContent =
        'Environment configuration is read when the app starts. Changes to .env require a restart; this page never edits that file.'
      panel.append(restart)
    }
    return
  }

  if (section === 'integrations') {
    const githubStatus = currentGitHubStatus.connecting
      ? 'Testing'
      : currentGitHubStatus.connected
        ? `Connected${currentGitHubStatus.username ? ` as @${currentGitHubStatus.username}` : ''}`
        : 'Not connected'
    panel.append(
      createInfoRow(
        'GitHub repositories',
        githubStatus,
        'Separate GitHub Device Flow authorization; not the same as Supabase sign-in.'
      ),
      createInfoRow(
        'Supabase authentication',
        currentAccountEmail ? 'Connected' : 'Not connected',
        'Reflects the current authentication session only; no database health check was performed.'
      ),
      createInfoRow(currentAIStatus.providerLabel, aiCredentialLabel(), `Model: ${currentAIStatus.model}`)
    )
    const actions = document.createElement('div')
    actions.className = 'settings-actions'
    const githubAction = document.createElement('button')
    githubAction.type = 'button'
    githubAction.className = 'button button-secondary'
    githubAction.textContent = currentGitHubStatus.connected
      ? 'Refresh repositories'
      : 'Connect GitHub'
    githubAction.addEventListener('click', () => {
      document
        .getElementById(currentGitHubStatus.connected ? 'github-refresh' : 'connect-github')
        ?.click()
    })
    actions.append(githubAction)
    if (currentGitHubStatus.connected || currentGitHubStatus.connecting) {
      const disconnect = document.createElement('button')
      disconnect.type = 'button'
      disconnect.className = 'button button-secondary'
      disconnect.textContent = 'Disconnect GitHub'
      disconnect.addEventListener('click', () => {
        document.getElementById('github-disconnect')?.click()
      })
      actions.append(disconnect)
    }
    panel.append(actions)
    return
  }

  if (section === 'preferences') renderPreferences(panel)
}

function connectionLabel(status: GitHubConnectionStatus): string {
  if (status.connecting) return 'Authorization in progress'
  if (status.connected) return `Connected${status.username ? ` as @${status.username}` : ''}`
  return 'Not connected'
}

function aiCredentialLabel(): string {
  if (currentAIStatus.credentialState === 'unreadable') return 'Unreadable'
  return currentAIStatus.configured ? 'Configured' : 'Not configured'
}

function configurationLabel(status: AppRuntimeInfo['supabaseUrlStatus']): string {
  switch (status) {
    case 'configured':
      return 'Configured'
    case 'missing':
      return 'Missing'
    case 'empty':
      return 'Empty'
    case 'invalid':
      return 'Invalid'
  }
}

function renderPreferences(panel: HTMLElement): void {
  const group = document.createElement('div')
  group.className = 'settings-preferences'
  const pageLabel = document.createElement('label')
  pageLabel.htmlFor = 'startup-page'
  pageLabel.textContent = 'Startup page'
  const pageSelect = document.createElement('select')
  pageSelect.id = 'startup-page'
  const pages: StartupPage[] = ['Dashboard', 'AI Chat', 'Profile', 'Settings']
  pages.forEach((page) => {
    const option = document.createElement('option')
    option.value = page
    option.textContent = page
    option.selected = currentPreferences.startupPage === page
    pageSelect.append(option)
  })
  group.append(pageLabel, pageSelect)

  const motionLabel = document.createElement('label')
  motionLabel.className = 'settings-checkbox-row'
  const motion = document.createElement('input')
  motion.type = 'checkbox'
  motion.id = 'reduce-motion'
  motion.checked = currentPreferences.reduceMotion
  const motionText = document.createElement('span')
  motionText.textContent = 'Reduce application motion'
  motionLabel.append(motion, motionText)
  group.append(motionLabel)

  const help = document.createElement('p')
  help.className = 'settings-help'
  help.textContent =
    'These preferences are stored locally in the application data directory and are separate from sign-in credentials.'
  group.append(help)
  const actions = document.createElement('div')
  actions.className = 'settings-actions'
  const save = document.createElement('button')
  save.type = 'button'
  save.className = 'button button-primary'
  save.textContent = 'Save preferences'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'button button-secondary'
  cancel.textContent = 'Cancel'
  const status = document.createElement('span')
  status.className = 'settings-save-status'
  status.setAttribute('role', 'status')
  save.addEventListener('click', () => {
    const next: AppPreferences = {
      reduceMotion: motion.checked,
      startupPage: pageSelect.value as StartupPage,
      geminiModel: currentPreferences.geminiModel,
      aiProvider: currentPreferences.aiProvider,
      providerModels: currentPreferences.providerModels
    }
    save.disabled = true
    status.textContent = 'Saving…'
    void window.api
      .savePreferences(next)
      .then((saved) => {
        currentPreferences = saved
        document.body.classList.toggle('reduce-motion', saved.reduceMotion)
        status.textContent = 'Saved'
      })
      .catch(() => {
        status.textContent = 'Could not save preferences.'
      })
      .finally(() => {
        save.disabled = false
      })
  })
  cancel.addEventListener('click', () => renderSettingsSection('preferences'))
  actions.append(save, cancel, status)
  group.append(actions)
  panel.append(group)
}

function renderGeminiConfiguration(panel: HTMLElement): void {
  const providerSelect = document.createElement('select')
  providerSelect.id = 'ai-provider'
  const providers: Array<{ id: AIProviderId; label: string }> = [
    { id: 'gemini', label: 'Google Gemini' },
    { id: 'groq', label: 'Groq' },
    { id: 'openai', label: 'OpenAI' }
  ]
  providers.forEach(({ id, label }) => {
    const option = document.createElement('option')
    option.value = id
    option.textContent = label
    option.selected = currentPreferences.aiProvider === id
    providerSelect.append(option)
  })
  const providerLabel = document.createElement('label')
  providerLabel.htmlFor = providerSelect.id
  providerLabel.textContent = 'AI provider'
  const providerGroup = document.createElement('div')
  providerGroup.className = 'settings-preferences'
  providerGroup.append(providerLabel, providerSelect)
  const unreadable = currentAIStatus.credentialState === 'unreadable'
  const storage = currentAIStatus.storageContext
  panel.append(
    providerGroup,
    createInfoRow(
      'Credential',
      unreadable ? 'Unreadable' : currentAIStatus.configured ? 'Configured' : 'Not configured',
      unreadable
        ? 'The encrypted key is preserved. Remove it with confirmation before saving a replacement.'
        : currentAIStatus.configured
          ? 'The API key is stored using Electron secure storage and is never displayed again.'
          : 'No API key is stored for this provider.'
    ),
    createInfoRow(
      'Secure storage',
      `${storage.packaged ? 'Packaged app' : 'Development app'} · ${storage.platform} · ${storage.backend}`,
      storage.userDataDirectory
    )
  )

  const form = document.createElement('div')
  form.className = 'settings-preferences gemini-configuration'
  const modelLabel = document.createElement('label')
  modelLabel.htmlFor = 'ai-model'
  modelLabel.textContent = 'Model identifier'
  const model = document.createElement('input')
  model.id = 'ai-model'
  model.type = 'text'
  model.autocomplete = 'off'
  model.maxLength = 120
  model.value = currentAIStatus.model
  model.placeholder = currentAIStatus.provider === 'gemini' ? 'gemini-2.5-flash' : 'Model identifier'
  form.append(modelLabel, model)

  const modelActions = document.createElement('div')
  modelActions.className = 'settings-actions'
  const saveModel = document.createElement('button')
  saveModel.type = 'button'
  saveModel.className = 'button button-secondary'
  saveModel.textContent = 'Save model'
  const test = document.createElement('button')
  test.type = 'button'
  test.className = 'button button-primary'
  test.textContent = 'Test Connection'
  const result = document.createElement('span')
  result.className = 'settings-save-status'
  result.setAttribute('role', 'status')
  modelActions.append(saveModel, test, result)
  form.append(modelActions)

  const keyLabel = document.createElement('label')
  keyLabel.htmlFor = 'ai-api-key'
  keyLabel.textContent = `${currentAIStatus.providerLabel} API key`
  const keyInput = document.createElement('input')
  keyInput.id = 'ai-api-key'
  keyInput.type = 'password'
  keyInput.autocomplete = 'new-password'
  keyInput.spellcheck = false
  keyInput.maxLength = 256
  keyInput.placeholder = currentAIStatus.configured
    ? 'Saved key is not shown'
    : `Enter your ${currentAIStatus.providerLabel} API key`
  keyInput.setAttribute('aria-label', keyLabel.textContent)
  const keyActions = document.createElement('div')
  keyActions.className = 'settings-actions'
  const saveKey = document.createElement('button')
  saveKey.type = 'button'
  saveKey.className = 'button button-primary'
  saveKey.textContent = 'Save API key'
  saveKey.disabled = unreadable
  const removeKey = document.createElement('button')
  removeKey.type = 'button'
  removeKey.className = 'button button-secondary'
  removeKey.textContent = 'Remove key'
  removeKey.disabled = !currentAIStatus.configured
  const keyStatus = document.createElement('span')
  keyStatus.className = 'settings-save-status'
  keyStatus.setAttribute('role', 'status')
  keyActions.append(saveKey, removeKey, keyStatus)
  form.append(keyLabel, keyInput, keyActions)
  panel.append(form)

  const busy = (value: boolean): void => {
    saveModel.disabled = value
    test.disabled = value
    saveKey.disabled = value || unreadable
    removeKey.disabled = value || !currentAIStatus.configured
    providerSelect.disabled = value
  }
  const refresh = (status: GeminiStatus): void => {
    currentAIStatus = status
    renderSettingsSection('api')
  }
  providerSelect.addEventListener('change', () => {
    providerSelect.disabled = true
    void window.api.setAIProvider(providerSelect.value as AIProviderId)
      .then((status) => {
        currentPreferences.aiProvider = status.provider
        currentAIStatus = status
        renderSettingsSection('api')
      })
      .catch((error: unknown) => {
        result.textContent = error instanceof Error ? error.message : 'Could not change provider.'
        providerSelect.disabled = false
      })
  })
  saveModel.addEventListener('click', () => {
    busy(true)
    result.textContent = 'Saving model…'
    void window.api.setAIModel(model.value)
      .then((status) => {
        currentAIStatus = status
        currentPreferences.providerModels[status.provider] = status.model
        if (status.provider === 'gemini') currentPreferences.geminiModel = status.model
        result.textContent = 'Model saved.'
      })
      .catch((error: unknown) => {
        result.textContent = error instanceof Error ? error.message : 'Could not save the model.'
      })
      .finally(() => busy(false))
  })
  test.addEventListener('click', () => {
    busy(true)
    result.textContent = `Testing ${currentAIStatus.providerLabel} connection…`
    void window.api.setAIModel(model.value)
      .then((status) => {
        currentAIStatus = status
        currentPreferences.providerModels[status.provider] = status.model
        return window.api.testAIConnection()
      })
      .then((testResult) => {
        result.textContent = testResult.success
          ? `${currentAIStatus.providerLabel} responded successfully in ${testResult.attempts} ${testResult.attempts === 1 ? 'attempt' : 'attempts'}.`
          : formatGeminiFailureMessage(testResult)
      })
      .catch((error: unknown) => {
        result.textContent = error instanceof Error ? error.message : 'AI connection test failed.'
      })
      .finally(() => busy(false))
  })
  saveKey.addEventListener('click', () => {
    if (!keyInput.value) {
      keyStatus.textContent = 'Enter an API key first.'
      return
    }
    busy(true)
    keyStatus.textContent = 'Saving securely…'
    void window.api.saveAIKey(keyInput.value)
      .then((status) => {
        keyInput.value = ''
        currentAIStatus = status
        keyStatus.textContent = 'Key saved securely. It cannot be viewed here.'
        refresh(status)
      })
      .catch((error: unknown) => {
        keyStatus.textContent = error instanceof Error ? error.message : 'Could not save API key.'
      })
      .finally(() => busy(false))
  })
  removeKey.addEventListener('click', () => {
    if (!window.confirm(`Remove the saved ${currentAIStatus.providerLabel} API key from this device?`)) return
    busy(true)
    keyStatus.textContent = 'Removing key…'
    void window.api.removeAIKey()
      .then((status) => {
        currentAIStatus = status
        keyStatus.textContent = 'Saved key removed.'
        refresh(status)
      })
      .catch((error: unknown) => {
        keyStatus.textContent = error instanceof Error ? error.message : 'Could not remove API key.'
      })
      .finally(() => busy(false))
  })
}

function formatGeminiFailureMessage(failure: {
  message: string
  httpStatus?: number
  attempts: number
}): string {
  const attemptLabel = `${failure.attempts} ${failure.attempts === 1 ? 'attempt' : 'attempts'}`
  if (failure.message.includes(`after ${attemptLabel}`)) {
    return failure.message
  }
  return failure.httpStatus
    ? `${failure.message} (HTTP ${failure.httpStatus}; ${attemptLabel})`
    : `${failure.message} (${attemptLabel})`
}

function renderGeminiChat(panel: HTMLElement): void {
  const messages = activeChatMessages
  const mode = document.createElement('select')
  mode.id = 'ai-chat-mode'
  const modes = [
    { value: 'chat', label: 'Chat' },
    { value: 'code-assistance', label: 'Code assistance' },
    { value: 'code-review', label: 'Code review' },
    { value: 'code-edit', label: 'Code editing' },
    { value: 'bug-fix', label: 'Bug fixing' }
  ] as const
  modes.forEach((item) => {
    const option = document.createElement('option')
    option.value = item.value
    option.textContent = item.label
    mode.append(option)
  })

  const projectSelector = document.createElement('select')
  projectSelector.id = 'ai-chat-project'
  projectSelector.style.flex = '1'
  projectSelector.style.minWidth = '180px'
  projectSelector.style.minHeight = '34px'
  projectSelector.style.padding = '0 10px'
  projectSelector.style.border = '1px solid #393544'
  projectSelector.style.borderRadius = '6px'
  projectSelector.style.color = '#e8eaf2'
  projectSelector.style.background = '#0b0d13'
  projectSelector.style.font = 'inherit'
  projectSelector.style.fontSize = '10px'

  const defaultOption = document.createElement('option')
  defaultOption.value = ''
  defaultOption.textContent = 'Project: None (General chat)'
  projectSelector.append(defaultOption)

  void window.api.getProjects().then((loaded) => {
    loaded.forEach((proj) => {
      const opt = document.createElement('option')
      opt.value = proj.path
      opt.textContent = `Project: ${proj.name}`
      if (activeAIProjectPath === proj.path) {
        opt.selected = true
      }
      projectSelector.append(opt)
    })
  })

  projectSelector.addEventListener('change', () => {
    activeAIProjectPath = projectSelector.value || null
  })

  const controlsRow = document.createElement('div')
  controlsRow.style.display = 'flex'
  controlsRow.style.gap = '8px'
  controlsRow.style.margin = '10px 0'
  controlsRow.style.flexWrap = 'wrap'

  mode.style.flex = '1'
  mode.style.minWidth = '130px'
  mode.style.minHeight = '34px'
  mode.style.padding = '0 10px'
  mode.style.border = '1px solid #393544'
  mode.style.borderRadius = '6px'
  mode.style.color = '#e8eaf2'
  mode.style.background = '#0b0d13'
  mode.style.font = 'inherit'
  mode.style.fontSize = '10px'

  controlsRow.append(mode, projectSelector)

  const transcript = document.createElement('div')
  transcript.className = 'gemini-chat-transcript'
  transcript.setAttribute('aria-live', 'polite')
  transcript.setAttribute('aria-label', `Conversation with ${currentAIStatus.providerLabel}`)
  const controls = document.createElement('div')
  controls.className = 'gemini-chat-controls'
  const input = document.createElement('textarea')
  input.id = 'gemini-chat-input'
  input.rows = 3
  input.maxLength = 8_000
  input.placeholder = currentAIStatus.configured
    ? 'Ask a question or explore your project files… (Enter to send, Shift+Enter for newline)'
    : `Configure a ${currentAIStatus.providerLabel} API key in API Configuration first.`
  input.disabled = false
  input.setAttribute('aria-label', `Message for ${currentAIStatus.providerLabel}`)
  const actions = document.createElement('div')
  actions.className = 'settings-actions gemini-chat-actions'
  const send = document.createElement('button')
  send.type = 'button'
  send.className = 'button button-primary'
  send.textContent = 'Send'
  send.disabled = false
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'button button-secondary'
  reset.textContent = 'New chat'
  const status = document.createElement('span')
  status.className = 'settings-save-status'
  status.setAttribute('role', 'status')

  actions.append(status, reset, send)
  controls.append(input, actions)
  const topBar = document.createElement('div')
  topBar.style.display = 'flex'
  topBar.style.justifyContent = 'space-between'
  topBar.style.alignItems = 'center'
  topBar.style.flexWrap = 'wrap'
  topBar.style.gap = '8px'
  topBar.style.margin = '4px 0 10px'

  const infoRow = createInfoRow('Provider and model', `${currentAIStatus.providerLabel} · ${currentAIStatus.model}`)
  infoRow.style.flex = '1'
  infoRow.style.minWidth = '220px'
  infoRow.style.borderBottom = 'none'
  infoRow.style.padding = '0'

  const configBtn = document.createElement('button')
  configBtn.type = 'button'
  configBtn.className = 'button button-secondary'
  configBtn.textContent = 'Configure Provider ⚙'
  configBtn.style.padding = '5px 12px'
  configBtn.style.fontSize = '10px'
  configBtn.style.minHeight = '30px'
  configBtn.addEventListener('click', () => {
    openSettings('api')
  })

  topBar.append(infoRow, configBtn)

  panel.replaceChildren()
  panel.append(
    topBar,
    controlsRow,
    transcript,
    controls
  )

  const renderMessages = (): void => {
    transcript.replaceChildren()
    if (messages.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'gemini-chat-empty'
      empty.textContent = currentAIStatus.configured
        ? `Start a conversation or explore projects with ${currentAIStatus.providerLabel}.`
        : 'Save an API key in API Configuration to start chatting.'
      transcript.append(empty)
      return
    }
    messages.forEach((message) => {
      const bubble = document.createElement('article')
      bubble.className = `gemini-message ${message.role}`
      const author = document.createElement('strong')
      author.textContent = message.role === 'user' ? 'You' : currentAIStatus.providerLabel
      bubble.append(author)

      if (message.role === 'assistant') {
        const { segments } = parseCodeEditBlocks(message.text)
        if (segments.length > 0 && segments.some((s) => s.isEdit)) {
          segments.forEach((seg) => {
            if (seg.isEdit && seg.edit) {
              const card = createEditCard(
                seg.edit,
                projectSelector.value || activeAIProjectPath || undefined
              )
              bubble.append(card)
            } else if (seg.text && seg.text.trim()) {
              const text = document.createElement('p')
              text.textContent = seg.text.trim()
              bubble.append(text)
            }
          })
        } else {
          const text = document.createElement('p')
          text.textContent = message.text
          bubble.append(text)
        }
      } else {
        const text = document.createElement('p')
        text.textContent = message.text
        bubble.append(text)
      }

      transcript.append(bubble)
    })
    transcript.scrollTop = transcript.scrollHeight
  }

  let sending = false
  const submit = async (): Promise<void> => {
    const text = input.value.trim()
    if (sending || !text) return
    if (!currentAIStatus.configured) {
      status.textContent = `Configure a ${currentAIStatus.providerLabel} API key in Settings > API Configuration first.`
      return
    }
    if (messages.length >= 20) messages.splice(0, 2)
    const requestMessages: GeminiChatMessage[] = [...messages, { role: 'user', text }]
    if (requestMessages.length > 20) requestMessages.splice(0, requestMessages.length - 20)
    if (requestMessages[0]?.role !== 'user') requestMessages.shift()
    messages.push({ role: 'user', text })
    input.value = ''
    renderMessages()
    send.textContent = 'Send'
    const targetProjectPath = projectSelector.value || activeAIProjectPath || undefined
    await withLoadingState(
      async () => {
        status.textContent = targetProjectPath
          ? `${currentAIStatus.providerLabel} is inspecting project and responding…`
          : `${currentAIStatus.providerLabel} is responding…`
        const pending = document.createElement('p')
        pending.className = 'gemini-chat-pending'
        pending.textContent = targetProjectPath
          ? 'Inspecting project files and generating response…'
          : 'Generating response…'
        transcript.append(pending)
        try {
          const response = await window.api.sendAIChat({
            messages: requestMessages,
            mode: mode.value as
              | 'chat'
              | 'code-assistance'
              | 'code-review'
              | 'bug-fix'
              | 'code-edit',
            projectPath: targetProjectPath
          })
          if (response.success) {
            messages.push({ role: 'assistant', text: response.text })
            status.textContent = ''
          } else {
            messages.pop()
            input.value = text
            status.textContent = formatGeminiFailureMessage(response)
            send.textContent = response.retryable ? 'Retry' : 'Send'
          }
        } catch (error) {
          messages.pop()
          input.value = text
          status.textContent =
            error instanceof Error ? error.message : `${currentAIStatus.providerLabel} could not complete the request.`
          void window.api
            .getAIStatus()
            .then((aiStatus) => {
              currentAIStatus = aiStatus
              if (aiStatus.credentialState === 'unreadable') {
                input.disabled = true
                send.disabled = true
                status.textContent =
                  'Saved key is unreadable. Remove it in API Configuration, then save it again.'
              }
            })
            .catch(() => undefined)
        } finally {
          renderMessages()
        }
      },
      (loading) => {
        sending = loading
        send.disabled = loading
        reset.disabled = loading
        input.disabled = loading
      }
    )
    input.focus()
  }
  send.addEventListener('click', () => void submit())
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit()
    }
  })
  reset.addEventListener('click', () => {
    if (messages.length > 0 && !window.confirm('Start a new conversation and clear this chat?'))
      return
    messages.splice(0, messages.length)
    status.textContent = ''
    renderMessages()
    input.focus()
  })
  renderMessages()
}

function renderAIChatPage(): void {
  const container = document.getElementById('ai-chat-container')
  if (!container) return
  renderGeminiChat(container)
}

function renderProfilePage(): void {
  const container = document.getElementById('profile-layout')
  if (!container) return
  container.replaceChildren()

  if (currentGitHubStatus.connected && currentGitHubProfile) {
    const profile = currentGitHubProfile

    // 1. Header Card
    const headerCard = document.createElement('div')
    headerCard.className = 'profile-header-card'

    if (profile.avatarUrl) {
      const avatarImg = document.createElement('img')
      avatarImg.className = 'profile-big-avatar'
      avatarImg.src = profile.avatarUrl
      avatarImg.alt = `@${profile.username}`
      headerCard.append(avatarImg)
    } else {
      const avatarFallback = document.createElement('div')
      avatarFallback.className = 'profile-big-avatar'
      avatarFallback.textContent = profile.username.charAt(0).toUpperCase()
      headerCard.append(avatarFallback)
    }

    const userInfo = document.createElement('div')
    userInfo.className = 'profile-user-info'

    const name = document.createElement('h2')
    name.textContent = profile.displayName || profile.username

    const handle = document.createElement('a')
    handle.className = 'profile-user-handle'
    handle.href = profile.profileUrl
    handle.textContent = `@${profile.username} ↗`
    handle.title = 'Open GitHub Profile in browser'
    handle.addEventListener('click', (e) => {
      e.preventDefault()
      void window.api.openExternal(profile.profileUrl)
    })

    const bio = document.createElement('p')
    bio.className = 'profile-bio'
    bio.textContent = profile.bio || 'DEVTEX Workspace Developer'

    const badges = document.createElement('div')
    badges.className = 'profile-badges'

    const reposBadge = document.createElement('span')
    reposBadge.className = 'profile-badge'
    reposBadge.textContent = `▧ ${currentGitHubRepositories.length} Available Repositories (${profile.publicRepos} Public)`

    const followersBadge = document.createElement('span')
    followersBadge.className = 'profile-badge'
    followersBadge.textContent = `★ ${profile.followers} Followers`

    const scopeBadge = document.createElement('span')
    scopeBadge.className = 'profile-badge'
    scopeBadge.textContent = '🔒 Repository & Read User Access'

    badges.append(reposBadge, followersBadge, scopeBadge)
    userInfo.append(name, handle, bio, badges)

    const actions = document.createElement('div')
    actions.className = 'profile-actions'

    const refreshBtn = document.createElement('button')
    refreshBtn.type = 'button'
    refreshBtn.className = 'button button-secondary'
    refreshBtn.textContent = '↻ Refresh'
    refreshBtn.addEventListener('click', () => {
      document.getElementById('github-refresh')?.click()
    })

    const disconnectBtn = document.createElement('button')
    disconnectBtn.type = 'button'
    disconnectBtn.className = 'button button-secondary'
    disconnectBtn.textContent = 'Disconnect'
    disconnectBtn.addEventListener('click', () => {
      document.getElementById('github-disconnect')?.click()
    })

    actions.append(refreshBtn, disconnectBtn)
    headerCard.append(userInfo, actions)
    container.append(headerCard)

    // 2. Repositories Panel
    const reposPanel = document.createElement('section')
    reposPanel.className = 'panel'

    const reposHeading = document.createElement('div')
    reposHeading.className = 'panel-heading'

    const titleDiv = document.createElement('div')
    const reposTitle = document.createElement('h2')
    reposTitle.textContent = `Repositories (${currentGitHubRepositories.length})`
    const reposSubtitle = document.createElement('p')
    reposSubtitle.textContent = 'Public and private repositories accessible with your granted permissions.'
    titleDiv.append(reposTitle, reposSubtitle)

    reposHeading.append(titleDiv)

    const searchInput = document.createElement('input')
    searchInput.type = 'search'
    searchInput.placeholder = 'Filter repositories by name or language…'
    searchInput.style.width = '100%'
    searchInput.style.margin = '14px 0 10px'
    searchInput.style.padding = '8px 12px'
    searchInput.style.borderRadius = '6px'
    searchInput.style.border = '1px solid #393544'
    searchInput.style.background = '#0b0d13'
    searchInput.style.color = '#e8eaf2'
    searchInput.style.font = 'inherit'
    searchInput.style.fontSize = '11px'

    const reposList = document.createElement('div')
    reposList.className = 'github-repository-list'

    function renderRepoRows(filterText = ''): void {
      reposList.replaceChildren()
      const query = filterText.trim().toLowerCase()
      const filtered = currentGitHubRepositories.filter((repo) =>
        `${repo.fullName} ${repo.description ?? ''} ${repo.language ?? ''}`
          .toLowerCase()
          .includes(query)
      )

      if (filtered.length === 0) {
        const empty = document.createElement('p')
        empty.className = 'github-repository-empty'
        empty.textContent = currentGitHubRepositories.length === 0
          ? 'No repositories were returned by GitHub.'
          : 'No repositories match your search filter.'
        reposList.append(empty)
        return
      }

      filtered.forEach((repository) => {
        const row = document.createElement('article')
        row.className = 'github-repository-row'

        const details = document.createElement('div')
        details.className = 'github-repository-details'

        const repoName = document.createElement('button')
        repoName.type = 'button'
        repoName.className = 'github-repository-name'
        repoName.textContent = repository.fullName
        repoName.title = `Open ${repository.fullName} on GitHub`
        repoName.addEventListener('click', () => {
          void window.api.openGitHubRepository(repository.url)
        })

        const desc = document.createElement('span')
        desc.textContent = repository.description || 'No description provided'

        details.append(repoName, desc)

        const meta = document.createElement('div')
        meta.className = 'github-repository-metadata'

        if (repository.language) {
          const lang = document.createElement('span')
          lang.textContent = repository.language
          meta.append(lang)
        }

        const visibility = document.createElement('span')
        visibility.className = `repository-visibility ${repository.visibility}`
        visibility.textContent = repository.visibility
        meta.append(visibility)

        if (repository.defaultBranch) {
          const branch = document.createElement('span')
          branch.textContent = `⌥ ${repository.defaultBranch}`
          meta.append(branch)
        }

        row.append(details, meta)
        reposList.append(row)
      })
    }

    searchInput.addEventListener('input', () => renderRepoRows(searchInput.value))
    renderRepoRows()

    reposPanel.append(reposHeading, searchInput, reposList)
    container.append(reposPanel)

    // 3. Supabase Cloud Identity Panel
    const cloudPanel = document.createElement('section')
    cloudPanel.className = 'panel'
    const cloudHeading = document.createElement('div')
    cloudHeading.className = 'panel-heading'
    const cloudTitle = document.createElement('div')
    const cHead = document.createElement('h2')
    cHead.textContent = 'Cloud & Workspace Account'
    const cSub = document.createElement('p')
    cSub.textContent = 'Supabase authentication session for team syncing and cloud services.'
    cloudTitle.append(cHead, cSub)
    cloudHeading.append(cloudTitle)

    const cloudRow = createInfoRow(
      'Supabase Authentication',
      currentAccountEmail ? `Signed in (${currentAccountEmail})` : 'Not signed in',
      'Manage cloud session credentials'
    )

    const cloudBtn = document.createElement('button')
    cloudBtn.type = 'button'
    cloudBtn.className = 'button button-secondary'
    cloudBtn.style.marginTop = '14px'
    cloudBtn.textContent = currentAccountEmail ? 'Sign out of Supabase' : 'Sign in to Supabase'
    cloudBtn.addEventListener('click', () => {
      document.getElementById('sign-in')?.click()
    })

    cloudPanel.append(cloudHeading, cloudRow, cloudBtn)
    container.append(cloudPanel)
  } else {
    // Empty state: GitHub not connected
    const emptyPanel = document.createElement('div')
    emptyPanel.className = 'panel'
    emptyPanel.style.textAlign = 'center'
    emptyPanel.style.padding = '48px 24px'

    const icon = document.createElement('div')
    icon.className = 'empty-icon'
    icon.textContent = '⌘'

    const title = document.createElement('h3')
    title.textContent = 'Connect GitHub to view your developer profile'
    title.style.fontSize = '14px'
    title.style.marginBottom = '8px'

    const desc = document.createElement('p')
    desc.textContent =
      'Connect your GitHub account using the secure one-time Device Flow to view your avatar, username, and all accessible repositories.'
    desc.style.color = 'var(--muted)'
    desc.style.fontSize = '11px'
    desc.style.maxWidth = '460px'
    desc.style.margin = '0 auto 20px'
    desc.style.lineHeight = '1.6'

    const connectBtn = document.createElement('button')
    connectBtn.type = 'button'
    connectBtn.className = 'button button-primary'
    connectBtn.textContent = '⌘ Connect GitHub'
    connectBtn.addEventListener('click', () => {
      document.getElementById('connect-github')?.click()
    })

    emptyPanel.append(icon, title, desc, connectBtn)
    container.append(emptyPanel)
  }
}

async function loadSettingsBootstrap(): Promise<void> {
  try {
    const [preferences, runtime, aiStatus] = await Promise.all([
      window.api.getPreferences(),
      window.api.getRuntimeInfo(),
      window.api.getAIStatus()
    ])
    currentPreferences = preferences
    currentRuntimeInfo = runtime
    currentAIStatus = aiStatus
    document.body.classList.toggle('reduce-motion', preferences.reduceMotion)
    if (preferences.startupPage === 'Settings') openSettings('account')
    else if (preferences.startupPage === 'AI Chat') showPage('AI Chat', 'Chat, explore local projects, and review code with AI.')
    else if (preferences.startupPage === 'Profile') showPage('Profile', 'View your connected GitHub profile and repositories.')
    renderSettingsSection(activeSettingsSection)
  } catch {
    currentRuntimeInfo = null
    const panel = document.getElementById('settings-panel')
    if (panel && activeSettingsSection === 'runtime') {
      const message = document.createElement('p')
      message.className = 'settings-error'
      message.textContent = 'Runtime information is temporarily unavailable.'
      panel.append(message)
    }
  }
}
