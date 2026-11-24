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
import { Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { promoTimeLeft } from '../lib/model-helpers'

/**
 * Marks a limited-time offer with a compact clock badge; the remaining time and
 * the exact end are shown on hover so model names keep the row's width. Renders
 * nothing for a model without an offer, and says so once the time is up.
 */
export function PromoCountdown(props: {
  endsAt: number | undefined
  className?: string
}) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  const endsAt = props.endsAt ?? 0

  useEffect(() => {
    if (!endsAt) return
    // Minutes are the smallest unit shown; half a minute keeps them honest.
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [endsAt])

  if (!endsAt) return null
  const left = promoTimeLeft(endsAt, now)

  let label = t('Offer ended')
  if (left) {
    if (left.days > 0) {
      label = t('{{days}}d {{hours}}h left', {
        days: left.days,
        hours: left.hours,
      })
    } else if (left.hours > 0) {
      label = t('{{hours}}h {{minutes}}m left', {
        hours: left.hours,
        minutes: left.minutes,
      })
    } else {
      label = t('{{minutes}}m left', { minutes: left.minutes })
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-label={
                left ? `${t('Limited time')} · ${label}` : t('Offer ended')
              }
              className={cn(
                'inline-flex cursor-help items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums',
                left
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'bg-muted text-muted-foreground',
                props.className
              )}
            />
          }
        >
          <Clock className='size-3' aria-hidden />
          {left ? t('Limited time') : t('Offer ended')}
        </TooltipTrigger>
        <TooltipContent>
          <div className='flex flex-col gap-0.5'>
            <span className='tabular-nums'>
              {left ? label : t('Offer ended')}
            </span>
            <span className='text-background/80'>
              {t('Limited-time offer, ends {{time}}', {
                time: formatTimestampToDate(endsAt),
              })}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
