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
import { Tag } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { TitledCard } from '@/components/ui/titled-card'

import type { HubScalarSectionProps } from './types'

/**
 * Price estimation for the credit figures the gateway reports. The price table
 * itself lives on the Gateway tab; this section only decides whether prices are
 * fetched and how often.
 */
export function PricingSection(props: HubScalarSectionProps) {
  const { t } = useTranslation()
  const enabled =
    (props.values.pricing_enabled as boolean | undefined) ??
    props.settings.pricing_enabled
  const minutes =
    (props.values.pricing_refresh_minutes as number | undefined) ??
    props.settings.pricing_refresh_minutes
  const inherit =
    (props.values.pricing_variant_inherit as boolean | undefined) ??
    props.settings.pricing_variant_inherit

  return (
    <TitledCard
      icon={<Tag />}
      title={t('Model price estimate')}
      description={t(
        'Fetch model prices and use them to estimate what a request cost in credits.'
      )}
    >
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <Switch
              id='pricing-enabled'
              checked={enabled}
              onCheckedChange={(checked) =>
                props.onChange('pricing_enabled', checked)
              }
            />
            <Label htmlFor='pricing-enabled'>{t('Estimate prices')}</Label>
          </div>
          <div className='flex items-center gap-2'>
            <Label htmlFor='pricing-minutes'>
              {t('Refresh every (minutes)')}
            </Label>
            <Input
              id='pricing-minutes'
              type='number'
              min={0}
              step={1}
              className='w-24'
              value={minutes}
              disabled={!enabled}
              onChange={(event) =>
                props.onChange(
                  'pricing_refresh_minutes',
                  Math.max(0, Math.floor(Number(event.target.value) || 0))
                )
              }
            />
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Switch
            id='pricing-variant-inherit'
            checked={inherit}
            disabled={!enabled}
            onCheckedChange={(checked) =>
              props.onChange('pricing_variant_inherit', checked)
            }
          />
          <Label htmlFor='pricing-variant-inherit'>
            {t('Let suffixed model names inherit the base model price')}
          </Label>
        </div>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Zero minutes turns automatic fetching off; the Gateway tab can still fetch once. The price table itself is on the Gateway tab.'
          )}
        </p>
      </div>
    </TitledCard>
  )
}
