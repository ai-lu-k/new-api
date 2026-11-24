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
import { useTranslation } from 'react-i18next'

import { SectionHeading } from '@/components/section-heading'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import type { HomeFigures } from '../hooks'
import { MISSING_FIGURE, estimatedConcurrency } from '../lib/figures'
import { FigureRow } from './figure-row'
import { RiseInView } from './rise-in'

export type ThroughputSectionProps = {
  figures: HomeFigures
}

/**
 * What one day on the gateway carries: how many requests it answers, how many
 * tokens they move, and how many requests are in flight at once.
 *
 * The two volume figures divide the same 30-day totals the growth chart draws
 * by the days that series covers, so they state a day rather than the
 * half-finished one the page happens to be read on. Requests in flight is
 * Little's law over that window — request rate times average duration — so it
 * is an estimate and the block says so.
 */
export function ThroughputSection(props: ThroughputSectionProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const figures = props.figures

  const days = Math.max(figures.days.length, 1)
  const requestsPerDay =
    figures.monthRequests == null
      ? MISSING_FIGURE
      : formatNumber(Math.round(figures.monthRequests / days), locale)
  const tokensPerDay =
    figures.totalTokens == null
      ? MISSING_FIGURE
      : formatCompactNumber(figures.totalTokens / days, locale)
  const concurrency = estimatedConcurrency(
    figures.monthRequests,
    days,
    figures.avgLatencyMs
  )
  const inFlight =
    concurrency == null ? MISSING_FIGURE : formatNumber(concurrency, locale)

  const start = figures.days[0]?.date ?? ''
  const end = figures.days.at(-1)?.date ?? ''
  const windowRow = start && end ? t('{{start}} – {{end}}', { start, end }) : ''

  return (
    <section
      data-slot='home-throughput'
      className='mt-16 min-w-0 sm:mt-[104px]'
    >
      <SectionHeading as='h2' level='section' title={t('High throughput')} />
      <p className='text-muted-foreground mt-4 max-w-[720px] text-[13px] leading-[1.7]'>
        {t(
          'Read from the last 30 days. Daily figures are averages; requests in flight are worked out from the request rate and how long a request takes.'
        )}
      </p>

      <RiseInView>
        <FigureRow
          divided={false}
          className='mt-4'
          items={[
            {
              key: 'requests',
              label: t('Requests per day'),
              value: requestsPerDay,
            },
            {
              key: 'tokens',
              label: t('Tokens per day'),
              value: tokensPerDay,
            },
            {
              key: 'concurrency',
              label: t('Requests in flight, estimated'),
              value: inFlight,
            },
          ]}
        />
      </RiseInView>

      {windowRow && (
        <p className='text-muted-foreground mt-4 text-[11px] leading-[1.5] tabular-nums'>
          {windowRow}
        </p>
      )}
    </section>
  )
}
