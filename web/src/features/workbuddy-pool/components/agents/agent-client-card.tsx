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
import { Undo2, Wand2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { HubAgentClient } from './types'

/** One client's card: what it is, where its config lives, and what was applied. */
export function AgentClientCard(props: {
  client: HubAgentClient
  onApply: (client: HubAgentClient) => void
  onRestore: (client: HubAgentClient) => void
}) {
  const { t } = useTranslation()
  const client = props.client
  const label = client.label || client.name || client.id
  const paths =
    client.config_paths ?? (client.config_path ? [client.config_path] : [])
  const detected = Boolean(client.installed || client.detected)
  const applied = client.applied ?? null

  let stateBadge = <Badge variant='outline'>{t('Not detected')}</Badge>
  if (applied) {
    stateBadge = <Badge variant='secondary'>{t('Configured')}</Badge>
  } else if (detected) {
    stateBadge = <Badge variant='outline'>{t('Detected')}</Badge>
  }

  return (
    <div className='flex flex-col gap-2 rounded-xl border p-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='font-medium'>{label}</p>
        {stateBadge}
      </div>
      <p className='text-muted-foreground text-xs'>
        {client.protocol === 'anthropic'
          ? t('Anthropic Messages')
          : t('OpenAI compatible')}
      </p>
      {client.desc && (
        <p className='text-muted-foreground text-xs'>{client.desc}</p>
      )}
      {paths.length > 0 && (
        <p className='text-muted-foreground font-mono text-xs break-all'>
          {paths.join(' · ')}
        </p>
      )}
      {applied && (
        <div className='text-muted-foreground space-y-0.5 text-xs'>
          <p>
            {t('Applied at')}:{' '}
            <span className='font-mono'>{applied.at ?? '-'}</span>
          </p>
          <p>
            {t('Base URL')}:{' '}
            <span className='font-mono'>{applied.base_url || '-'}</span>
          </p>
          <p>
            {t('Model')}:{' '}
            <span className='font-mono'>
              {applied.model || t('Not specified')}
            </span>
          </p>
        </div>
      )}
      {applied?.external_change && (
        <Badge variant='warning'>
          {t('The config changed outside this console since it was applied')}
        </Badge>
      )}
      <div className='mt-1 flex flex-wrap gap-2'>
        <Button
          type='button'
          size='sm'
          disabled={!detected}
          onClick={() => props.onApply(client)}
        >
          <Wand2 className='mr-1 size-4' />
          {applied ? t('Apply again') : t('Configure')}
        </Button>
        {applied && (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => props.onRestore(client)}
          >
            <Undo2 className='mr-1 size-4' />
            {t('Restore original config')}
          </Button>
        )}
      </div>
    </div>
  )
}
