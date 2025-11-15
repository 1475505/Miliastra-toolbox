import { LLMConfig } from '../types'

const CONFIG_KEY = 'llm_config'

const defaultConfig: LLMConfig = {
  api_key: '',
  api_base_url: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  use_default_model: false,
  context_length: 3,
}

export const getConfig = (): LLMConfig => {
  const stored = localStorage.getItem(CONFIG_KEY)
  if (stored) {
    try {
      return { ...defaultConfig, ...JSON.parse(stored) }
    } catch {
      return defaultConfig
    }
  }
  return defaultConfig
}

export const saveConfig = (config: LLMConfig): void => {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}
