import { OpenAICompatibleProvider } from './openai-compatible-provider'

export class GroqProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      id: 'groq',
      label: 'Groq',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      defaultModel: 'llama-3.3-70b-versatile'
    })
  }
}