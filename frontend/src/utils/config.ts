import { LLMConfig } from '../types'

const CONFIG_KEY = 'llm_config'

// 随机选择渠道，按吞吐量分配概率
const getRandomChannel = (): number => {
  const throughput = [200, 80, 500, 500]  // 渠道 1, 2, 3, 4 的吞吐量
  const totalThroughput = throughput.reduce((sum, val) => sum + val, 0)
  
  const rand = Math.floor(Math.random() * totalThroughput)
  let cumulative = 0
  
  for (let i = 0; i < throughput.length; i++) {
    cumulative += throughput[i]
    if (rand < cumulative) {
      return i + 1
    }
  }
  
  return 4  // fallback
}

const defaultConfig: LLMConfig = {
  api_key: '',
  api_base_url: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  use_default_model: getRandomChannel(),
  context_length: 1,
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
