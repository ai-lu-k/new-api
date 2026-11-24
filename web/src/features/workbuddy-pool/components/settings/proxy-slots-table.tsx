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
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import type { HubProxySlot } from './types'

/** The slot table: name, address, probed exit, enable flag, bound accounts. */
export function ProxySlotsTable(props: {
  slots: HubProxySlot[]
  testingKey: string | null
  onPatch: (index: number, patch: Partial<HubProxySlot>) => void
  onTest: (index: number) => void
  onDelete: (index: number) => void
}) {
  const { t } = useTranslation()

  return (
    <StaticDataTable
      data={props.slots}
      getRowKey={(slot, index) => slot.id || `slot-${index}`}
      empty={props.slots.length === 0}
      emptyContent={t('No proxy slots yet.')}
      columns={[
        {
          id: 'name',
          header: t('Name'),
          cell: (slot, index) => (
            <Input
              value={slot.name ?? ''}
              placeholder={slot.label ?? t('Auto from exit')}
              aria-label={t('Slot name')}
              className='w-44'
              onChange={(event) =>
                props.onPatch(index, { name: event.target.value })
              }
            />
          ),
        },
        {
          id: 'url',
          header: t('Proxy address'),
          cell: (slot, index) => (
            <Input
              value={slot.url}
              placeholder='http://host:port'
              aria-label={t('Slot address')}
              className='w-56 font-mono text-xs'
              onChange={(event) =>
                props.onPatch(index, { url: event.target.value })
              }
            />
          ),
        },
        {
          id: 'exit',
          header: t('Exit'),
          cell: (slot) => (
            <div className='text-xs'>
              <p className='font-mono'>{slot.ip || t('Not probed')}</p>
              <p className='text-muted-foreground'>
                {slot.country || t('Country unknown')}
              </p>
            </div>
          ),
        },
        {
          id: 'enabled',
          header: t('Enabled'),
          cell: (slot, index) => (
            <Switch
              checked={slot.enabled !== false}
              aria-label={t('Slot enabled')}
              onCheckedChange={(checked) =>
                props.onPatch(index, { enabled: checked })
              }
            />
          ),
        },
        {
          id: 'bound',
          header: t('Bound accounts'),
          cell: (slot) => <Badge variant='outline'>{slot.bound ?? 0}</Badge>,
        },
        {
          id: 'actions',
          header: t('Actions'),
          cell: (slot, index) => (
            <div className='flex gap-1'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={props.testingKey === (slot.id || `row-${index}`)}
                onClick={() => props.onTest(index)}
              >
                {t('Test')}
              </Button>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label={t('Delete slot')}
                onClick={() => props.onDelete(index)}
              >
                <Trash2 className='size-4' />
              </Button>
            </div>
          ),
        },
      ]}
    />
  )
}
