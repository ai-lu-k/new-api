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
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'

import { saveExpenseLedger } from '../api'
import { EXPENSE_LEDGER_QUERY_KEY, EXPENSE_NAME_LIST_ID } from '../lib'
import type { ExpenseMonth } from '../types'

type DraftLine = { name: string; amount: string; note: string }

const EMPTY_LINE: DraftLine = { name: '', amount: '', note: '' }

type ExpenseMonthDialogProps = {
  /** Every month entered by hand, the one being edited included. */
  months: ExpenseMonth[]
  /** The month to edit; one that is not in `months` yet is a new month. */
  editing: ExpenseMonth
  onClose: () => void
}

export function ExpenseMonthDialog(props: ExpenseMonthDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isNew = !props.months.some((m) => m.month === props.editing.month)
  const [month, setMonth] = useState(props.editing.month)
  const [lines, setLines] = useState<DraftLine[]>(() =>
    props.editing.items.length > 0
      ? props.editing.items.map((item) => ({
          name: item.name,
          amount: String(item.amount),
          note: item.note ?? '',
        }))
      : [{ ...EMPTY_LINE }]
  )
  const [saving, setSaving] = useState(false)

  const setLine = (index: number, patch: Partial<DraftLine>) => {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line))
    )
  }

  const publish = async (months: ExpenseMonth[]) => {
    setSaving(true)
    try {
      const result = await saveExpenseLedger(months)
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

  const others = props.months.filter((m) => m.month !== props.editing.month)

  const handleSave = () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      toast.error(t('Pick the month these expenses belong to.'))
      return
    }
    if (others.some((m) => m.month === month)) {
      toast.error(t('This month is already listed. Edit that month instead.'))
      return
    }
    const filled = lines.filter(
      (line) => line.name.trim() || line.amount.trim() || line.note.trim()
    )
    const items = filled.map((line) => ({
      name: line.name.trim(),
      amount: Number(line.amount),
      ...(line.note.trim() ? { note: line.note.trim() } : {}),
    }))
    const invalid = items.some(
      (item, index) =>
        !item.name ||
        filled[index].amount.trim() === '' ||
        !Number.isFinite(item.amount) ||
        item.amount < 0
    )
    if (items.length === 0 || invalid) {
      toast.error(t('Each line needs a name and an amount of zero or more.'))
      return
    }
    publish([...others, { month, items }])
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={isNew ? t('Add month') : t('Edit expenses')}
      description={t(
        'Everything saved here is shown to every visitor. Amounts are in CNY.'
      )}
      contentHeight='auto'
      contentClassName='sm:max-w-2xl'
      bodyClassName='space-y-4'
      footer={
        <>
          {!isNew && (
            <Button
              variant='ghost'
              className='text-destructive me-auto'
              disabled={saving}
              onClick={() => publish(others)}
            >
              {t('Delete month')}
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
        <Label htmlFor='expense-month'>{t('Expense month')}</Label>
        <Input
          id='expense-month'
          type='month'
          className='w-48'
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      <div className='space-y-2'>
        {lines.map((line, index) => (
          <div
            // Lines have no identity of their own; the position is the key.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className='grid grid-cols-[minmax(0,1fr)_7rem_2rem] gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1.2fr)_2rem]'
          >
            <Input
              aria-label={t('Expense item')}
              placeholder={t('Expense item')}
              list={EXPENSE_NAME_LIST_ID}
              value={line.name}
              onChange={(e) => setLine(index, { name: e.target.value })}
            />
            <Input
              aria-label={t('Amount')}
              placeholder={t('Amount')}
              type='number'
              min={0}
              step={0.01}
              value={line.amount}
              onChange={(e) => setLine(index, { amount: e.target.value })}
            />
            <Input
              aria-label={t('Note')}
              placeholder={t('Note')}
              className='order-last col-span-3 sm:order-none sm:col-span-1'
              value={line.note}
              onChange={(e) => setLine(index, { note: e.target.value })}
            />
            <Button
              variant='ghost'
              size='icon'
              aria-label={t('Remove')}
              onClick={() =>
                setLines((current) => current.filter((_, i) => i !== index))
              }
            >
              <Trash2 className='size-4' />
            </Button>
          </div>
        ))}
        <Button
          variant='outline'
          size='sm'
          onClick={() => setLines((current) => [...current, { ...EMPTY_LINE }])}
        >
          <Plus />
          {t('Add expense line')}
        </Button>
      </div>
    </Dialog>
  )
}
