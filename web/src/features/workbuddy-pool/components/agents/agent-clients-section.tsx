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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Wand2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TitledCard } from '@/components/ui/titled-card'

import { hubPost } from '../../api'
import { AgentClientCard } from './agent-client-card'
import {
  agentClients,
  modelId,
  type HubAgentActionResult,
  type HubAgentClient,
  type HubAgentsPayload,
  type HubAgentKey,
} from './types'

type Pending = { client: HubAgentClient; action: 'apply' | 'restore' }

/**
 * One-click setup for the AI clients installed on the gateway host. Applying
 * rewrites those clients' config files on that machine, so both actions are
 * confirmed and both say plainly that they are host-local.
 */
export function AgentClientsSection(props: { payload: HubAgentsPayload }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const clients = agentClients(props.payload)
  const keys = props.payload.keys ?? props.payload.api_keys ?? []
  const models = props.payload.models ?? []
  const [baseUrl, setBaseUrl] = useState(props.payload.gateway?.base_url ?? '')
  const [keyId, setKeyId] = useState('global')
  const [model, setModel] = useState('none')
  const [pending, setPending] = useState<Pending | null>(null)

  const run = useMutation({
    mutationFn: async (target: Pending) => {
      const body =
        target.action === 'apply'
          ? {
              client: target.client.id,
              client_id: target.client.id,
              base_url: baseUrl.trim(),
              key_id: keyId === 'global' ? '' : keyId,
              model: model === 'none' ? '' : model,
              models: models.map(modelId).filter((id) => id !== ''),
            }
          : { client: target.client.id, client_id: target.client.id }
      const key = target.action === 'apply' ? 'agents.apply' : 'agents.restore'
      const response = await hubPost<HubAgentActionResult>(key, body)
      if (!response.success) {
        throw new Error(response.message || t('The agent action failed.'))
      }
      if (response.data?.ok === false) {
        throw new Error(
          response.data.message ||
            response.data.error?.message ||
            t('The agent action failed.')
        )
      }
      return target
    },
    onSuccess: async (target) => {
      const label = target.client.label || target.client.id
      setPending(null)
      toast.success(
        target.action === 'apply'
          ? t('Configured {{client}} on the gateway host.', { client: label })
          : t('Restored the original config of {{client}}.', { client: label })
      )
      await queryClient.invalidateQueries({ queryKey: ['workbuddy', 'agents'] })
    },
    onError: (error: Error) => {
      setPending(null)
      toast.error(error.message)
    },
  })

  const pendingLabel = pending?.client.label || pending?.client.id || ''
  const restoring = pending?.action === 'restore'

  return (
    <TitledCard
      icon={<Wand2 />}
      title={t('Installed clients')}
      description={t(
        'These actions rewrite configuration files on the machine running the gateway, not on this browser. Each file is backed up first.'
      )}
    >
      <div className='space-y-4'>
        <div className='grid gap-3 sm:grid-cols-3'>
          <div className='space-y-1'>
            <p className='text-muted-foreground text-xs'>{t('Base URL')}</p>
            <Input
              value={baseUrl}
              placeholder='http://gateway:8788/v1'
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <p className='text-muted-foreground text-xs'>{t('API key')}</p>
            <Select
              value={keyId}
              onValueChange={(value) => setKeyId(value ?? '')}
            >
              <SelectTrigger aria-label={t('API key')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='global'>{t('Global API key')}</SelectItem>
                  {keys.map((key: HubAgentKey) => (
                    <SelectItem
                      key={String(key.id)}
                      value={String(key.id ?? '')}
                      disabled={key.enabled === false}
                    >
                      {key.name || String(key.id)}
                      {key.realm ? ` (${key.realm})` : ''}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1'>
            <p className='text-muted-foreground text-xs'>{t('Model')}</p>
            <Select
              value={model}
              onValueChange={(value) => setModel(value ?? '')}
            >
              <SelectTrigger aria-label={t('Model')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='none'>{t('Not specified')}</SelectItem>
                  {models.map((entry) => {
                    const id = modelId(entry)
                    if (id === '') return null
                    return (
                      <SelectItem key={id} value={id}>
                        {id}
                      </SelectItem>
                    )
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        {clients.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {t('No client was detected on the gateway host.')}
          </p>
        ) : (
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {clients.map((client) => (
              <AgentClientCard
                key={client.id}
                client={client}
                onApply={(target) =>
                  setPending({ client: target, action: 'apply' })
                }
                onRestore={(target) =>
                  setPending({ client: target, action: 'restore' })
                }
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={
          restoring
            ? t('Restore the original config of {{client}}?', {
                client: pendingLabel,
              })
            : t('Configure {{client}}?', { client: pendingLabel })
        }
        desc={
          restoring
            ? t(
                'The files written by the one-click setup are replaced by the backup taken before it ran. Any change made to them afterwards is lost. This happens on the gateway host.'
              )
            : t(
                'The client config on the gateway host is rewritten to point at {{baseUrl}} and the existing files are backed up first.',
                { baseUrl: baseUrl.trim() || t('the gateway') }
              )
        }
        destructive={restoring}
        confirmText={restoring ? t('Restore') : t('Configure')}
        isLoading={run.isPending}
        handleConfirm={() => {
          if (pending) run.mutate(pending)
        }}
      />
    </TitledCard>
  )
}
