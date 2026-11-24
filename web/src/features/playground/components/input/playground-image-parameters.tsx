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
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'

import {
  IMAGE_COUNT_MAX,
  IMAGE_COUNT_MIN,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_SIZE_OPTIONS,
} from '../../constants'
import { clampImageCount } from '../../lib'
import type { PlaygroundConfig } from '../../types'

type PlaygroundImageParametersProps = {
  config: PlaygroundConfig
  disabled?: boolean
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
}

const CARD_CLASS_NAME =
  'border-border/70 bg-background/60 grid gap-2 rounded-lg border p-3 transition-opacity'

/**
 * Image mode parameters. Chat-only knobs (temperature, top_p, penalties,
 * max_tokens, seed) and streaming do not apply to `/pg/images/generations`,
 * so this panel replaces them instead of disabling them.
 */
export function PlaygroundImageParameters(
  props: PlaygroundImageParametersProps
) {
  const { t } = useTranslation()

  return (
    <div className='grid gap-3'>
      <div className={cn(CARD_CLASS_NAME, props.disabled && 'opacity-55')}>
        <label
          className='text-sm leading-5 font-medium'
          htmlFor='playground-image-size'
        >
          {t('Image size')}
        </label>
        <NativeSelect
          className='w-full'
          disabled={props.disabled}
          id='playground-image-size'
          onChange={(event) =>
            props.onConfigChange('image_size', event.target.value)
          }
          value={props.config.image_size}
        >
          {IMAGE_SIZE_OPTIONS.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.labelKey ? t(option.labelKey) : option.value}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className={cn(CARD_CLASS_NAME, props.disabled && 'opacity-55')}>
        <label
          className='text-sm leading-5 font-medium'
          htmlFor='playground-image-quality'
        >
          {t('Image quality')}
        </label>
        <NativeSelect
          className='w-full'
          disabled={props.disabled}
          id='playground-image-quality'
          onChange={(event) =>
            props.onConfigChange('image_quality', event.target.value)
          }
          value={props.config.image_quality}
        >
          {IMAGE_QUALITY_OPTIONS.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.labelKey ? t(option.labelKey) : option.value}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className={cn(CARD_CLASS_NAME, props.disabled && 'opacity-55')}>
        <label
          className='text-sm leading-5 font-medium'
          htmlFor='playground-image-count'
        >
          {t('Image count')}
        </label>
        <Input
          disabled={props.disabled}
          id='playground-image-count'
          inputMode='numeric'
          max={IMAGE_COUNT_MAX}
          min={IMAGE_COUNT_MIN}
          onChange={(event) =>
            props.onConfigChange(
              'image_n',
              clampImageCount(Number.parseInt(event.target.value, 10))
            )
          }
          step={1}
          type='number'
          value={props.config.image_n}
        />
      </div>
    </div>
  )
}
