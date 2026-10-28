import { OpenAICompatibleProvider } from './openai-compatible-provider'

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      id: 'openai',
      label: 'OpenAI',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      defaultModel: 'gpt-4o-mini'
    })
  }
}