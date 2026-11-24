import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

type Props = {
  defaults: Record<string, number>
  value: Record<string, number>
  onChange: (value: Record<string, number>) => void
  disabled?: boolean
}

export function UserModelDailyLimitsEditor(props: Props) {
  const { t, i18n } = useTranslation()
  const prefix = useId()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const models = Object.keys(props.defaults).sort()
  return (
    <div className='space-y-4'>
      {models.length === 0 && (
        <p className='text-muted-foreground text-sm'>
          {t('No model daily token limits configured')}
        </p>
      )}
      {models.map((model, index) => {
        const override = props.value[model]
        let mode = 'custom'
        if (override === undefined) mode = 'inherit'
        if (override === -1) mode = 'unlimited'
        const id = `${prefix}-${index}`
        return (
          <div key={model} className='space-y-2 rounded-lg border p-3'>
            <Label htmlFor={id} className='block font-mono text-xs break-all'>
              {model}
            </Label>
            <div className='grid gap-2 sm:grid-cols-2'>
              <Select
                value={mode}
                disabled={props.disabled}
                onValueChange={(value) => {
                  const next = { ...props.value }
                  if (value === 'inherit') {
                    delete next[model]
                  } else {
                    next[model] =
                      value === 'unlimited'
                        ? -1
                        : (props.defaults[model] ?? 200000000)
                  }
                  props.onChange(next)
                }}
              >
                <SelectTrigger
                  aria-label={t('Daily token limit mode for {{model}}', {
                    model,
                  })}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='inherit'>
                    {t('Inherit global limit')}
                  </SelectItem>
                  <SelectItem value='custom'>
                    {t('Custom daily limit')}
                  </SelectItem>
                  <SelectItem value='unlimited'>{t('Unlimited')}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id={id}
                type='number'
                min={0}
                max={Number.MAX_SAFE_INTEGER}
                step={1}
                disabled={mode !== 'custom' || props.disabled}
                value={mode === 'custom' ? override : ''}
                placeholder={
                  mode === 'inherit'
                    ? formatNumber(props.defaults[model] ?? 0, locale)
                    : t('Unlimited')
                }
                onChange={(event) =>
                  props.onChange({
                    ...props.value,
                    [model]: Number(event.target.value),
                  })
                }
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
