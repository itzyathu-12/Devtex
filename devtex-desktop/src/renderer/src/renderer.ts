import { createClient } from '@supabase/supabase-js'
import type { GitHubConnectionStatus, GitHubRepository } from '../../shared/github'
import type {
  AppPreferences,
  AppRuntimeInfo,
  AIProviderId,
  GeminiChatMessage,
  GeminiStatus,
  SettingsSection,
  StartupPage
} from '../../shared/settings'
import { withLoadingState } from '../../shared/async-state'

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
type WorkspacePage = StartupPage | 'Projects' | 'Testing Engine' | 'Reports'
let currentAccountEmail: string | null = null
let currentGitHubStatus: GitHubConnectionStatus = { connected: false, connecting: false }
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
    setupDemoScan()
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
    Projects: 'Manage the projects you add to your workspace.',
    'Testing Engine': 'Explore the future of automated software testing.',
    Reports: 'Review testing results as the engine becomes available.',
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
  const buttons = document.querySelectorAll<HTMLButtonElement>('.nav-item')
  const breadcrumb = document.getElementById('breadcrumb-page')
  const title = document.getElementById('page-title')
  const subtitle = document.getElementById('page-subtitle')
  const dashboard = document.getElementById('dashboard-view')
  const settings = document.getElementById('settings-view')

  buttons.forEach((button) => button.classList.toggle('active', button.dataset.page === page))
  if (breadcrumb) breadcrumb.textContent = page
  if (title) {
    title.textContent = page === 'Dashboard' ? '' : page
    if (page === 'Dashboard') title.innerHTML = 'Welcome to <span>DEVTEX.</span>'
  }
  if (subtitle) subtitle.textContent = description
  if (dashboard) dashboard.hidden = page === 'Settings'
  if (settings) settings.hidden = page !== 'Settings'
}

function setupProjects(): void {
  const projects: string[] = []
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
      button.addEventListener('click', addProject)

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
      heading.textContent = project

      const description = document.createElement('span')
      description.textContent = 'Added to workspace · Local project'

      const status = document.createElement('span')
      status.className = 'project-status'
      status.textContent = 'READY'

      meta.append(heading, description)
      row.append(symbol, meta, status)
      list.append(row)
    })
  }

  function addProject(): void {
    const input = window.prompt('Enter a name for your project:')
    if (!input || !input.trim()) return

    const name = input.trim()

    if (projects.some((project) => project.toLowerCase() === name.toLowerCase())) {
      window.alert('A project with that name already exists in this session.')
      return
    }

    projects.push(name)
    renderProjects()
    addActivity(`Added project: ${name}`, 'Project added to this session.')
  }

  document.getElementById('new-project')?.addEventListener('click', addProject)
  document.getElementById('add-first-project')?.addEventListener('click', addProject)

  document.getElementById('view-projects')?.addEventListener('click', () => {
    document.querySelector<HTMLButtonElement>('[data-page="Projects"]')?.click()
  })

  renderProjects()
}

function setupDemoScan(): void {
  const button = document.getElementById('run-scan')
  const result = document.getElementById('scan-result')

  button?.addEventListener('click', () => {
    if (result) {
      result.textContent =
        'Demo complete. No code was scanned. The real testing engine is not connected yet.'
    }

    addActivity('Ran demo scan', 'UI demonstration only; no files were inspected.')
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
      setMessage(
        result.connected
          ? result.repositories.length === 0
            ? 'No repositories were returned by GitHub.'
            : `Showing repositories available to @${result.username}.`
          : result.message || 'Connect GitHub to list accessible repositories.',
        result.connected && result.repositories.length > 0 ? 'success' : ''
      )
    } catch (error) {
      repositories = []
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
    if (connection.connected || connection.connecting) return
    connection = { connected: false, connecting: true }
    setMessage('GitHub will open in your browser. Follow the one-time authorization prompt.')
    renderRepositories()
    void window.api
      .connectGitHubRepositories()
      .then((status) => {
        connection = status
        setMessage(status.message || 'Waiting for GitHub authorization.')
        renderRepositories()
      })
      .catch((error: unknown) => {
        connection = { connected: false, connecting: false }
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
        repositories = []
        setMessage('GitHub credential removed from this device.')
        renderRepositories()
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Could not disconnect GitHub.', 'error')
      })
  })

  window.api.onGitHubConnectionChanged((status) => {
    connection = status
    if (!status.connected) repositories = []
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
  const avatar = document.getElementById('user-avatar')
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
    if (avatar) {
      avatar.textContent = email?.charAt(0).toUpperCase() || 'D'
      avatar.title = email || 'DEVTEX account'
    }
    updateProfileMenuIdentity()
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

function updateProfileMenuIdentity(): void {
  const identity = document.getElementById('profile-menu-identity')
  const status = document.getElementById('profile-menu-status')
  if (identity) identity.textContent = currentAccountEmail || 'Signed out'
  if (status) status.textContent = currentAccountEmail ? 'Supabase account' : 'No Supabase session'
}

function setupProfileMenu(): void {
  const trigger = document.getElementById('user-avatar') as HTMLButtonElement | null
  const menu = document.getElementById('profile-menu')
  const control = document.querySelector('.profile-control')
  if (!trigger || !menu || !control) return
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
    renderGeminiChat(panel)
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
  const pages: StartupPage[] = ['Dashboard', 'Settings']
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

function setGeminiBusy(buttons: HTMLButtonElement[], busy: boolean): void {
  buttons.forEach((button) => {
    button.disabled = busy || (button.dataset.requiresAIKey === 'true' && !currentAIStatus.configured)
  })
}

function renderGeminiChat(panel: HTMLElement): void {
  const messages: GeminiChatMessage[] = []
  const mode = document.createElement('select')
  mode.id = 'ai-chat-mode'
  const modes = [
    { value: 'chat', label: 'Chat' },
    { value: 'code-assistance', label: 'Code assistance' },
    { value: 'code-review', label: 'Code review' }
  ] as const
  modes.forEach((item) => {
    const option = document.createElement('option')
    option.value = item.value
    option.textContent = item.label
    mode.append(option)
  })
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
    ? 'Ask a question or provide code…'
    : `Configure a ${currentAIStatus.providerLabel} API key in API Configuration first.`
  input.disabled = !currentAIStatus.configured
  input.setAttribute('aria-label', `Message for ${currentAIStatus.providerLabel}`)
  const actions = document.createElement('div')
  actions.className = 'settings-actions'
  const send = document.createElement('button')
  send.type = 'button'
  send.className = 'button button-primary'
  send.textContent = 'Send'
  send.disabled = !currentAIStatus.configured
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'button button-secondary'
  reset.textContent = 'New chat'
  const status = document.createElement('span')
  status.className = 'settings-save-status'
  status.setAttribute('role', 'status')
  actions.append(send, reset, status)
  controls.append(input, actions)
  panel.append(createInfoRow('Provider and model', `${currentAIStatus.providerLabel} · ${currentAIStatus.model}`), mode, transcript, controls)

  const renderMessages = (): void => {
    transcript.replaceChildren()
    if (messages.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'gemini-chat-empty'
      empty.textContent = currentAIStatus.configured
        ? `Start a conversation with ${currentAIStatus.providerLabel}.`
        : 'Save an API key in API Configuration to start chatting.'
      transcript.append(empty)
      return
    }
    messages.forEach((message) => {
      const bubble = document.createElement('article')
      bubble.className = `gemini-message ${message.role}`
      const author = document.createElement('strong')
      author.textContent = message.role === 'user' ? 'You' : currentAIStatus.providerLabel
      const text = document.createElement('p')
      text.textContent = message.text
      bubble.append(author, text)
      transcript.append(bubble)
    })
    transcript.scrollTop = transcript.scrollHeight
  }

  let sending = false
  const submit = async (): Promise<void> => {
    const text = input.value.trim()
    if (sending || !text) return
    if (!currentAIStatus.configured) {
      status.textContent = 'Configure an API key first.'
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
    await withLoadingState(
      async () => {
        status.textContent = `${currentAIStatus.providerLabel} is responding…`
        const pending = document.createElement('p')
        pending.className = 'gemini-chat-pending'
        pending.textContent = 'Generating response…'
        transcript.append(pending)
        try {
          const response = await window.api.sendAIChat({
            messages: requestMessages,
            mode: mode.value as 'chat' | 'code-assistance' | 'code-review'
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
        send.disabled = loading || !currentAIStatus.configured
        reset.disabled = loading
        input.disabled = loading || !currentAIStatus.configured
      }
    )
    if (currentAIStatus.configured) input.focus()
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
