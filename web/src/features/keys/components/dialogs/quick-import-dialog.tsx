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
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentGuide } from '@/features/guide/components/agent-guide'
import { AGENT_CLIENTS } from '@/features/guide/lib/agents'

type QuickImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The name of the key being handed over, shown in the heading. */
  keyName: string
  /** The key itself, already revealed. */
  tokenKey: string
}

/**
 * Sets a coding client up with one API key: the quick-start guides, opened
 * from the key's row. CC Switch does the import, or the configuration can be
 * pasted by hand.
 */
export function QuickImportDialog(props: QuickImportDialogProps) {
  const { t } = useTranslation()
  const [clientId, setClientId] = useState(AGENT_CLIENTS[0].id)
  const client =
    AGENT_CLIENTS.find((item) => item.id === clientId) ?? AGENT_CLIENTS[0]

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
      <Tabs
        value={client.id}
        onValueChange={(value) => setClientId(value as typeof clientId)}
      >
        <TabsList className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'>
          {AGENT_CLIENTS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {/* A guide keeps the model picked for its own client, so each client
          gets a fresh one. Nothing is rendered until the key is there. */}
      {props.open && props.tokenKey && (
        <AgentGuide key={client.id} client={client} apiKey={props.tokenKey} />
      )}
      <p className='text-muted-foreground text-sm'>
        {t('Using DSH, or calling the API from your own code?')}{' '}
        <Link to='/' className='text-foreground underline underline-offset-4'>
          {t('Quick Start')}
        </Link>
      </p>
    </Dialog>
  )
}
