import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AIProviderId,
  AppPreferences,
  AppRuntimeInfo,
  ConfigurationValueStatus,
  StartupPage,
  WorkspaceProject
} from '../shared/settings'

declare const __SUPABASE_URL_STATUS__: ConfigurationValueStatus
declare const __SUPABASE_KEY_STATUS__: ConfigurationValueStatus
declare const __GITHUB_OAUTH_CLIENT_STATUS__: ConfigurationValueStatus

const preferencesPath = join(app.getPath('userData'), 'preferences.json')
const startupPages: StartupPage[] = ['Dashboard', 'Settings', 'AI Chat', 'Profile']
const validProviders: AIProviderId[] = ['gemini', 'groq', 'openai']

export const defaultProviderModels: Record<AIProviderId, string> = {
  gemini: 'gemini-2.5-flash-lite',
  groq: 'openai/gpt-oss-20b',
  openai: 'gpt-4o-mini'
}

const defaultPreferences: AppPreferences = {
  reduceMotion: false,
  startupPage: 'Dashboard',
  geminiModel: defaultProviderModels.gemini,
  aiProvider: 'gemini',
  providerModels: { ...defaultProviderModels },
  projects: []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidGeminiModel(value: unknown): value is string {
  return typeof value === 'string' && /^gemini-[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value)
}

function isValidProviderModel(value: unknown): value is string {
  if (typeof value !== 'string') return false

  const model = value.trim()

  return (
    model.length <= 120 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*(?:\/[A-Za-z0-9][A-Za-z0-9._:-]*)*$/.test(model)
  )
}

function isAIProviderId(value: unknown): value is AIProviderId {
  return typeof value === 'string' && validProviders.includes(value as AIProviderId)
}

function isValidProject(value: unknown): value is WorkspaceProject {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.path === 'string' &&
    typeof value.addedAt === 'string'
  )
}

function validatePreferences(value: unknown): AppPreferences {
  if (!isRecord(value)) throw new Error('Invalid preferences.')
  if (typeof value.reduceMotion !== 'boolean') throw new Error('Invalid motion preference.')
  if (!startupPages.includes(value.startupPage as StartupPage)) {
    throw new Error('Invalid startup page preference.')
  }
  const geminiModel =
    value.geminiModel === undefined ? defaultPreferences.geminiModel : value.geminiModel
  if (!isValidGeminiModel(geminiModel)) throw new Error('Invalid Gemini model identifier.')

  const aiProvider: AIProviderId = isAIProviderId(value.aiProvider)
    ? value.aiProvider
    : defaultPreferences.aiProvider

  const rawModels = isRecord(value.providerModels) ? value.providerModels : {}
  const groqModel = isValidProviderModel(rawModels.groq)
    ? rawModels.groq.trim()
    : defaultProviderModels.groq
  const openaiModel = isValidProviderModel(rawModels.openai)
    ? rawModels.openai.trim()
    : defaultProviderModels.openai

  const projects: WorkspaceProject[] = Array.isArray(value.projects)
    ? value.projects.filter(isValidProject)
    : []

  return {
    reduceMotion: value.reduceMotion,
    startupPage: value.startupPage as StartupPage,
    geminiModel,
    aiProvider,
    providerModels: {
      gemini: geminiModel,
      groq: groqModel,
      openai: openaiModel
    },
    projects
  }
}

export async function getPreferences(): Promise<AppPreferences> {
  let serialized: string
  try {
    serialized = await readFile(preferencesPath, 'utf8')
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return {
        ...defaultPreferences,
        providerModels: { ...defaultProviderModels }
      }
    }
    throw error
  }

  try {
    const value: unknown = JSON.parse(serialized)
    return validatePreferences(value)
  } catch {
    return {
      ...defaultPreferences,
      providerModels: { ...defaultProviderModels }
    }
  }
}

export async function savePreferences(value: unknown): Promise<AppPreferences> {
  const preferences = validatePreferences(value)
  await writeFile(preferencesPath, JSON.stringify(preferences, null, 2), { mode: 0o600 })
  return preferences
}

export async function getProjects(): Promise<WorkspaceProject[]> {
  const preferences = await getPreferences()
  return preferences.projects ?? []
}

export async function addProject(project: WorkspaceProject): Promise<WorkspaceProject[]> {
  const preferences = await getPreferences()
  const current = preferences.projects ?? []
  const filtered = current.filter((p) => p.path !== project.path && p.id !== project.id)
  const updated = [project, ...filtered]
  await savePreferences({ ...preferences, projects: updated })
  return updated
}

export async function removeProject(id: string): Promise<WorkspaceProject[]> {
  const preferences = await getPreferences()
  const current = preferences.projects ?? []
  const updated = current.filter((p) => p.id !== id)
  await savePreferences({ ...preferences, projects: updated })
  return updated
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
