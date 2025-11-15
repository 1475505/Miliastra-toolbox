import { useState } from 'react'
import { LLMConfig } from '../types'
import { getConfig, saveConfig } from '../utils/config'

interface ConfigModalProps {
  onClose: () => void
  onConfigSaved?: () => void
}

export default function ConfigModal({ onClose, onConfigSaved }: ConfigModalProps) {
  const [config, setConfig] = useState<LLMConfig>(getConfig())

  const handleSave = () => {
    saveConfig(config)
    onConfigSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-6">OpenAI 配置</h2>

        <div className="space-y-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={config.use_default_model}
              onChange={(e) =>
                setConfig({ ...config, use_default_model: e.target.checked })
              }
              className="mr-2"
            />
            <span className="text-sm text-gray-600">使用免费模型（可能存在限额或者效果不佳的问题）</span>
          </label>

          {!config.use_default_model && (
            <>
              <div>
                <label className="block text-sm text-gray-600 mb-2">API Key</label>
                <input
                  type="password"
                  value={config.api_key}
                  onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="sk-xxxxxxxx"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">API Base URL</label>
                <input
                  type="text"
                  value={config.api_base_url}
                  onChange={(e) => setConfig({ ...config, api_base_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">Model</label>
                <input
                  type="text"
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm text-gray-600 mb-2">上下文轮数</label>
            <input
              type="number"
              min="1"
              max="20"
              value={config.context_length}
              onChange={(e) =>
                setConfig({ ...config, context_length: parseInt(e.target.value) || 3 })
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
