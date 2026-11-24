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
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

import { useSiteEndpoints } from '@/hooks/use-site-endpoints'

/**
 * What the page is, in three lines, plus the two addresses a reader needs
 * before scrolling anywhere: the site and the base_url. The rule above the
 * strip is the page's strongest line, so the numbers below it are read as
 * facts rather than as decoration.
 */
export function TutorialHero() {
  const { t } = useTranslation()
  const endpoints = useSiteEndpoints()

  const facts = [
    { label: t('Site'), value: endpoints.site },
    { label: t('OpenAI-compatible base_url'), value: endpoints.base },
    { label: t('Updated'), value: '2026-11' },
  ]

  return (
    <header>
      <p className='text-muted-foreground text-[11px] leading-[1.4] tracking-[0.08em]'>
        {t('Tutorial · Getting started')}
      </p>
      <h1 className='mt-3 max-w-[720px] text-2xl leading-[1.32] font-bold tracking-tight sm:mt-4 sm:text-[32px] sm:leading-[1.24]'>
        {t('Beginner tutorial: from signing up to your first request')}
      </h1>
      <p className='text-muted-foreground mt-3.5 max-w-[640px] text-sm leading-[1.75]'>
        {t(
          'The gateway keeps every model on sale behind one set of endpoints. This page covers two things only: getting a key and making the first request. The last section is the same facts written for an agent.'
        )}
      </p>

      <dl className='border-t-foreground border-b-border mt-6 flex flex-wrap items-baseline gap-x-5 gap-y-0.5 border-t border-b py-3 text-xs leading-[1.7] sm:mt-7'>
        {facts.map((fact, index) => (
          <Fragment key={fact.label}>
            {index > 0 && (
              <span aria-hidden='true' className='text-border hidden sm:inline'>
                ·
              </span>
            )}
            <div className='flex items-baseline'>
              <dt className='text-muted-foreground mr-1.5'>{fact.label}</dt>
              <dd className='font-mono break-all'>{fact.value}</dd>
            </div>
          </Fragment>
        ))}
      </dl>
    </header>
  )
}
