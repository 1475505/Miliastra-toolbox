import { useState } from 'react'

import { LLMConfig } from '../types'
import { getConfig, saveConfig, getRandomChannel } from '../utils/config'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Input from './ui/Input'
import Select from './ui/Select'

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
    <Modal
      open
      onClose={onClose}
      title="LLM 配置（仅浏览器存储，后端不保存，放心填写）"
      footer={
        <>
          <Button variant="outlined" onClick={onClose} className="flex-1">
            取消
          </Button>
          <Button onClick={handleSave} className="flex-1">
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={config.use_default_model > 0}
            onChange={(e) =>
              setConfig({
                ...config,
                use_default_model: e.target.checked ? getRandomChannel() : 0,
              })
            }
            className="mt-1 rounded border-outline text-primary focus:ring-primary"
          />
          <span className="text-sm text-on-surface-variant">
            使用免费模型（限量，且可能效果不佳/对话用于提供商训练，建议自带LLM服务）
          </span>
        </label>

        {config.use_default_model > 0 && (
          <div className="ml-7 space-y-3">
            <div>
              <label className="block text-sm text-on-surface-variant mb-2">
                渠道（仅保证渠道 1 支持图片，但资源紧张，按需使用）
              </label>
              <Select
                value={config.use_default_model}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    use_default_model: parseInt(e.target.value),
                  })
                }
              >
                <option value={1}>1.火山方舟渠道</option>
                <option value={2}>2.QQ机器人专用渠道</option>
                <option value={3}>3.openrouter免费模型</option>
                <option value={4}>4.国产新模型体验渠道</option>
                <option value={5}>5.临时渠道</option>
              </Select>
            </div>
          </div>
        )}

        {config.use_default_model === 0 && (
          <>
            <div>
              <label className="block text-sm text-on-surface-variant mb-2">
                API Key（使用Deepseek模型可
                <a
                  href="https://platform.deepseek.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 underline"
                >
                  点此平台获取
                </a>
                ）
              </label>
              <Input
                type="password"
                value={config.api_key}
                onChange={(e) =>
                  setConfig({ ...config, api_key: e.target.value })
                }
                placeholder="sk-xxxxxxxx"
              />
            </div>

            <div>
              <label className="block text-sm text-on-surface-variant mb-2">
                API Base URL
              </label>
              <Input
                type="text"
                value={config.api_base_url}
                onChange={(e) =>
                  setConfig({ ...config, api_base_url: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-sm text-on-surface-variant mb-2">
                Model
              </label>
              <Input
                type="text"
                value={config.model}
                onChange={(e) =>
                  setConfig({ ...config, model: e.target.value })
                }
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-sm text-on-surface-variant mb-2">
            上下文轮数（0表示不使用历史对话）
          </label>
          <Input
            type="number"
            min="0"
            max="5"
            value={config.context_length}
            onChange={(e) => {
              const value = parseInt(e.target.value)
              setConfig({
                ...config,
                context_length: isNaN(value)
                  ? getRandomChannel()
                  : value,
              })
            }}
          />
        </div>
      </div>
    </Modal>
  )
}
