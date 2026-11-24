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
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { FadeIn } from '@/components/page-transition'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import { AGENT_CLIENTS } from '../lib/agents'
import { AgentGuide } from './agent-guide'
import { ApiGuide } from './api-guide'
import { DshGuide } from './dsh-guide'

/** One entry of the quick-start navigation; `name` is null for the API guide. */
type ClientEntry = { id: string; name: string | null }

/**
 * DSH comes first: it is the one client the site can set up on its own. Calling
 * the API from one's own code comes last and names no client.
 */
const CLIENTS: ClientEntry[] = [
  { id: 'dsh', name: 'DSH' },
  ...AGENT_CLIENTS,
  { id: 'api', name: null },
]

/**
 * The row is one line wide, so only these entries get an entry of their own;
 * every further client sits in the "More clients" menu instead of being
 * scrolled out of the visible end of the row.
 */
const ROW_CLIENT_IDS = new Set(['dsh', 'claude-code', 'codex', 'api'])

const ROW_CLIENTS = CLIENTS.filter((client) => ROW_CLIENT_IDS.has(client.id))

const MORE_CLIENTS = AGENT_CLIENTS.filter(
  (client) => !ROW_CLIENT_IDS.has(client.id)
)

/**
 * The look shared by a row entry and the "More clients" trigger, which stands
 * in for the chosen entry when that entry is not in the row itself.
 */
function entryClassName(isCurrent: boolean) {
  return cn(
    'inline-flex items-center gap-1 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors duration-(--motion-fast)',
    isCurrent
      ? 'border-foreground text-foreground'
      : 'border-transparent text-muted-foreground hover:text-foreground'
  )
}

/**
 * The quick-start section: a centred row of clients to start with, and the
 * guide for the chosen one. The choice lives in the URL hash, so a guide can
 * be linked to and the back button steps through the ones visited.
 */
export function QuickStart(props: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const hash = useLocation({ select: (location) => location.hash })
  const active = CLIENTS.find((client) => client.id === hash) ?? CLIENTS[0]
  const agent = AGENT_CLIENTS.find((client) => client.id === active.id)
  // The chosen client when it lives in the menu rather than in the row: the
  // trigger then names it, so the row still shows which guide is open.
  const moreActive = MORE_CLIENTS.find((client) => client.id === active.id)

  const showGuide = useCallback(
    (id: string) => {
      void navigate({
        to: '.',
        hash: id,
        hashScrollIntoView: false,
        resetScroll: false,
      })
    },
    [navigate]
  )

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
    <section className={cn(!props.embedded && 'pb-24')}>
      <div className='relative border-b'>
        <nav
          ref={row}
          aria-label={t('Quick Start')}
          // The row sits one pixel over the rule below it, so that the current
          // entry's underline covers the rule. The overlap belongs to the row
          // and not to its entries: an entry reaching past a scrolling row's
          // box makes the row scroll up and down as well.
          className='no-scrollbar relative mx-auto -mb-px flex w-fit max-w-full gap-1 overflow-x-auto px-4'
        >
          {ROW_CLIENTS.map((client) => (
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
              className={entryClassName(client.id === active.id)}
            >
              {client.name
                ? t('Start with {{client}}', { client: client.name })
                : t('Call the API directly')}
            </Link>
          ))}

          {MORE_CLIENTS.length > 0 && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger
                aria-current={moreActive ? 'page' : undefined}
                className={entryClassName(Boolean(moreActive))}
              >
                {moreActive
                  ? t('Start with {{client}}', { client: moreActive.name })
                  : t('More clients')}
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  strokeWidth={2}
                  aria-hidden='true'
                  className='size-4'
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start' className='min-w-52'>
                <DropdownMenuRadioGroup
                  value={moreActive?.id ?? ''}
                  onValueChange={showGuide}
                >
                  {MORE_CLIENTS.map((client) => (
                    <DropdownMenuRadioItem key={client.id} value={client.id}>
                      {t('Start with {{client}}', { client: client.name })}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>
        {/* The row scrolls sideways on a phone with no visible scrollbar; the
            fade marks that there is another entry past the right edge. */}
        <span
          aria-hidden='true'
          className='from-background pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l to-transparent md:hidden'
        />
      </div>

      <div
        className={cn(
          'mx-auto w-full',
          props.embedded ? 'pt-6' : 'max-w-[880px] px-4 pt-8'
        )}
      >
        {/* Switching client swaps the whole guide below the row; it arrives on
            the 220ms tab step instead of replacing the text in place. */}
        <FadeIn key={active.id}>
          {active.id === 'api' && <ApiGuide />}
          {active.id !== 'api' &&
            (agent ? (
              <AgentGuide key={agent.id} client={agent} />
            ) : (
              <DshGuide />
            ))}
        </FadeIn>
      </div>
    </section>
  )
}
