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

import { Progress } from '@/components/ui/progress'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ModelDailyBudget } from '../api'

/**
 * One hairline row per model: the name, the day's remaining tokens, the used
 * ratio and the state. The bar is the accent of a limited model; an exhausted
 * allowance is the only state that turns red.
 */
export function ModelDailyBudgetRow(props: { budget: ModelDailyBudget }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const budget = props.budget
  const percent =
    budget.limit > 0
      ? Math.max(0, Math.min(100, (budget.used / budget.limit) * 100))
      : 100
  const exhausted = !budget.unlimited && budget.remaining <= 0
  const low = !budget.unlimited && !exhausted && percent >= 90
  let status = t('Available')
  let stateClass = 'text-muted-foreground'
  if (exhausted) {
    status = t('Exhausted')
    stateClass = 'text-destructive'
  } else if (low) {
    status = t('Almost used up')
    stateClass = 'text-foreground'
  }
  const remaining = budget.unlimited
    ? t('Unlimited')
    : formatCompactNumber(budget.remaining, 'en-US')
  return (
    <div className='flex min-w-0 flex-col gap-2 py-2'>
      <div className='flex min-w-0 items-baseline gap-2'>
        <p
          className='min-w-0 flex-1 truncate text-[13px] leading-5 font-medium'
          title={budget.model}
        >
          {budget.model}
        </p>
        <span
          className={cn(
            'shrink-0 text-[15px] leading-5 font-semibold tabular-nums',
            exhausted && 'text-destructive'
          )}
          title={
            budget.unlimited
              ? t('Unlimited')
              : formatNumber(budget.remaining, locale)
          }
        >
          {remaining}
        </span>
        {!budget.unlimited && (
          <span
            className='text-muted-foreground w-9 shrink-0 text-right text-[11px] leading-5 tabular-nums'
            title={t('Used {{used}} / {{limit}}', {
              used: formatNumber(budget.used, locale),
              limit: formatNumber(budget.limit, locale),
            })}
          >
            {formatNumber(Math.round(percent * 10) / 10, locale)}%
          </span>
        )}
        <span
          className={cn(
            'min-w-12 shrink-0 text-right text-[11px] leading-5 whitespace-nowrap',
            stateClass
          )}
        >
          {status}
        </span>
      </div>
      {!budget.unlimited && (
        <Progress
          aria-label={t('Daily token usage for {{model}}', {
            model: budget.model,
          })}
          value={percent}
          className={cn(
            // A visible track keeps the bar reading as a measure of the row
            // instead of an underline under the model name.
            '[&_[data-slot=progress-track]]:h-0.5 [&_[data-slot=progress-track]]:bg-border',
            exhausted && '[&_[data-slot=progress-indicator]]:bg-destructive'
          )}
        />
      )}
    </div>
  )
}
