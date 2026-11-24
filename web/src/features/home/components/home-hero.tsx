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
import { useTranslation } from 'react-i18next'

import { Reveal } from '@/components/motion/reveal'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatPercent } from '@/lib/format'
import { textActionClass } from '@/lib/text-action'
import { cn } from '@/lib/utils'

import type { HomeFigures } from '../hooks'
import { MISSING_FIGURE, formatWindowDay } from '../lib/figures'
import { tokenPrices } from '../lib/model-price'
import { FigureRow } from './figure-row'
import { RiseIn } from './rise-in'

export type HomeHeroProps = {
  figures: HomeFigures
  signedIn: boolean
}

const LINK_CLASS = cn(
  'decoration-border hover:decoration-foreground',
  textActionClass
)

/** Both ways in share one box; only the primary one is filled. */
const ACTION_BOX =
  'inline-flex h-10 items-center justify-center px-5 text-[13px] font-medium'
const PRIMARY_ACTION_CLASS = cn(
  ACTION_BOX,
  'bg-foreground text-background hover:bg-foreground/85'
)
const SECONDARY_ACTION_CLASS = cn(
  ACTION_BOX,
  'border-foreground text-foreground hover:bg-foreground hover:text-background border transition-colors'
)

/** The two models the price line quotes, as the price list names them. */
const QUOTED_MODELS = ['deepseek-v4.1-flash-x0.15', 'gpt-6.1-sol-x0.08']

/**
 * The first screen: what the site is, what two of its models cost, two ways in,
 * and three figures read from the site's own APIs. A signed-in reader gets the
 * way back to their console as the primary action instead of the price list.
 */
export function HomeHero(props: HomeHeroProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const figures = props.figures
  const pricing = usePricingData()
  const quoted = QUOTED_MODELS.map((name) => ({
    name,
    prices: tokenPrices(
      pricing.models.find((model) => model.model_name === name),
      { priceRate: pricing.priceRate, usdExchangeRate: pricing.usdExchangeRate }
    ),
  }))

  const models =
    figures.modelCount == null
      ? MISSING_FIGURE
      : formatNumber(figures.modelCount, locale)
  const successRate =
    figures.successRate == null
      ? MISSING_FIGURE
      : formatPercent(figures.successRate)
  const weekRequests =
    figures.weekRequests == null
      ? MISSING_FIGURE
      : formatNumber(figures.weekRequests, locale)

  // The window the success rate covers; when it is read is not a figure.
  const windowNote =
    figures.windowStart && figures.windowEnd
      ? t('{{start}} – {{end}}', {
          start: formatWindowDay(figures.windowStart),
          end: formatWindowDay(figures.windowEnd),
        })
      : undefined

  return (
    <section data-slot='home-hero' className='min-w-0'>
      {/* The first screen is read once, in order: eyebrow, headline, then the
          paragraph under it, 40ms apart on the 220ms step the landing uses. */}
      <RiseIn>
        <p className='text-muted-foreground text-[11px] leading-[1.4] tracking-[0.08em]'>
          {t('Pay per use · Public ledger · Open source')}
        </p>
      </RiseIn>

      <RiseIn delay={0.04}>
        <h1 className='mt-[18px] max-w-[840px] text-[20px] leading-[1.15] font-bold tracking-[-0.02em] sm:text-[28px] sm:leading-[1.18] md:text-[40px] md:leading-[1.12]'>
          {t('Spend less, run better models.')}
        </h1>
      </RiseIn>

      <RiseIn delay={0.08}>
        <p className='text-muted-foreground mt-4 max-w-[744px] text-[13px] leading-[1.6]'>
          {t(
            'Claude Code, Codex and Cherry Studio need one line of address changed. Pay for what you use, and every charge reconciles in the ledger.'
          )}
        </p>
      </RiseIn>

      <div className='border-foreground border-border mt-7 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-b py-[14px] text-[13px] leading-[1.6]'>
        <span className='text-muted-foreground mr-1'>
          {t('Per million tokens (input / output)')}
        </span>
        {quoted.map((model) => (
          <span
            key={model.name}
            className='flex items-baseline gap-x-2 whitespace-nowrap'
          >
            <span aria-hidden='true' className='text-border mr-1'>
              ·
            </span>
            <span className='font-medium'>{model.name}</span>
            <span className='font-mono text-[13px] tabular-nums'>
              {model.prices ? model.prices.input : MISSING_FIGURE}
              <span aria-hidden='true' className='text-border mx-1'>
                /
              </span>
              {model.prices ? model.prices.output : MISSING_FIGURE}
            </span>
          </span>
        ))}
        <span aria-hidden='true' className='text-border'>
          ·
        </span>
        <Link to='/pricing' className={LINK_CLASS}>
          {t('All prices')}
        </Link>
      </div>

      <div className='mt-6 flex flex-wrap items-center gap-3'>
        <Link
          to={props.signedIn ? '/dashboard' : '/pricing'}
          className={PRIMARY_ACTION_CLASS}
        >
          {props.signedIn ? t('Go to console') : t('See prices and models')}
        </Link>
        <Link to='/tutorial' className={SECONDARY_ACTION_CLASS}>
          {t('Quick start')}
        </Link>
      </div>

      <Reveal>
        <FigureRow
          className='mt-10'
          items={[
            { key: 'models', label: t('Models available'), value: models },
            {
              key: 'success',
              label: t('Success rate, last 24 h'),
              value: successRate,
              note: windowNote,
            },
            {
              key: 'requests',
              label: t('Requests, last 7 days'),
              value: weekRequests,
            },
          ]}
        />
      </Reveal>
    </section>
  )
}
