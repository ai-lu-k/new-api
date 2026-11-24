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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useRecentUsage } from '@/features/dashboard/hooks/use-recent-usage'
import { useUsageSource } from '@/features/dashboard/hooks/use-usage-source'
import { useBalance } from '@/hooks/use-balance'
import { toIntlLocale } from '@/i18n/languages'
import { MISSING_BALANCE, isLowBalance } from '@/lib/balance'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber, formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

/** The analysis page the overview's figures also open into. */
const ANALYTICS_SECTION = 'models'

/**
 * The account readout behind the balance: the figure in the bar answers "can I
 * keep working", this answers "where did it go" — the four numbers the overview
 * opens with, without leaving the page, and the two ways on from them.
 *
 * A row of label and amount rather than the overview's large figures: this is a
 * glance, not a page header, and the panel is 260px wide.
 */
function BalancePanel(props: { quota: number | null; close: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const user = useAuthStore((state) => state.auth.user)
  const recent = useRecentUsage()
  const source = useUsageSource().data
  const low = isLowBalance(props.quota)

  const giftKnown = source?.gift_known === true
  const giftRemaining = Number(source?.gift_remaining ?? 0)
  const rows = [
    {
      key: 'recent',
      label: t('24h usage'),
      value: recent.isError ? t('Unavailable') : formatQuota(recent.total),
    },
    {
      key: 'total',
      label: t('Total consumption'),
      value: formatQuota(Number(user?.used_quota ?? 0)),
    },
    {
      key: 'requests',
      label: t('Request Count'),
      value: formatNumber(Number(user?.request_count ?? 0), locale),
    },
  ]

  return (
    <>
      <div className='px-4 pt-3 pb-2.5'>
        <p className='text-muted-foreground text-[11px] leading-none'>
          {t('Balance')}
        </p>
        <p
          data-slot='balance-panel-amount'
          className={cn(
            'mt-1.5 text-[20px] leading-none font-bold tracking-[-0.02em] tabular-nums',
            low && 'text-destructive'
          )}
        >
          {props.quota == null
            ? MISSING_BALANCE
            : formatQuotaWithCurrency(props.quota, { locale })}
        </p>
        {/* The gift side is a fact only when the funding records cover the
            account; an untraceable one says so instead of reading as zero. */}
        {source && (!giftKnown || giftRemaining > 0) ? (
          <p className='text-muted-foreground mt-1.5 text-[11.5px] leading-tight'>
            {giftKnown
              ? t('Gift credit {{amount}}', {
                  amount: formatQuota(giftRemaining),
                })
              : t('Gift credit · Untraceable')}
          </p>
        ) : null}
      </div>

      <dl className='border-border border-t'>
        {rows.map((row) => (
          <div
            key={row.key}
            className='flex items-baseline justify-between gap-3 px-4 py-1.5'
          >
            <dt className='text-muted-foreground text-[12px]'>{row.label}</dt>
            <dd className='text-[12.5px] font-medium tabular-nums'>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className='border-border flex gap-2 border-t p-2'>
        <Button
          size='sm'
          className='h-8 flex-1 rounded-none'
          render={<Link to='/wallet' onClick={props.close} />}
        >
          {t('Top-up')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          className='h-8 flex-1 rounded-none'
          render={
            <Link
              to='/dashboard/$section'
              params={{ section: ANALYTICS_SECTION }}
              onClick={props.close}
            />
          }
        >
          {t('Dashboard')}
        </Button>
      </div>
    </>
  )
}

/**
 * What the account can still spend, standing in the header rather than behind
 * the avatar: it is the one figure a caller checks before working, so it does
 * not deserve a click to read.
 *
 * It is drawn as a number, not as a control: no box, no fill, no icon — the
 * monospaced column is the whole treatment, the way the tables on this site
 * print money. The word "balance" stays for screen readers only. Under five
 * the number turns red, and the underline that marks every link here appears
 * on hover.
 *
 * The figure opens the account readout: the four numbers the overview opens
 * with, then top-up and the analysis page. Phones keep the same readout in the
 * account panel, since their bar already carries brand, campaign, menu and
 * theme.
 */
export function HeaderBalance() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [open, setOpen] = useState(false)
  const quota = useBalance()
  const low = isLowBalance(quota)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        openOnHover={false}
        data-slot='header-balance'
        data-low={low ? 'true' : undefined}
        aria-label={t('Balance and top-up')}
        className='me-2 hidden shrink-0 items-baseline text-[13px] leading-none font-semibold tracking-[-0.01em] tabular-nums underline-offset-4 transition-colors hover:underline data-[popup-open]:underline sm:inline-flex'
      >
        <span className='sr-only'>{t('Balance')}</span>
        <span className={low ? 'text-destructive' : 'text-foreground'}>
          {quota == null
            ? MISSING_BALANCE
            : formatQuotaWithCurrency(quota, { locale })}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        sideOffset={10}
        className='border-border bg-popover text-foreground w-[260px] gap-0 rounded-none border p-0 shadow-none ring-0'
      >
        <BalancePanel quota={quota} close={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}
