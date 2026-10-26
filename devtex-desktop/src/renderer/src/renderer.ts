import { createClient } from '@supabase/supabase-js'
import type { GitHubConnectionStatus, GitHubRepository } from '../../shared/github'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Supabase configuration is missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.'
  )
}

const supabase =
  supabaseUrl && supabaseKey
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
  const breadcrumb = document.getElementById('breadcrumb-page')
  const title = document.getElementById('page-title')
  const subtitle = document.getElementById('page-subtitle')

  const descriptions: Record<string, string> = {
    Dashboard: 'Build, test, and improve your software from one workspace.',
    Projects: 'Manage the projects you add to your workspace.',
    'Testing Engine': 'Explore the future of automated software testing.',
    Reports: 'Review testing results as the engine becomes available.',
    Settings: 'Your DEVTEX workspace preferences.'
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      buttons.forEach((item) => item.classList.remove('active'))
      button.classList.add('active')

      const page = button.dataset.page || 'Dashboard'

      if (breadcrumb) breadcrumb.textContent = page

      if (title) {
        if (page === 'Dashboard') {
          title.innerHTML = 'Welcome to <span>DEVTEX.</span>'
        } else {
          title.textContent = page
        }
      }

      if (subtitle) subtitle.textContent = descriptions[page] || ''

      if (page !== 'Dashboard') {
        addActivity(`Opened ${page}`, 'Workspace navigation updated.')
      }
    })
  })
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
      console.error('Supabase OAuth error:', error)
      window.alert(
        error instanceof Error
          ? `Sign-in could not start: ${error.message}`
          : 'Sign-in could not start. Check the console for details.'
      )
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
      console.error('Supabase callback error:', error)
      showAuthMessage(`Sign-in could not be completed: ${error.message}`)
      return
    }

    if (modal) modal.hidden = true
    addActivity('Signed in', 'Your Supabase session is ready.')
  }

  function updateAccount(email?: string): void {
    const signedIn = Boolean(email)
    if (signInButton) signInButton.textContent = signedIn ? 'Sign out' : 'Sign in'
    if (avatar) {
      avatar.textContent = email?.charAt(0).toUpperCase() || 'D'
      avatar.title = email || 'DEVTEX account'
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
      if (data.session) void supabase.auth.signOut()
      else openModal()
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
      console.error('Unable to complete Supabase sign-in:', error)
      showAuthMessage('Sign-in could not be completed. Check the application logs.')
    })
  })

  if (supabase) {
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Unable to restore Supabase session:', error)
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
