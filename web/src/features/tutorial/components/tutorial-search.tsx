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
import { SearchIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import {
  MIN_QUERY_LENGTH,
  searchTutorial,
  type TutorialSearchHit,
} from '../lib/tutorial-search'
import type { TutorialStep } from '../types'

export type TutorialSearchProps = {
  steps: TutorialStep[]
  className?: string
}

/**
 * Search inside the walkthrough: a hairline field over the contents list, and
 * the sections that mention the words under it. A hit jumps to its anchor, so
 * the answer is one click away instead of a scroll through nine sections.
 */
export function TutorialSearch(props: TutorialSearchProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<TutorialSearchHit[]>([])
  const ready = query.trim().length >= MIN_QUERY_LENGTH

  // The page is the index, so the lookup runs after it has rendered and rereads
  // it whenever the query changes.
  useEffect(() => {
    setHits(ready ? searchTutorial(document, props.steps, query) : [])
  }, [query, ready, props.steps])

  return (
    <div className={cn('min-w-0', props.className)}>
      <div className='border-border focus-within:border-foreground relative min-w-0 border-b transition-colors duration-(--motion-fast)'>
        <label className='sr-only' htmlFor={inputId}>
          {t('Search this tutorial')}
        </label>
        <SearchIcon
          aria-hidden='true'
          className='text-muted-foreground pointer-events-none absolute start-0 top-1/2 size-3.5 -translate-y-1/2'
        />
        <input
          id={inputId}
          type='search'
          value={query}
          autoComplete='off'
          placeholder={t('Search this tutorial')}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('')
          }}
          className='placeholder:text-muted-foreground h-8 w-full min-w-0 appearance-none border-0 bg-transparent ps-5 pe-0 text-[12.5px] outline-none [&::-webkit-search-cancel-button]:hidden'
        />
      </div>
      {ready && hits.length === 0 && (
        <p className='text-muted-foreground mt-2 text-[11px] leading-4'>
          {t('No section matches')}
        </p>
      )}
      {hits.length > 0 && (
        <ul className='mt-2 flex flex-col'>
          {hits.map((hit) => (
            <li key={hit.id} className='min-w-0'>
              <a
                href={`#${hit.id}`}
                onClick={() => setQuery('')}
                className='hover:bg-muted/40 flex min-w-0 flex-col gap-0.5 rounded-sm px-1 py-1.5 transition-colors duration-(--motion-fast)'
              >
                <span className='flex min-w-0 items-baseline gap-1.5'>
                  <span className='text-muted-foreground shrink-0 font-mono text-[11px]'>
                    {hit.number}
                  </span>
                  <span className='min-w-0 truncate text-[12.5px] leading-[1.5] font-medium'>
                    {hit.title}
                  </span>
                </span>
                <span className='text-muted-foreground line-clamp-2 text-[11px] leading-[1.5]'>
                  {hit.snippet}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
