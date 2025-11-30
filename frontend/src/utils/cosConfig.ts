import { COSConfig } from '../types'

const COS_CONFIG_KEY = 'cos_config'

export const getCOSConfig = (): COSConfig => {
  const stored = localStorage.getItem(COS_CONFIG_KEY)
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {
      return { useDefault: true }
    }
  }
  return { useDefault: true }
}

export const saveCOSConfig = (config: COSConfig): void => {
  localStorage.setItem(COS_CONFIG_KEY, JSON.stringify(config))
}
