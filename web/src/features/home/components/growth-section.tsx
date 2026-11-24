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
import { MISSING_FIGURE } from '../lib/figures'
import { FigureRow } from './figure-row'
import { GrowthChart } from './growth-chart'
import { RiseInView } from './rise-in'

export type GrowthSectionProps = {
  figures: HomeFigures
}

/**
 * Thirty days of token volume. The bars come from the same month ranking the
 * rankings page draws; the figures beside them are that series summed and at
 * its busiest day, plus the request count of the same window.
 */
export function GrowthSection(props: GrowthSectionProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const figures = props.figures

  const compact = (value: number | null) =>
    value == null ? MISSING_FIGURE : formatCompactNumber(value, locale)
  const start = figures.days[0]?.date ?? ''
  const end = figures.days.at(-1)?.date ?? ''
  const average =
    figures.totalTokens == null
      ? MISSING_FIGURE
      : formatCompactNumber(figures.totalTokens / figures.days.length, locale)
  const peak = compact(figures.peakTokens)
  const peakDate = figures.peakDate ?? MISSING_FIGURE

  return (
    <section data-slot='home-growth' className='mt-16 min-w-0 sm:mt-[104px]'>
      <SectionHeading as='h2' level='section' title={t('Growing fast')} />
      <p className='text-muted-foreground mt-4 max-w-[720px] text-[13px] leading-[1.7]'>
        {t(
          'Over the last 30 days the site routed {{average}} tokens a day, with {{peak}} on {{peakDate}}.',
          { average, peak, peakDate }
        )}
      </p>

      <RiseInView>
        <GrowthChart
          days={figures.days}
          label={t(
            'Daily tokens from {{start}} to {{end}}, at most {{peak}} on {{peakDate}}',
            { start, end, peak, peakDate }
          )}
        />
      </RiseInView>
      <p className='text-muted-foreground mt-2 text-[11px] leading-[1.45]'>
        {t(
          'Unit: tokens per day. Bars start at zero; labels every three days.'
        )}
      </p>

      <RiseInView>
        <FigureRow
          className='mt-8'
          items={[
            {
              key: 'peak',
              label: t('Peak day'),
              value: peak,
              unit: t('tokens'),
              note: peakDate,
            },
            {
              key: 'total',
              label: t('Tokens, last 30 days'),
              value: compact(figures.totalTokens),
              unit: t('tokens'),
              note: t('{{start}} – {{end}}', { start, end }),
            },
            {
              key: 'requests',
              label: t('Requests, last 30 days'),
              value:
                figures.monthRequests == null
                  ? MISSING_FIGURE
                  : formatNumber(figures.monthRequests, locale),
            },
          ]}
        />
      </RiseInView>
    </section>
  )
}
