import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AppPreferences,
  AppRuntimeInfo,
  ConfigurationValueStatus,
  StartupPage
} from '../shared/settings'

declare const __SUPABASE_URL_STATUS__: ConfigurationValueStatus
declare const __SUPABASE_KEY_STATUS__: ConfigurationValueStatus
declare const __GITHUB_OAUTH_CLIENT_STATUS__: ConfigurationValueStatus

const preferencesPath = join(app.getPath('userData'), 'preferences.json')
const startupPages: StartupPage[] = ['Dashboard', 'Settings']
const defaultPreferences: AppPreferences = { reduceMotion: false, startupPage: 'Dashboard' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function validatePreferences(value: unknown): AppPreferences {
  if (!isRecord(value)) throw new Error('Invalid preferences.')
  if (typeof value.reduceMotion !== 'boolean') throw new Error('Invalid motion preference.')
  if (!startupPages.includes(value.startupPage as StartupPage)) {
    throw new Error('Invalid startup page preference.')
  }
  return { reduceMotion: value.reduceMotion, startupPage: value.startupPage as StartupPage }
}

export async function getPreferences(): Promise<AppPreferences> {
  let serialized: string
  try {
    serialized = await readFile(preferencesPath, 'utf8')
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return { ...defaultPreferences }
    throw error
  }

  try {
    const value: unknown = JSON.parse(serialized)
    return validatePreferences(value)
  } catch {
    return { ...defaultPreferences }
  }
}

export async function savePreferences(value: unknown): Promise<AppPreferences> {
  const preferences = validatePreferences(value)
  await writeFile(preferencesPath, JSON.stringify(preferences, null, 2), { mode: 0o600 })
  return preferences
}

export function getRuntimeInfo(): AppRuntimeInfo {
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    environment: app.isPackaged ? 'production' : 'development',
    supabaseUrlStatus: __SUPABASE_URL_STATUS__,
    supabasePublishableKeyStatus: __SUPABASE_KEY_STATUS__,
    githubOAuthClientStatus: __GITHUB_OAUTH_CLIENT_STATUS__
  }
}
