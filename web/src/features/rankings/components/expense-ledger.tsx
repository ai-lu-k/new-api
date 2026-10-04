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
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getExpenseLedger } from '../api'
import {
  EXPENSE_LEDGER_QUERY_KEY,
  currentExpenseMonth,
  expenseMonthTotal,
  formatExpenseAmount,
  formatExpenseMonth,
} from '../lib'
import type { ExpenseMonth } from '../types'
import { ExpenseChart } from './expense-chart'
import { ExpenseMonthDialog } from './expense-month-dialog'

type ExpenseLedgerProps = {
  /**
   * Offer adding and editing months. Saving is the root user's alone, so only
   * the admin page turns this on; the public page is read-only for everyone.
   */
  editable?: boolean
}

/**
 * What the site paid, month by month, as the operator entered it: a chart of
 * the monthly totals above the lines of each month.
 */
export function ExpenseLedger(props: ExpenseLedgerProps) {
  const { t } = useTranslation()
  const canEdit = props.editable === true
  const [editing, setEditing] = useState<ExpenseMonth | null>(null)
  const query = useQuery({
    queryKey: EXPENSE_LEDGER_QUERY_KEY,
    queryFn: async () => requireServerSuccess(await getExpenseLedger()),
  })
  const months = query.data?.data?.months ?? []

  if (query.isLoading) {
    return <Skeleton className='h-[320px] w-full rounded-xl' />
  }
  if (query.isError) {
    return (
      <div className='bg-card rounded-xl border border-dashed px-6 py-12 text-center'>
        <p className='text-muted-foreground text-sm'>
          {t('Unable to load expenses')}
        </p>
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      {canEdit && (
        <div className='flex justify-end'>
          <Button
            variant='outline'
            size='sm'
            onClick={() =>
              setEditing({ month: currentExpenseMonth(), items: [] })
            }
          >
            <Plus />
            {t('Add month')}
          </Button>
        </div>
      )}

      {months.length === 0 && (
        <div className='bg-card rounded-xl border border-dashed px-6 py-12 text-center'>
          <p className='text-muted-foreground text-sm'>
            {t('No expenses have been published yet.')}
          </p>
        </div>
      )}

      {!canEdit && months.length > 0 && <ExpenseChart months={months} />}

      {months.map((month) => (
        <ExpenseMonthCard
          key={month.month}
          month={month}
          onEdit={canEdit ? () => setEditing(month) : undefined}
        />
      ))}

      {editing && (
        <ExpenseMonthDialog
          key={editing.month}
          months={months}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ExpenseMonthCard(props: {
  month: ExpenseMonth
  onEdit?: () => void
}) {
  const { t, i18n } = useTranslation()
  const title = formatExpenseMonth(props.month.month, i18n.language)

  return (
    <section
      aria-label={title}
      className='bg-card overflow-hidden rounded-xl border'
    >
      <header className='flex items-center justify-between gap-3 border-b px-5 py-4'>
        <div className='flex items-center gap-2'>
          <h2 className='text-base font-semibold'>{title}</h2>
          {props.onEdit && (
            <Button
              variant='ghost'
              size='icon'
              className='size-7'
              aria-label={t('Edit expenses')}
              onClick={props.onEdit}
            >
              <Pencil className='size-3.5' />
            </Button>
          )}
        </div>
        <div className='text-end'>
          <div className='text-muted-foreground text-xs'>{t('Total')}</div>
          <div className='text-lg font-semibold tabular-nums'>
            {formatExpenseAmount(
              expenseMonthTotal(props.month),
              i18n.language
            )}
          </div>
        </div>
      </header>
      <ul className='divide-y'>
        {props.month.items.map((item, index) => (
          <li
            // Lines have no identity of their own; the position is the key.
            // eslint-disable-next-line react/no-array-index-key
            key={`${item.name}:${index}`}
            className='flex items-baseline justify-between gap-6 px-5 py-3'
          >
            <div className='min-w-0'>
              <div className='text-sm font-medium'>{item.name}</div>
              {item.note && (
                <div className='text-muted-foreground mt-0.5 text-xs break-words'>
                  {item.note}
                </div>
              )}
            </div>
            <div className='shrink-0 text-sm tabular-nums'>
              {formatExpenseAmount(item.amount, i18n.language)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
