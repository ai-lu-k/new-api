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
import { useQuery } from '@tanstack/react-query'
import { Bot, MonitorSmartphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { TitledCard } from '@/components/ui/titled-card'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubGet } from '../api'
import { AgentCliSection } from './agents/agent-cli-section'
import { AgentClientsSection } from './agents/agent-clients-section'
import { ModelSelectionSection } from './agents/model-selection-section'
import type {
  HubAgentAvailability,
  HubAgentsPayload,
  HubModelSelection,
} from './agents/types'

/**
 * One-click setup for the AI clients on the gateway host, plus the model list
 * the setup writes. The hub only serves the client list from the machine
 * running the gateway; off that host it answers `{enabled: false, reason}`, and
 * that is rendered as a plain explanation rather than a failure.
 */
export function AgentsTab() {
  const { t } = useTranslation()
  const agents = useQuery({
    queryKey: ['workbuddy', 'agents'],
    queryFn: async () =>
      requireServerSuccess(await hubGet<HubAgentsPayload>('agents')),
  })
  const availability = useQuery({
    queryKey: ['workbuddy', 'agents', 'available'],
    queryFn: async () =>
      requireServerSuccess(
        await hubGet<HubAgentAvailability>('agents.available')
      ),
  })
  const selection = useQuery({
    queryKey: ['workbuddy', 'agents', 'model-selection'],
    queryFn: async () =>
      requireServerSuccess(
        await hubGet<HubModelSelection>('agents.model-selection')
      ),
  })

  const payload = agents.data?.data
  const enabled =
    availability.data?.data?.enabled !== false && payload?.enabled !== false
  const reason =
    payload?.reason ||
    availability.data?.data?.reason ||
    t(
      'The gateway host is the only machine whose client configs can be rewritten.'
    )
  const chosen = selection.data?.data
  const selected = chosen?.selected_models ?? chosen?.models ?? []

  if (agents.isPending) {
    return <LoadingState />
  }

  return (
    <div className='space-y-4'>
      {enabled ? (
        <AgentClientsSection payload={payload ?? {}} />
      ) : (
        <TitledCard
          icon={<MonitorSmartphone />}
          title={t('Agent config is host-local')}
          description={t(
            'Pointing an AI client at this gateway means rewriting a file on the machine where that client runs.'
          )}
          action={<Badge variant='warning'>{t('Not available here')}</Badge>}
        >
          <div className='space-y-2 text-sm'>
            <p>{reason}</p>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Open this console on the gateway host itself, or use the standalone script below on the machine that has the clients. Saving the model selection still works from here.'
              )}
            </p>
          </div>
        </TitledCard>
      )}

      <ModelSelectionSection
        models={payload?.models ?? []}
        selected={selected}
        configured={chosen?.configured === true}
      />

      <AgentCliSection />

      <p className='text-muted-foreground flex items-center gap-1 text-xs'>
        <Bot className='size-3' />
        {t('Supported clients: [CC], Codex, OpenCode, DSH, Crush and ZCode.')}
      </p>
    </div>
  )
}
