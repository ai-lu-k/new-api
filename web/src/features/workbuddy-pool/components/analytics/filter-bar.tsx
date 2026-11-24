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

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import dayjs from '@/lib/dayjs'

import {
  ALL_MODELS,
  ALL_MODELS_OPTION,
  REALM_OPTIONS,
  WINDOW_OPTIONS,
  type AnalyticsFilters,
  type AnalyticsRealm,
  type AnalyticsWindow,
} from './types'

type AnalyticsFilterBarProps = {
  filters: AnalyticsFilters
  models: string[]
  since: number
  until: number
  onRealmChange: (realm: AnalyticsRealm) => void
  onWindowChange: (window: AnalyticsWindow) => void
  onModelChange: (model: string) => void
}

/**
 * The tab's three filters. Realm and window are read by the hub, so changing
 * either refetches; the model filter only narrows what is drawn, because the
 * hub's endpoints either carry a per-model breakdown already or have no model
 * dimension at all.
 */
export function AnalyticsFilterBar(
  props: AnalyticsFilterBarProps
): React.JSX.Element {
  const { t } = useTranslation()
  const filters = props.filters
  const bounds = t('{{from}} to {{to}}', {
    from: dayjs(props.since * 1000).format('MM-DD HH:mm'),
    to: dayjs(props.until * 1000).format('MM-DD HH:mm'),
  })

  return (
    <div className='bg-card flex flex-wrap items-end gap-3 rounded-xl border px-4 py-3'>
      <div
        role='group'
        aria-label={t('Realm')}
        className='flex flex-wrap items-center gap-1.5'
      >
        {REALM_OPTIONS.map((option) => (
          <Button
            key={option.value}
            size='sm'
            variant={filters.realm === option.value ? 'default' : 'outline'}
            aria-pressed={filters.realm === option.value}
            onClick={() => props.onRealmChange(option.value)}
          >
            {t(option.label)}
          </Button>
        ))}
      </div>

      <div
        role='group'
        aria-label={t('Time window')}
        className='flex flex-wrap items-center gap-1.5'
      >
        {WINDOW_OPTIONS.map((option) => (
          <Button
            key={option.value}
            size='sm'
            variant={filters.window === option.value ? 'default' : 'outline'}
            aria-pressed={filters.window === option.value}
            onClick={() => props.onWindowChange(option.value)}
          >
            {t(option.label)}
          </Button>
        ))}
      </div>

      <div className='space-y-1'>
        <Label htmlFor='analytics-model' className='text-xs'>
          {t('Model')}
        </Label>
        <Select
          value={
            filters.model === ALL_MODELS ? ALL_MODELS_OPTION : filters.model
          }
          onValueChange={(value) =>
            props.onModelChange(
              value == null || value === ALL_MODELS_OPTION ? ALL_MODELS : value
            )
          }
        >
          <SelectTrigger id='analytics-model' size='sm' className='w-56'>
            <SelectValue>
              <span className='truncate'>
                {filters.model === ALL_MODELS ? t('All models') : filters.model}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_MODELS_OPTION}>
                {t('All models')}
              </SelectItem>
              {props.models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <p className='text-muted-foreground ml-auto text-xs tabular-nums'>
        {bounds}
      </p>
    </div>
  )
}
