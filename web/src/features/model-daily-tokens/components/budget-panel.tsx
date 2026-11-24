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
import { Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { LearnMore } from '@/components/learn-more'
import {
  SectionPanel,
  type SectionPanelStatus,
} from '@/components/section-panel'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import {
  limitedModels,
  useModelDailyBudgets,
} from '../hooks/use-model-daily-budgets'
import { ModelDailyBudgetRow } from './budget-row'

/**
 * The daily token allowance of the models this account is limited on. It is a
 * page block like every other: a hairline rule, the shared heading, the reset
 * time as its context line, and one row per model.
 */
export function ModelDailyBudgetPanel() {
  const { t, i18n } = useTranslation()
  const query = useModelDailyBudgets()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const snapshot = query.data
  const models = limitedModels(snapshot)
  const resetTime = snapshot
    ? new Date(snapshot.resets_at * 1000).toLocaleTimeString(locale, {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '--'

  let status: SectionPanelStatus = 'ready'
  if (query.isPending) status = 'loading'
  else if (query.isError) status = 'error'
  else if (models.length === 0) status = 'empty'

  return (
    <SectionPanel
      title={t('Model usage limits')}
      description={`${t('Remaining tokens today')} · ${t('Resets daily at {{time}}', { time: resetTime })} · ${t('Beijing time')}`}
      actions={
        <div className='flex shrink-0 items-center gap-1'>
          <LearnMore
            triggerProps={{
              'aria-label': t('Why does this model have a daily limit?'),
              className:
                'size-5 shrink-0 border-0 bg-transparent text-muted-foreground hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent [&_svg]:size-4',
              openOnHover: true,
              delay: 0,
            }}
            contentProps={{
              side: 'bottom',
              align: 'end',
              collisionPadding: 16,
              className: 'w-72 max-w-[calc(100vw-2rem)] text-xs leading-5',
            }}
          >
            <p>
              {t(
                'To share resources fairly and keep the service stable, some models have a daily token limit per user.'
              )}
            </p>
            <p>
              {t(
                'Usage includes input, output, and cached tokens. Once the limit is reached, switch to another model or wait until 00:00 Beijing time for the daily reset.'
              )}
            </p>
          </LearnMore>
          <Button
            type='button'
            size='icon'
            variant='ghost'
            className='text-muted-foreground size-5 shrink-0 [&_svg]:size-4'
            aria-label={t('Refresh model token usage')}
            aria-busy={query.isFetching}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <span
              className={cn(
                'inline-flex',
                query.isFetching && 'animate-spin motion-reduce:animate-none'
              )}
            >
              <HugeiconsIcon
                icon={Refresh01Icon}
                className='size-4'
                strokeWidth={1.8}
                aria-hidden='true'
              />
            </span>
          </Button>
        </div>
      }
      status={status}
      emptyMessage={t('No model daily token limits configured')}
      errorMessage={t('Unable to load model token usage')}
      onRetry={() => void query.refetch()}
      placeholderClassName='h-24'
    >
      <ScrollArea
        role='region'
        aria-label={t('Models')}
        // Two rows: the account block beside it is the taller of the pair, so a
        // long list scrolls here instead of stretching the whole row.
        className='[&_[data-slot=scroll-area-scrollbar]]:w-1.5 [&_[data-slot=scroll-area-viewport]]:max-h-[96px] [&_[data-slot=scroll-area-viewport]]:pr-3'
      >
        {/* Every listed model carries its own usage rule, so a separator
            between rows would draw a second line under it. */}
        <div>
          {models.map((budget) => (
            <ModelDailyBudgetRow key={budget.model} budget={budget} />
          ))}
        </div>
      </ScrollArea>
    </SectionPanel>
  )
}
