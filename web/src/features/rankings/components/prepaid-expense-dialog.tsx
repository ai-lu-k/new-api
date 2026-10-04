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
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'

import { savePrepaidExpenses } from '../api'
import {
  EXPENSE_LEDGER_QUERY_KEY,
  EXPENSE_NAME_LIST_ID,
  currentExpenseMonth,
  formatExpenseAmount,
  prepaidMonthlyShare,
} from '../lib'
import type { PrepaidExpense } from '../types'

const MIN_MONTHS = 2
const MAX_MONTHS = 120

type PrepaidExpenseDialogProps = {
  /** Every prepaid expense, the one being edited included. */
  prepaid: PrepaidExpense[]
  /** Position of the one to edit; null adds a new one. */
  index: number | null
  onClose: () => void
}

export function PrepaidExpenseDialog(props: PrepaidExpenseDialogProps) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const original = props.index === null ? null : props.prepaid[props.index]
  const [name, setName] = useState(original?.name ?? '')
  const [amount, setAmount] = useState(
    original ? String(original.amount) : ''
  )
  const [start, setStart] = useState(original?.start ?? currentExpenseMonth())
  const [months, setMonths] = useState(String(original?.months ?? 12))
  const [note, setNote] = useState(original?.note ?? '')
  const [saving, setSaving] = useState(false)

  const amountValue = Number(amount)
  const monthsValue = Number(months)
  const monthsValid =
    Number.isInteger(monthsValue) &&
    monthsValue >= MIN_MONTHS &&
    monthsValue <= MAX_MONTHS

  const publish = async (prepaid: PrepaidExpense[]) => {
    setSaving(true)
    try {
      const result = await savePrepaidExpenses(prepaid)
      if (!result.success) {
        handleServerError(result, t('Save failed'))
        return
      }
      toast.success(t('Saved successfully'))
      await queryClient.invalidateQueries({
        queryKey: EXPENSE_LEDGER_QUERY_KEY,
      })
      props.onClose()
    } catch (e: unknown) {
      handleServerError(e, t('Save failed'))
    } finally {
      setSaving(false)
    }
  }

  const others = props.prepaid.filter((_, i) => i !== props.index)

  const handleSave = () => {
    if (
      !name.trim() ||
      amount.trim() === '' ||
      !Number.isFinite(amountValue) ||
      amountValue < 0
    ) {
      toast.error(t('Each line needs a name and an amount of zero or more.'))
      return
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(start)) {
      toast.error(t('Pick the first month this payment covers.'))
      return
    }
    if (!monthsValid) {
      toast.error(
        t('A prepaid expense covers {{min}} to {{max}} months.', {
          min: MIN_MONTHS,
          max: MAX_MONTHS,
        })
      )
      return
    }
    const entry: PrepaidExpense = {
      name: name.trim(),
      amount: amountValue,
      start,
      months: monthsValue,
      ...(note.trim() ? { note: note.trim() } : {}),
    }
    const next = [...props.prepaid]
    if (props.index === null) next.push(entry)
    else next[props.index] = entry
    publish(next)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={original ? t('Edit prepaid expense') : t('Add prepaid expense')}
      description={t(
        'Everything saved here is shown to every visitor. Amounts are in CNY.'
      )}
      contentHeight='auto'
      contentClassName='sm:max-w-lg'
      bodyClassName='space-y-4'
      footer={
        <>
          {original && (
            <Button
              variant='ghost'
              className='text-destructive me-auto'
              disabled={saving}
              onClick={() => publish(others)}
            >
              {t('Delete')}
            </Button>
          )}
          <Button variant='outline' onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('Saving...') : t('Save')}
          </Button>
        </>
      }
    >
      <div className='space-y-2'>
        <Label htmlFor='prepaid-name'>{t('Expense item')}</Label>
        <Input
          id='prepaid-name'
          list={EXPENSE_NAME_LIST_ID}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
        <div className='space-y-2'>
          <Label htmlFor='prepaid-amount'>{t('Amount paid')}</Label>
          <Input
            id='prepaid-amount'
            type='number'
            min={0}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='prepaid-start'>{t('First month')}</Label>
          <Input
            id='prepaid-start'
            type='month'
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='prepaid-months'>{t('Number of months')}</Label>
          <Input
            id='prepaid-months'
            type='number'
            min={MIN_MONTHS}
            max={MAX_MONTHS}
            step={1}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
        </div>
      </div>
      {monthsValid && amountValue > 0 && (
        <p className='text-muted-foreground text-sm'>
          {t('Each month shows {{share}}.', {
            share: formatExpenseAmount(
              prepaidMonthlyShare(amountValue, monthsValue),
              i18n.language
            ),
          })}
        </p>
      )}
      <div className='space-y-2'>
        <Label htmlFor='prepaid-note'>{t('Note')}</Label>
        <Input
          id='prepaid-note'
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Dialog>
  )
}
