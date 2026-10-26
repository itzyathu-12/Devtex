import { defineConfig } from 'electron-vite'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    main: {
      define: {
        __GITHUB_OAUTH_CLIENT_ID__: JSON.stringify(
          env.GITHUB_OAUTH_CLIENT_ID ?? env.GITHUB_CLIENT_ID ?? env.GITHUB_APP_CLIENT_ID ?? ''
        )
      }
    },
    preload: {},
    renderer: {}
  }
})
