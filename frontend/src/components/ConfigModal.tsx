import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
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
      title={t('config.title')}
      footer={
        <>
          <Button variant="outlined" onClick={onClose} className="flex-1">
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} className="flex-1">
            {t('common.save')}
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
            {t('config.useDefaultModel')}
          </span>
        </label>

        {config.use_default_model > 0 && (
          <div className="ml-7 space-y-3">
            <div>
              <label className="block text-sm text-on-surface-variant mb-2">
                {t('config.channelLabel')}
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
                <option value={1}>{t('config.channel1')}</option>
                <option value={2}>{t('config.channel2')}</option>
                <option value={3}>{t('config.channel3')}</option>
                <option value={4}>{t('config.channel4')}</option>
                <option value={5}>{t('config.channel5')}</option>
              </Select>
            </div>
          </div>
        )}

        {config.use_default_model === 0 && (
          <>
            <div>
              <label className="block text-sm text-on-surface-variant mb-2">
                {t('config.apiKeyLabel')}
                <a
                  href="https://platform.deepseek.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 underline"
                >
                  {t('config.apiKeyLink')}
                </a>
                {t('config.apiKeySuffix')}
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
                {t('config.apiBaseUrl')}
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
                {t('config.model')}
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
            {t('config.contextLength')}
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
