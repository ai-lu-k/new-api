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
import { Eye, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import type { HubApiKey } from './types'

const REALM_LABELS: Record<string, string> = {
  any: 'Follow the panel',
  intl: 'International only',
  cn: 'China only',
}

/** One editable key row: name, realm binding, enabled, reveal, delete. */
export function ApiKeyRow(props: {
  row: HubApiKey
  revealed?: string
  onPatch: (patch: Partial<HubApiKey>) => void
  onReveal: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const row = props.row

  return (
    <div className='grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto_auto]'>
      <Input
        value={row.name ?? ''}
        placeholder={t('Name')}
        aria-label={t('Key name')}
        onChange={(event) => props.onPatch({ name: event.target.value })}
      />
      <Select
        value={row.realm === '' || !row.realm ? 'any' : row.realm}
        onValueChange={(value) =>
          props.onPatch({ realm: value === 'any' ? '' : (value ?? '') })
        }
      >
        <SelectTrigger aria-label={t('Egress realm')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {Object.entries(REALM_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {t(label)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <div className='flex items-center gap-2'>
        <Switch
          checked={row.enabled !== false}
          aria-label={t('Key enabled')}
          onCheckedChange={(checked) => props.onPatch({ enabled: checked })}
        />
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label={t('Reveal key')}
          disabled={!row.id}
          onClick={props.onReveal}
        >
          <Eye className='size-4' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label={t('Delete key')}
          onClick={props.onDelete}
        >
          <Trash2 className='size-4' />
        </Button>
      </div>
      {row.id ? (
        <div className='flex items-center gap-1'>
          <code className='text-muted-foreground font-mono text-xs'>
            {props.revealed ?? row.masked ?? row.id}
          </code>
          {props.revealed && (
            <CopyButton value={props.revealed} aria-label={t('Copy key')} />
          )}
        </div>
      ) : (
        <Input
          value={row.key ?? ''}
          placeholder={t('Key value')}
          aria-label={t('Key value')}
          className='font-mono text-xs'
          onChange={(event) => props.onPatch({ key: event.target.value })}
        />
      )}
    </div>
  )
}
