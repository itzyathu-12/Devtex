import { defineConfig } from 'electron-vite'
import { loadEnv } from 'vite'

function valueStatus(value: string | undefined, validate?: (value: string) => boolean): string {
  if (value === undefined) return 'missing'
  if (!value.trim()) return 'empty'
  return validate && !validate(value.trim()) ? 'invalid' : 'configured'
}

function isSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')
  } catch {
    return false
  }
}

function isSupabasePublishableKey(value: string): boolean {
  return (
    value.startsWith('sb_publishable_') ||
    (value.startsWith('eyJ') && value.split('.').length === 3)
  )
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const githubClientId =
    env.GITHUB_OAUTH_CLIENT_ID ?? env.GITHUB_CLIENT_ID ?? env.GITHUB_APP_CLIENT_ID

  return {
    main: {
      define: {
        __GITHUB_OAUTH_CLIENT_ID__: JSON.stringify(githubClientId ?? ''),
        __SUPABASE_URL_STATUS__: JSON.stringify(valueStatus(env.VITE_SUPABASE_URL, isSupabaseUrl)),
        __SUPABASE_KEY_STATUS__: JSON.stringify(
          valueStatus(env.VITE_SUPABASE_PUBLISHABLE_KEY, isSupabasePublishableKey)
        ),
        __GITHUB_OAUTH_CLIENT_STATUS__: JSON.stringify(valueStatus(githubClientId))
      }
    },
    preload: {},
    renderer: {}
  }
})
