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
import { Link, useLocation } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { AGENT_CLIENTS } from '../lib/agents'
import { AgentGuide } from './agent-guide'
import { ApiGuide } from './api-guide'
import { DshGuide } from './dsh-guide'

/**
 * DSH comes first: it is the one client the site can set up on its own. Calling
 * the API from one's own code comes last and names no client.
 */
const CLIENTS: { id: string; name: string | null }[] = [
  { id: 'dsh', name: 'DSH' },
  ...AGENT_CLIENTS,
  { id: 'api', name: null },
]

/**
 * The quick-start section: a centred row of clients to start with, and the
 * guide for the chosen one. The choice lives in the URL hash, so a guide can
 * be linked to and the back button steps through the ones visited.
 */
export function QuickStart() {
  const { t } = useTranslation()
  const hash = useLocation({ select: (location) => location.hash })
  const active = CLIENTS.find((client) => client.id === hash) ?? CLIENTS[0]
  const agent = AGENT_CLIENTS.find((client) => client.id === active.id)

  // On a narrow screen the row scrolls sideways; keep the chosen entry in
  // view without moving the page itself.
  const row = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = row.current
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !current) return
    nav.scrollLeft =
      current.offsetLeft - (nav.clientWidth - current.clientWidth) / 2
  }, [active.id])

  return (
    <section className='pb-24'>
      <div className='border-b'>
        <nav
          ref={row}
          aria-label={t('Quick Start')}
          // The row sits one pixel over the rule below it, so that the current
          // entry's underline covers the rule. The overlap belongs to the row
          // and not to its entries: an entry reaching past a scrolling row's
          // box makes the row scroll up and down as well.
          className='no-scrollbar relative mx-auto -mb-px flex w-fit max-w-full gap-1 overflow-x-auto px-4'
        >
          {CLIENTS.map((client) => (
            <Link
              key={client.id}
              to='.'
              hash={client.id}
              hashScrollIntoView={false}
              resetScroll={false}
              // Every entry leads to this same page, so the router has to tell
              // them apart by hash before it marks one as the current page.
              activeOptions={{ includeHash: true }}
              aria-current={client.id === active.id ? 'page' : undefined}
              className={cn(
                'border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors',
                client.id === active.id
                  ? 'border-foreground text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              )}
            >
              {client.name
                ? t('Start with {{client}}', { client: client.name })
                : t('Call the API directly')}
            </Link>
          ))}
        </nav>
      </div>

      <div className='mx-auto w-full max-w-3xl px-4 pt-8'>
        {active.id === 'api' && <ApiGuide />}
        {active.id !== 'api' &&
          (agent ? <AgentGuide key={agent.id} client={agent} /> : <DshGuide />)}
      </div>
    </section>
  )
}
