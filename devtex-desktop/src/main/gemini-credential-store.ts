import { randomUUID } from 'node:crypto'
import type { GeminiCredentialState, GeminiStorageContext } from '../shared/settings'

/* Raw filesystem and safeStorage errors are intentionally not attached or exposed. */
/* eslint-disable preserve-caught-error */

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean
  isAsyncEncryptionAvailable(): Promise<boolean>
  encryptStringAsync(value: string): Promise<Buffer>
  decryptStringAsync(value: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>
  getSelectedStorageBackend(): string
}

export interface CredentialFileAdapter {
  readFile(path: string): Promise<Buffer>
  writeFile(path: string, data: Buffer, options: { mode: number }): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  unlink(path: string): Promise<void>
}

export class GeminiCredentialError extends Error {
  readonly code: 'unavailable' | 'missing' | 'unreadable' | 'save-failed' | 'remove-failed'

  constructor(
    message: string,
    code: 'unavailable' | 'missing' | 'unreadable' | 'save-failed' | 'remove-failed'
  ) {
    super(message)
    this.name = 'GeminiCredentialError'
    this.code = code
  }
}

export class GeminiCredentialStore {
  private readonly credentialPath: string
  private readonly storage: SafeStorageAdapter
  private readonly fileSystem: CredentialFileAdapter
  private readonly platform: string
  private unreadable = false

  constructor(
    credentialPath: string,
    storage: SafeStorageAdapter,
    fileSystem: CredentialFileAdapter,
    platform: string
  ) {
    this.credentialPath = credentialPath
    this.storage = storage
    this.fileSystem = fileSystem
    this.platform = platform
  }

  getContext(userDataDirectory: string, packaged: boolean): GeminiStorageContext {
    let backend = this.platform
    if (this.platform === 'linux') {
      try {
        backend = this.storage.getSelectedStorageBackend()
      } catch {
        backend = 'unknown'
      }
    }
    return {
      userDataDirectory,
      platform: this.platform,
      packaged,
      backend
    }
  }

  async state(): Promise<GeminiCredentialState> {
    if (this.unreadable) return 'unreadable'
    try {
      await this.fileSystem.readFile(this.credentialPath)
      return 'stored'
    } catch (error) {
      if (this.isMissingFile(error)) return 'missing'
      throw new Error('Could not check the saved Gemini API key.')
    }
  }

  async readKey(): Promise<string> {
    if (this.unreadable) throw this.unreadableError()
    await this.ensureEncryptionAvailable()
    const encrypted = await this.readEncryptedCredential()
    if (encrypted.length === 0 || encrypted.length > 4096) {
      this.unreadable = true
      throw this.unreadableError()
    }
    try {
      const decrypted = await this.storage.decryptStringAsync(encrypted)
      if (typeof decrypted.result !== 'string' || !this.isValidApiKey(decrypted.result)) {
        this.unreadable = true
        throw this.unreadableError()
      }
      return decrypted.result
    } catch (error) {
      if (error instanceof GeminiCredentialError) throw error
      this.unreadable = true
      throw this.unreadableError()
    }
  }

  async saveKey(value: string): Promise<void> {
    const key = this.validateApiKey(value)
    await this.ensureEncryptionAvailable()

    const existingState = await this.state()
    if (existingState === 'unreadable') throw this.unreadableError()
    if (existingState === 'stored') await this.readKey()

    let encrypted: Buffer
    try {
      encrypted = await this.storage.encryptStringAsync(key)
    } catch {
      throw new GeminiCredentialError('Secure credential encryption failed.', 'save-failed')
    }
    if (!Buffer.isBuffer(encrypted) || encrypted.length === 0 || encrypted.length > 4096) {
      throw new GeminiCredentialError('Secure credential encryption failed.', 'save-failed')
    }

    const temporaryPath = `${this.credentialPath}.${randomUUID()}.tmp`
    const backupPath = `${this.credentialPath}.${randomUUID()}.bak`
    let backedUp = false
    try {
      await this.fileSystem.writeFile(temporaryPath, encrypted, { mode: 0o600 })
      if (existingState === 'stored') {
        await this.fileSystem.rename(this.credentialPath, backupPath)
        backedUp = true
      }
      await this.fileSystem.rename(temporaryPath, this.credentialPath)
      this.unreadable = false
    } catch {
      await this.fileSystem.unlink(temporaryPath).catch(() => undefined)
      if (backedUp) {
        await this.fileSystem.rename(backupPath, this.credentialPath).catch(() => undefined)
      }
      throw new GeminiCredentialError('Could not securely save the Gemini API key.', 'save-failed')
    }
    if (backedUp) await this.fileSystem.unlink(backupPath).catch(() => undefined)
  }

  async removeKey(): Promise<void> {
    try {
      await this.fileSystem.unlink(this.credentialPath)
    } catch (error) {
      if (!this.isMissingFile(error)) {
        throw new GeminiCredentialError(
          'Could not remove the saved Gemini API key.',
          'remove-failed'
        )
      }
    }
    this.unreadable = false
  }

  private async readEncryptedCredential(): Promise<Buffer> {
    try {
      return await this.fileSystem.readFile(this.credentialPath)
    } catch (error) {
      if (this.isMissingFile(error)) {
        throw new GeminiCredentialError(
          'Save a Gemini API key in API Configuration first.',
          'missing'
        )
      }
      throw new Error('Could not read the saved Gemini API key.')
    }
  }

  private async ensureEncryptionAvailable(): Promise<void> {
    const asyncAvailable = await this.storage.isAsyncEncryptionAvailable().catch(() => false)
    const syncAvailable = (() => {
      try {
        return this.storage.isEncryptionAvailable()
      } catch {
        return false
      }
    })()
    if (!syncAvailable || !asyncAvailable) {
      throw new GeminiCredentialError(
        'Secure credential storage is unavailable. The Gemini API key was not changed.',
        'unavailable'
      )
    }
    if (this.platform === 'linux' && this.storage.getSelectedStorageBackend() === 'basic_text') {
      throw new GeminiCredentialError(
        'Gemini key storage is disabled because no secure Linux keyring is configured.',
        'unavailable'
      )
    }
  }

  private validateApiKey(value: string): string {
    if (typeof value !== 'string') throw new Error('Enter a valid Gemini API key.')
    const key = value.trim()
    if (key.length < 20 || key.length > 256 || /\s/.test(key)) {
      throw new Error('The Gemini API key format is invalid.')
    }
    return key
  }

  private isValidApiKey(value: string): boolean {
    return value.length >= 20 && value.length <= 256 && !/\s/.test(value)
  }

  private isMissingFile(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
  }

  private unreadableError(): GeminiCredentialError {
    return new GeminiCredentialError(
      'The saved Gemini API key is unreadable in this app data directory or encryption context. Remove it with confirmation, then enter and save the key again.',
      'unreadable'
    )
  }
}
