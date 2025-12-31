import { useState } from 'react'
import { LLMConfig } from '../types'
import { getConfig, saveConfig, getRandomChannel } from '../utils/config'

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
        <h2 className="text-xl font-semibold mb-6">OpenAI 配置（仅浏览器存储，后端不保存，放心填写）</h2>

        <div className="space-y-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={config.use_default_model > 0}
              onChange={(e) =>
                setConfig({ ...config, use_default_model: e.target.checked ? getRandomChannel() : 0 })
              }
              className="mr-2"
            />
            <span className="text-sm text-gray-600">使用免费模型（限量，且可能效果不佳/对话用于提供商训练，建议自带LLM服务）</span>
          </label>

          {config.use_default_model > 0 && (
            <div className="ml-6 space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  渠道（各个渠道无优劣之分，若某渠道无法使用可尝试其他渠道）
                </label>
                <select
                  value={config.use_default_model}
                  onChange={(e) => setConfig({ ...config, use_default_model: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value={1}>1.火山方舟渠道</option>
                  <option value={2}>2.QQ机器人专用渠道</option>
                  <option value={3}>3.openrouter免费模型</option>
                  <option value={4}>4.国产新模型体验渠道</option>
                  <option value={5}>5.临时渠道</option>
                </select>
              </div>
            </div>
          )}

          {config.use_default_model === 0 && (
            <>
              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  API Key（使用Deepseek模型可
                  <a
                    href="https://platform.deepseek.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    点此平台获取
                  </a>
                  ）
                </label>
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
            <label className="block text-sm text-gray-600 mb-2">上下文轮数（0表示不使用历史对话）</label>
            <input
              type="number"
              min="0"
              max="5"
              value={config.context_length}
              onChange={(e) => {
                const value = parseInt(e.target.value)
                setConfig({ ...config, context_length: isNaN(value) ? getRandomChannel() : value })
              }}
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
