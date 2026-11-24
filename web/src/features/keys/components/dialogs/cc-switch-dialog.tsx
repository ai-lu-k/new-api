/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useState, useEffect, useId, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { getUserModels } from '@/lib/api'
import { MOTION_DURATION, MOTION_SHIFT, MOTION_TRANSITION } from '@/lib/motion'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  buildCCSwitchURL,
  CC_SWITCH_APPS,
  type CCSwitchApp,
} from '../../lib/cc-switch'

const APP_CONFIGS = CC_SWITCH_APPS
type AppType = CCSwitchApp

/**
 * One step of the dialog body. The panel itself arrives on the overlay rules
 * (220ms, 8px); the two blocks inside it follow the same movement one step
 * apart instead of landing as a single slab, and no chain is longer than that.
 */
const SEGMENT_STEP = MOTION_DURATION.fast / 3.5

const SEGMENT_VARIANTS = {
  hidden: { opacity: 0.65, y: MOTION_SHIFT.control },
  show: { opacity: 1, y: 0 },
}

function DialogSegment(props: { step: number; children: ReactNode }) {
  const shouldReduce = useReducedMotion()
  if (shouldReduce) {
    return props.children
  }
  return (
    <motion.div
      variants={SEGMENT_VARIANTS}
      transition={{
        ...MOTION_TRANSITION.base,
        delay: props.step * SEGMENT_STEP,
      }}
    >
      {props.children}
    </motion.div>
  )
}

/**
 * The fields of a CC Switch import: the provider name and the models the
 * application asks for. The dialog shows them, and so does any page that puts
 * the form in place.
 */
export function CCSwitchFields(props: {
  app: AppType
  name: string
  onNameChange: (name: string) => void
  models: Record<string, string>
  onModelChange: (field: string, model: string) => void
  modelOptions: readonly string[]
}) {
  const { t } = useTranslation()
  const id = useId()
  const config = APP_CONFIGS[props.app]
  const options = useMemo(
    () => props.modelOptions.map((m) => ({ value: m, label: m })),
    [props.modelOptions]
  )

  return (
    <>
      <div className='space-y-2'>
        <Label htmlFor={`${id}-name`}>{t('Name')}</Label>
        <Input
          id={`${id}-name`}
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value)}
          placeholder={config.defaultName}
        />
      </div>

      {config.modelFields.map((field) => (
        <div key={field.key} className='space-y-2'>
          <Label htmlFor={`${id}-${field.key}`} required={field.required}>
            {t(field.labelKey)}
          </Label>
          <Combobox
            id={`${id}-${field.key}`}
            aria-label={t(field.labelKey)}
            options={options}
            value={props.models[field.key] || ''}
            onValueChange={(v) => props.onModelChange(field.key, v ?? '')}
            placeholder={t('Select or enter model name')}
            emptyText={t('No models found')}
          />
        </div>
      ))}
    </>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tokenKey: string
}

export function CCSwitchDialog(props: Props) {
  const { t } = useTranslation()
  const shouldReduce = useReducedMotion()
  const [app, setApp] = useState<AppType>('claude')
  const [name, setName] = useState<string>(APP_CONFIGS.claude.defaultName)
  const [models, setModels] = useState<Record<string, string>>({})

  const { data: modelsData } = useQuery({
    queryKey: ['user-models-ccswitch'],
    queryFn: async () => requireServerSuccess(await getUserModels()),
    enabled: props.open,
    staleTime: 5 * 60 * 1000,
  })

  const modelOptions = useMemo(() => modelsData?.data ?? [], [modelsData?.data])

  useEffect(() => {
    if (props.open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModels({})

      setApp('claude')

      setName(APP_CONFIGS.claude.defaultName)
    }
  }, [props.open])

  const handleAppChange = (val: string) => {
    const appVal = val as AppType
    setApp(appVal)
    setName(APP_CONFIGS[appVal].defaultName)
    setModels({})
  }

  const handleSubmit = () => {
    if (!models.model) {
      toast.warning(t('Please select a primary model'))
      return
    }
    const key = props.tokenKey.startsWith('sk-')
      ? props.tokenKey
      : `sk-${props.tokenKey}`
    const url = buildCCSwitchURL(app, name, models, key)
    window.open(url, '_blank')
    props.onOpenChange(false)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Import to CC Switch')}
      contentClassName='sm:max-w-md'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit}>{t('Open CC Switch')}</Button>
        </>
      }
    >
      <motion.div
        className='space-y-4'
        initial={shouldReduce ? false : 'hidden'}
        animate='show'
      >
        <DialogSegment step={0}>
          <div className='space-y-2'>
            <Label>{t('Application')}</Label>
            <RadioGroup
              value={app}
              onValueChange={handleAppChange}
              className='flex flex-wrap gap-x-4 gap-y-2'
            >
              {(
                Object.entries(APP_CONFIGS) as [
                  AppType,
                  (typeof APP_CONFIGS)[AppType],
                ][]
              ).map(([key, cfg]) => (
                <div key={key} className='flex items-center gap-2'>
                  <RadioGroupItem value={key} id={`app-${key}`} />
                  <Label htmlFor={`app-${key}`} className='cursor-pointer'>
                    {cfg.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </DialogSegment>

        <DialogSegment step={1}>
          <CCSwitchFields
            app={app}
            name={name}
            onNameChange={setName}
            models={models}
            onModelChange={(field, model) =>
              setModels((prev) => ({ ...prev, [field]: model }))
            }
            modelOptions={modelOptions}
          />
        </DialogSegment>
      </motion.div>
    </Dialog>
  )
}
