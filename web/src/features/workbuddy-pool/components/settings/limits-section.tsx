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
import { Gauge } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { TitledCard } from '@/components/ui/titled-card'

import {
  LIMIT_ROWS,
  type HubLimitEntry,
  type HubLimitKey,
  type HubLimitScope,
  type HubLimits,
} from './types'

type LimitRow = { key: HubLimitKey; label: string; entry: HubLimitEntry }

function parseCell(raw: string): number | null {
  if (raw.trim() === '') return null
  const value = Math.floor(Number(raw))
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

/**
 * The five guard rails. A global value applies to both realms; a realm column
 * only overrides it, and an empty cell means "inherit the global value" — the
 * same meaning the hub gives a null there.
 */
export function LimitsSection(props: {
  limits: HubLimits
  draft?: HubLimits
  onChange: (limits: HubLimits) => void
}) {
  const { t } = useTranslation()
  const value = props.draft ?? props.limits

  function setCell(key: HubLimitKey, scope: HubLimitScope, raw: string): void {
    const parsed = parseCell(raw)
    const entry: HubLimitEntry = { ...value[key] }
    entry[scope] = scope === 'global' ? (parsed ?? 0) : parsed
    props.onChange({ ...value, [key]: entry })
  }

  const rows: LimitRow[] = LIMIT_ROWS.map((row) => ({
    ...row,
    entry: value[row.key],
  }))

  function describe(entry: HubLimitEntry): string {
    const parts: string[] = []
    if ((entry.global ?? 0) > 0) {
      parts.push(t('Global {{value}}', { value: entry.global }))
    }
    if (entry.intl !== null) {
      parts.push(t('International {{value}}', { value: entry.intl }))
    }
    if (entry.cn !== null) parts.push(t('China {{value}}', { value: entry.cn }))
    if (parts.length === 0) return t('All off')
    return parts.join(' · ')
  }

  return (
    <TitledCard
      icon={<Gauge />}
      title={t('Account limits')}
      description={t(
        'Guard rails for every account. A realm column overrides the global value; leave it empty to inherit. Zero turns that rail off.'
      )}
    >
      <StaticDataTable
        data={rows}
        getRowKey={(row) => row.key}
        columns={[
          {
            id: 'guard',
            header: t('Guard rail'),
            cell: (row) => (
              <div className='min-w-40'>
                <p className='font-medium'>{t(row.label)}</p>
                <Badge variant='outline' className='mt-1 font-normal'>
                  {describe(row.entry)}
                </Badge>
              </div>
            ),
          },
          {
            id: 'global',
            header: t('Global'),
            cell: (row) => (
              <Input
                type='number'
                min={0}
                step={1}
                className='w-24'
                aria-label={t('{{guard}} global value', {
                  guard: t(row.label),
                })}
                value={row.entry.global ?? 0}
                onChange={(event) =>
                  setCell(row.key, 'global', event.target.value)
                }
              />
            ),
          },
          {
            id: 'intl',
            header: t('International'),
            cell: (row) => (
              <Input
                type='number'
                min={0}
                step={1}
                className='w-24'
                placeholder={t('Inherit')}
                aria-label={t('{{guard}} international override', {
                  guard: t(row.label),
                })}
                value={row.entry.intl ?? ''}
                onChange={(event) =>
                  setCell(row.key, 'intl', event.target.value)
                }
              />
            ),
          },
          {
            id: 'cn',
            header: t('China'),
            cell: (row) => (
              <Input
                type='number'
                min={0}
                step={1}
                className='w-24'
                placeholder={t('Inherit')}
                aria-label={t('{{guard}} China override', {
                  guard: t(row.label),
                })}
                value={row.entry.cn ?? ''}
                onChange={(event) => setCell(row.key, 'cn', event.target.value)}
              />
            ),
          },
        ]}
      />
      <p className='text-muted-foreground mt-3 text-xs'>
        {t(
          'Reserved credits, daily token and credit limits, the per-model daily token limit, and the expiring-credit window.'
        )}
      </p>
    </TitledCard>
  )
}
