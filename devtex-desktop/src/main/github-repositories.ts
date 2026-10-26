import { app, BrowserWindow, dialog, safeStorage, shell } from 'electron'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  GitHubConnectionStatus,
  GitHubProfile,
  GitHubRepository,
  GitHubRepositoryResult
} from '../shared/github'

const apiVersion = '2026-03-10'
const deviceAuthorizationUrl = 'https://github.com/login/device/code'
const accessTokenUrl = 'https://github.com/login/oauth/access_token'
const githubDeviceUrl = 'https://github.com/login/device'
const githubUserUrl = 'https://api.github.com/user'
const credentialPath = join(app.getPath('userData'), 'github-repositories.enc')

interface StoredCredential {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  refreshExpiresAt?: number
  username: string
}

interface DeviceAuthorization {
  deviceCode: string
  userCode: string
  expiresIn: number
  interval: number
}

interface ConnectionServiceOptions {
  clientId: string
  getWindow: () => BrowserWindow | null
  onStatusChanged: (status: GitHubConnectionStatus) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  return typeof value.message === 'string' ? value.message : undefined
}

function parseRetryMessage(response: Response, body: unknown): string {
  const message = getMessage(body)
  if (response.status === 401) {
    return 'GitHub authorization expired or was revoked. Connect GitHub again.'
  }
  if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
    const retryAfter = response.headers.get('retry-after')
    const reset = response.headers.get('x-ratelimit-reset')
    const retryAt = retryAfter
      ? ` Retry after ${retryAfter} seconds.`
      : reset
        ? ` Retry after ${new Date(Number(reset) * 1000).toLocaleTimeString()}.`
        : ''
    return `GitHub API rate limit reached.${retryAt}`
  }
  if (response.status === 403 || response.status === 404) {
    return 'GitHub denied repository access. Check that the GitHub OAuth App is authorized with repo access and allowed by your organization.'
  }
  return message || `GitHub API request failed with status ${response.status}.`
}

function validateGitHubUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid repository URL.')
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.username ||
    url.password ||
    !/^\/[^/]+\/[^/]+\/?$/.test(url.pathname)
  ) {
    throw new Error('Only repository pages on github.com can be opened.')
  }
  return `https://github.com${url.pathname.replace(/\/$/, '')}`
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('GitHub authorization was cancelled.'))
      return
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new Error('GitHub authorization was cancelled.'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export class GitHubRepositoryService {
  private readonly credentialPath = credentialPath
  private readonly clientId: string
  private readonly getWindow: () => BrowserWindow | null
  private readonly onStatusChanged: (status: GitHubConnectionStatus) => void
  private deviceController: AbortController | null = null

  constructor(options: ConnectionServiceOptions) {
    this.clientId = options.clientId.trim()
    this.getWindow = options.getWindow
    this.onStatusChanged = options.onStatusChanged
  }

  async connect(): Promise<GitHubConnectionStatus> {
    if (this.deviceController) {
      return {
        connected: false,
        connecting: true,
        message: 'GitHub authorization is already in progress.'
      }
    }
    if (await this.hasCredential()) {
      const credential = await this.loadCredential()
      if (credential) {
        return { connected: true, connecting: false, username: credential.username }
      }
    }
    if (!this.clientId) {
      throw new Error(
        'GitHub OAuth App is not configured. Set GITHUB_OAUTH_CLIENT_ID in .env and restart the app.'
      )
    }

    await this.ensureSecureStorage()
    const authorization = await this.requestDeviceAuthorization()
    const controller = new AbortController()
    this.deviceController = controller
    this.emit({
      connected: false,
      connecting: true,
      message: 'Complete the GitHub authorization prompt.'
    })
    void this.runDeviceAuthorization(authorization, controller)

    return {
      connected: false,
      connecting: true,
      message: 'Complete the GitHub authorization prompt.'
    }
  }

  async getRepositories(): Promise<GitHubRepositoryResult> {
    const credential = await this.loadCredential()
    if (!credential) {
      return {
        connected: false,
        connecting: Boolean(this.deviceController),
        repositories: [],
        message: this.deviceController ? 'Complete the GitHub authorization prompt.' : undefined
      }
    }

    const currentCredential = await this.getUsableCredential(credential)
    try {
      const repositories = await this.fetchRepositories(currentCredential.accessToken)
      return {
        connected: true,
        connecting: false,
        username: currentCredential.username,
        repositories
      }
    } catch (error) {
      if (error instanceof GitHubAuthorizationError) {
        await this.clearCredential()
        this.emit({ connected: false, connecting: false, message: error.message })
      }
      throw error
    }
  }

  async getGitHubProfile(): Promise<GitHubProfile | null> {
    const credential = await this.loadCredential()
    if (!credential) return null

    const currentCredential = await this.getUsableCredential(credential)
    try {
      const body = await this.githubRequest(githubUserUrl, currentCredential.accessToken)
      if (
        !isRecord(body) ||
        typeof body.login !== 'string' ||
        !/^[A-Za-z0-9-]{1,39}$/.test(body.login)
      ) {
        throw new Error('GitHub did not return a valid account profile.')
      }

      return {
        username: body.login,
        displayName: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null,
        avatarUrl:
          typeof body.avatar_url === 'string' && body.avatar_url
            ? body.avatar_url
            : `https://github.com/${body.login}.png`,
        profileUrl:
          typeof body.html_url === 'string' && body.html_url
            ? body.html_url
            : `https://github.com/${body.login}`,
        bio: typeof body.bio === 'string' ? body.bio : null,
        publicRepos: typeof body.public_repos === 'number' ? body.public_repos : 0,
        followers: typeof body.followers === 'number' ? body.followers : 0
      }
    } catch (error) {
      if (error instanceof GitHubAuthorizationError) {
        await this.clearCredential()
        this.emit({ connected: false, connecting: false, message: error.message })
      }
      throw error
    }
  }

  async disconnect(): Promise<GitHubConnectionStatus> {
    this.deviceController?.abort()
    this.deviceController = null
    await this.clearCredential()
    const status = { connected: false, connecting: false }
    this.emit(status)
    return status
  }

  async openRepository(value: unknown): Promise<void> {
    const url = validateGitHubUrl(value)
    await shell.openExternal(url)
  }

  private emit(status: GitHubConnectionStatus): void {
    this.onStatusChanged(status)
  }

  private async ensureSecureStorage(): Promise<void> {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error('Secure credential storage is unavailable on this device.')
    }
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
      throw new Error(
        'GitHub connection is disabled because Linux has no secure keyring configured.'
      )
    }
  }

  private async hasCredential(): Promise<boolean> {
    try {
      await readFile(this.credentialPath)
      return true
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return false
      throw new Error('Could not read the encrypted GitHub credential.', { cause: error })
    }
  }

  private async loadCredential(): Promise<StoredCredential | null> {
    let encrypted: Buffer
    try {
      encrypted = await readFile(this.credentialPath)
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return null
      throw new Error('Could not read the encrypted GitHub credential.', { cause: error })
    }

    try {
      const decrypted = await safeStorage.decryptStringAsync(encrypted)
      const parsed: unknown = JSON.parse(decrypted.result)
      if (
        !isRecord(parsed) ||
        typeof parsed.accessToken !== 'string' ||
        typeof parsed.username !== 'string'
      ) {
        throw new Error('Invalid credential data.')
      }
      const credential: StoredCredential = {
        accessToken: parsed.accessToken,
        username: parsed.username,
        ...(typeof parsed.refreshToken === 'string' ? { refreshToken: parsed.refreshToken } : {}),
        ...(typeof parsed.expiresAt === 'number' ? { expiresAt: parsed.expiresAt } : {}),
        ...(typeof parsed.refreshExpiresAt === 'number'
          ? { refreshExpiresAt: parsed.refreshExpiresAt }
          : {})
      }
      if (decrypted.shouldReEncrypt) await this.saveCredential(credential)
      return credential
    } catch (error) {
      throw new Error(
        'The encrypted GitHub credential cannot be opened. Disconnect GitHub and reconnect.',
        { cause: error }
      )
    }
  }

  private async saveCredential(credential: StoredCredential): Promise<void> {
    await this.ensureSecureStorage()
    const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(credential))
    await writeFile(this.credentialPath, encrypted, { mode: 0o600 })
  }

  private async clearCredential(): Promise<void> {
    try {
      await unlink(this.credentialPath)
    } catch (error) {
      if (!isRecord(error) || error.code !== 'ENOENT') {
        throw new Error('Could not remove the encrypted GitHub credential.', { cause: error })
      }
    }
  }

  private async requestDeviceAuthorization(): Promise<DeviceAuthorization> {
    const form = new URLSearchParams({ client_id: this.clientId, scope: 'repo read:user' })
    let response: Response
    try {
      response = await fetch(deviceAuthorizationUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form
      })
    } catch (error) {
      throw new Error(
        'Could not contact GitHub to start authorization. Check your network and try again.',
        { cause: error }
      )
    }
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok || !isRecord(body)) {
      throw new Error(parseRetryMessage(response, body))
    }
    const deviceCode = body.device_code
    const userCode = body.user_code
    const verificationUri = body.verification_uri
    const expiresIn = body.expires_in
    const interval = body.interval
    if (
      typeof deviceCode !== 'string' ||
      !deviceCode ||
      typeof userCode !== 'string' ||
      !/^[A-Z0-9-]{5,12}$/.test(userCode) ||
      verificationUri !== githubDeviceUrl ||
      typeof expiresIn !== 'number' ||
      typeof interval !== 'number'
    ) {
      throw new Error('GitHub returned an invalid device authorization response.')
    }
    return { deviceCode, userCode, expiresIn, interval }
  }

  private async runDeviceAuthorization(
    authorization: DeviceAuthorization,
    controller: AbortController
  ): Promise<void> {
    try {
      await shell.openExternal(githubDeviceUrl)
      const dialogOptions = {
        type: 'info' as const,
        title: 'Connect GitHub repositories',
        message: 'Enter this one-time code on GitHub',
        detail: `${authorization.userCode}\n\nGitHub opened ${githubDeviceUrl}. This code expires in ${Math.ceil(authorization.expiresIn / 60)} minutes.`,
        buttons: ['I entered the code', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      }
      const parent = this.getWindow()
      const { response } = parent
        ? await dialog.showMessageBox(parent, dialogOptions)
        : await dialog.showMessageBox(dialogOptions)
      if (response !== 0) {
        controller.abort()
        this.emit({
          connected: false,
          connecting: false,
          message: 'GitHub authorization cancelled.'
        })
        return
      }

      const credential = await this.pollForToken(authorization, controller.signal)
      const profile = await this.fetchUser(credential.accessToken)
      credential.username = profile
      await this.saveCredential(credential)
      this.emit({ connected: true, connecting: false, username: profile })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub authorization failed.'
      if (!controller.signal.aborted) {
        this.emit({ connected: false, connecting: false, message })
      }
    } finally {
      if (this.deviceController === controller) this.deviceController = null
    }
  }

  private async pollForToken(
    authorization: DeviceAuthorization,
    signal: AbortSignal
  ): Promise<StoredCredential> {
    const deadline = Date.now() + authorization.expiresIn * 1000
    let interval = Math.max(authorization.interval, 5) * 1000

    while (Date.now() < deadline) {
      await wait(interval, signal)
      const form = new URLSearchParams({
        client_id: this.clientId,
        device_code: authorization.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
      let response: Response
      try {
        response = await fetch(accessTokenUrl, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: form,
          signal
        })
      } catch (error) {
        if (signal.aborted) {
          throw new Error('GitHub authorization was cancelled.', { cause: error })
        }
        throw new Error('Could not contact GitHub while waiting for authorization.', {
          cause: error
        })
      }

      const body: unknown = await response.json().catch(() => null)
      if (!isRecord(body)) throw new Error('GitHub returned an invalid authorization response.')
      const errorCode = body.error
      if (typeof errorCode === 'string') {
        if (errorCode === 'authorization_pending') continue
        if (errorCode === 'slow_down') {
          interval += 5000
          continue
        }
        if (errorCode === 'access_denied') throw new Error('GitHub authorization was denied.')
        if (errorCode === 'expired_token')
          throw new Error('GitHub authorization code expired. Try connecting again.')
        if (errorCode === 'device_flow_disabled') {
          throw new Error('Enable Device Flow in the GitHub OAuth App settings, then try again.')
        }
        throw new Error(
          'GitHub could not authorize this app. Check the GitHub OAuth App Client ID and Device Flow settings.'
        )
      }
      if (!response.ok || typeof body.access_token !== 'string') {
        throw new Error(parseRetryMessage(response, body))
      }

      const now = Date.now()
      const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : undefined
      const refreshExpiresIn =
        typeof body.refresh_token_expires_in === 'number'
          ? body.refresh_token_expires_in
          : undefined
      return {
        accessToken: body.access_token,
        username: '',
        ...(typeof body.refresh_token === 'string' ? { refreshToken: body.refresh_token } : {}),
        ...(expiresIn ? { expiresAt: now + expiresIn * 1000 } : {}),
        ...(refreshExpiresIn ? { refreshExpiresAt: now + refreshExpiresIn * 1000 } : {})
      }
    }
    throw new Error('GitHub authorization timed out. Start the connection again.')
  }

  private async getUsableCredential(credential: StoredCredential): Promise<StoredCredential> {
    if (!credential.expiresAt || credential.expiresAt > Date.now() + 60_000) return credential
    if (
      !credential.refreshToken ||
      (credential.refreshExpiresAt !== undefined && credential.refreshExpiresAt <= Date.now())
    ) {
      await this.clearCredential()
      const message = 'GitHub authorization expired. Connect GitHub again.'
      this.emit({ connected: false, connecting: false, message })
      throw new GitHubAuthorizationError(message)
    }

    const form = new URLSearchParams({
      client_id: this.clientId,
      grant_type: 'refresh_token',
      refresh_token: credential.refreshToken
    })
    let response: Response
    try {
      response = await fetch(accessTokenUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form
      })
    } catch {
      throw new Error('Could not refresh GitHub authorization. Check your network and try again.')
    }
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok || !isRecord(body) || typeof body.access_token !== 'string') {
      await this.clearCredential()
      const message = 'GitHub authorization expired. Connect GitHub again.'
      this.emit({ connected: false, connecting: false, message })
      throw new GitHubAuthorizationError(message)
    }

    const now = Date.now()
    const refreshed: StoredCredential = {
      accessToken: body.access_token,
      username: credential.username,
      ...(typeof body.refresh_token === 'string'
        ? { refreshToken: body.refresh_token }
        : { refreshToken: credential.refreshToken }),
      ...(typeof body.expires_in === 'number' ? { expiresAt: now + body.expires_in * 1000 } : {}),
      ...(typeof body.refresh_token_expires_in === 'number'
        ? { refreshExpiresAt: now + body.refresh_token_expires_in * 1000 }
        : credential.refreshExpiresAt !== undefined
          ? { refreshExpiresAt: credential.refreshExpiresAt }
          : {})
    }
    await this.saveCredential(refreshed)
    return refreshed
  }

  private async fetchUser(token: string): Promise<string> {
    const body = await this.githubRequest(githubUserUrl, token)
    if (
      !isRecord(body) ||
      typeof body.login !== 'string' ||
      !/^[A-Za-z0-9-]{1,39}$/.test(body.login)
    ) {
      throw new Error('GitHub did not return a valid account profile.')
    }
    return body.login
  }

  private async fetchRepositories(token: string): Promise<GitHubRepository[]> {
    const repositories: GitHubRepository[] = []
    for (let page = 1; ; page += 1) {
      const url = new URL('https://api.github.com/user/repos')
      url.search = new URLSearchParams({
        visibility: 'all',
        affiliation: 'owner,collaborator,organization_member',
        per_page: '100',
        page: String(page),
        sort: 'updated',
        direction: 'desc'
      }).toString()
      const body = await this.githubRequest(url.toString(), token)
      if (!Array.isArray(body)) throw new Error('GitHub returned an invalid repository list.')
      for (const item of body) {
        const repository = this.toRepository(item)
        if (repository) repositories.push(repository)
      }
      if (body.length < 100) return repositories
    }
  }

  private toRepository(value: unknown): GitHubRepository | null {
    if (!isRecord(value)) return null
    const id = value.id
    const fullName = value.full_name
    const rawUrl = value.html_url
    if (
      typeof id !== 'number' ||
      typeof fullName !== 'string' ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName) ||
      typeof rawUrl !== 'string'
    ) {
      return null
    }

    let url: string
    try {
      url = validateGitHubUrl(rawUrl)
    } catch {
      return null
    }
    return {
      id,
      fullName,
      description: typeof value.description === 'string' ? value.description : null,
      visibility: value.private === true ? 'private' : 'public',
      defaultBranch: typeof value.default_branch === 'string' ? value.default_branch : '',
      url,
      language: typeof value.language === 'string' ? value.language : null,
      updatedAt: typeof value.updated_at === 'string' ? value.updated_at : null
    }
  }

  private async githubRequest(url: string, token: string): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': apiVersion
        }
      })
    } catch {
      throw new Error(
        'Could not contact GitHub. Check your network and try refreshing repositories.'
      )
    }

    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const message = parseRetryMessage(response, body)
      if (response.status === 401) throw new GitHubAuthorizationError(message)
      throw new Error(message)
    }
    return body
  }
}

class GitHubAuthorizationError extends Error {}
