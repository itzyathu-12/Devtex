import type { AIProvider } from './ai-provider'
import { GeminiProvider } from './gemini-provider'
import { GroqProvider } from './groq-provider'
import { OpenAIProvider } from './openai-provider'
import { getPreferences } from '../settings'

/**
 * Factory that returns the provider instance based on user preferences.
 * It lazily creates the provider on each call – providers are lightweight.
 */
export async function getCurrentAIProvider(): Promise<AIProvider> {
  const prefs = await getPreferences()
  const provider = prefs.aiProvider
  switch (provider) {
    case 'gemini':
      return new GeminiProvider()
    case 'groq':
      return new GroqProvider()
    case 'openai':
      return new OpenAIProvider()
    default:
      throw new Error(`Unsupported AI provider: ${provider}`)
  }
}

