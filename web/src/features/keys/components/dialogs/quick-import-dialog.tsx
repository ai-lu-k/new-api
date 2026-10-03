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
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentGuide } from '@/features/guide/components/agent-guide'
import { ApiGuide } from '@/features/guide/components/api-guide'
import { DshGuide } from '@/features/guide/components/dsh-guide'
import { AGENT_CLIENTS } from '@/features/guide/lib/agents'
import { useStatus } from '@/hooks/use-status'

type QuickImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The id of the key being handed over. */
  keyId: number
  /** Its name, shown in the heading. */
  keyName: string
  /** The key itself, already revealed. */
  tokenKey: string
}

/**
 * Sets a client up with one API key: the quick-start guides, opened from the
 * key's row. The same ways in as on the quick-start page, in the same order:
 * DSH, the coding agents, then one's own code.
 */
export function QuickImportDialog(props: QuickImportDialogProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [tab, setTab] = useState('dsh')
  const agent = AGENT_CLIENTS.find((item) => item.id === tab)
  // DSH is set up with a one-time code where the site offers that; nothing
  // copied there holds the key. Everything else puts the key on the clipboard.
  const keyStaysHome = tab === 'dsh' && Boolean(status?.dsh_setup_enabled)

  let guide = <DshGuide tokenId={props.keyId} />
  if (agent) {
    guide = <AgentGuide key={agent.id} client={agent} apiKey={props.tokenKey} />
  } else if (tab === 'api') {
    guide = <ApiGuide apiKey={props.tokenKey} />
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Quick import')}
      description={t('Set up a coding client with the key {{name}}.', {
        name: props.keyName,
      })}
      contentClassName='sm:max-w-3xl'
      contentHeight='auto'
      bodyClassName='space-y-5'
    >
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'>
          <TabsTrigger value='dsh'>DSH</TabsTrigger>
          {AGENT_CLIENTS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.name}
            </TabsTrigger>
          ))}
          <TabsTrigger value='api'>{t('Call the API directly')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {keyStaysHome ? (
        <p className='text-muted-foreground flex items-start gap-2 text-sm'>
          <ShieldCheck
            className='text-success mt-0.5 size-4 shrink-0'
            aria-hidden='true'
          />
          {t(
            'Nothing you copy here contains your API key: only a setup code that works once, for 10 minutes. Even so, give it to your own DSH and to nobody else.'
          )}
        </p>
      ) : (
        <p
          role='note'
          className='border-warning/40 bg-warning/10 flex items-start gap-2 rounded-md border px-3 py-2 text-sm'
        >
          <ShieldAlert
            className='text-warning mt-0.5 size-4 shrink-0'
            aria-hidden='true'
          />
          {t(
            'What you copy here contains your full API key. Paste it only into your own configuration file, terminal or code, never into a chat, a ticket or a shared document. If it gets out, disable this key at once.'
          )}
        </p>
      )}
      {/* Nothing is rendered until the key is there. */}
      {props.open && props.tokenKey && guide}
    </Dialog>
  )
}
