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

import { EmptyState } from '@/components/empty-state'
import { cn } from '@/lib/utils'

import type { HubLogEntry } from './types'

const LEVEL_CLASS: Record<string, string> = {
  INFO: 'text-muted-foreground',
  WARN: 'text-warning',
  ERROR: 'text-destructive',
}

/**
 * The log terminal: newest line first, one row per entry. Level, tag and the
 * message are laid out in fixed columns so the eye can scan a column at a time.
 */
export function LogList(props: { entries: HubLogEntry[] }) {
  const { t } = useTranslation()

  if (props.entries.length === 0) {
    return (
      <EmptyState
        title={t('No matching log lines')}
        description={t(
          'Adjust the filters, or turn on auto refresh to wait for new lines.'
        )}
      />
    )
  }

  return (
    <div className='bg-muted max-h-[60vh] overflow-auto rounded-lg border p-3 font-mono text-xs'>
      {props.entries.map((entry) => (
        <div key={entry.id} className='flex gap-2 py-0.5'>
          <span className='text-muted-foreground shrink-0'>{entry.time}</span>
          <span
            className={cn(
              'w-10 shrink-0 font-semibold',
              LEVEL_CLASS[entry.level] ?? 'text-muted-foreground'
            )}
          >
            {entry.level}
          </span>
          <span className='text-muted-foreground w-20 shrink-0 truncate'>
            [{entry.tag || 'system'}]
          </span>
          <span className='break-all whitespace-pre-wrap'>{entry.msg}</span>
        </div>
      ))}
    </div>
  )
}
