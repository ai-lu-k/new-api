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
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { formatQuota, parseQuotaFromDollars } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'

import { adjustUserQuota } from '../api'
import type { QuotaAddReason, QuotaAdjustMode } from '../types'

const ADD_REASONS: { id: QuotaAddReason; labelKey: string }[] = [
  { id: 'offline_payment', labelKey: 'Paid offline' },
  { id: 'gift', labelKey: 'Gift' },
  { id: 'compensation', labelKey: 'Compensation' },
  { id: 'test', labelKey: 'Test' },
  { id: 'other', labelKey: 'Other' },
]

interface UserQuotaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: number
  currentQuota: number
  onSuccess: () => void
}

export function UserQuotaDialog(props: UserQuotaDialogProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<QuotaAdjustMode>('add')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState<QuotaAddReason | null>(null)
  const [reasonNote, setReasonNote] = useState('')
  // Money received for a paid addition; empty means "the same as the quota".
  const [paidAmount, setPaidAmount] = useState('')
  const [loading, setLoading] = useState(false)

  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'

  const amountValue = Number.parseFloat(amount) || 0
  const quotaValue = parseQuotaFromDollars(Math.abs(amountValue))

  const getPreviewText = () => {
    const current = props.currentQuota
    const val = quotaValue
    switch (mode) {
      case 'add':
        return `${t('Current quota')}: ${formatQuota(current)}  +${formatQuota(val)} = ${formatQuota(current + val)}`
      case 'subtract':
        return `${t('Current quota')}: ${formatQuota(current)}  -${formatQuota(val)} = ${formatQuota(current - val)}`
      case 'override': {
        const overrideQuota = parseQuotaFromDollars(amountValue)
        return `${t('Current quota')}: ${formatQuota(current)} → ${formatQuota(overrideQuota)}`
      }
      default:
        return ''
    }
  }

  const resetForm = () => {
    setAmount('')
    setMode('add')
    setReason(null)
    setReasonNote('')
    setPaidAmount('')
  }

  const handleConfirm = async () => {
    if (!amount && mode !== 'override') return
    if (quotaValue <= 0 && mode !== 'override') return

    const paid = reason === 'offline_payment'
    const received = paidAmount.trim() === '' ? amountValue : Number(paidAmount)
    if (mode === 'add') {
      if (!reason) {
        toast.error(t('Choose why this quota is being added.'))
        return
      }
      if (reason === 'other' && !reasonNote.trim()) {
        toast.error(t('Describe the reason in the note.'))
        return
      }
      if (paid && !(Number.isFinite(received) && received > 0)) {
        toast.error(t('Enter the amount received.'))
        return
      }
    }

    setLoading(true)
    try {
      const value =
        mode === 'override' ? parseQuotaFromDollars(amountValue) : quotaValue
      const result = await adjustUserQuota({
        id: props.userId,
        action: 'add_quota',
        mode,
        value: mode === 'override' ? value : Math.abs(value),
        ...(mode === 'add' && reason
          ? {
              reason,
              ...(reasonNote.trim() ? { reason_note: reasonNote.trim() } : {}),
              ...(paid ? { paid_amount: received } : {}),
            }
          : {}),
      })
      if (result.success) {
        toast.success(t('Quota adjusted successfully'))
        resetForm()
        props.onOpenChange(false)
        props.onSuccess()
      } else {
        handleServerError(result, t('Failed to adjust quota'))
      }
    } catch (e: unknown) {
      handleServerError(e, t('Failed to adjust quota'))
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    resetForm()
    props.onOpenChange(false)
  }

  const placeholder = tokensOnly
    ? t('Enter amount in tokens')
    : t('Enter amount in {{currency}}', { currency: currencyLabel })

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Adjust Quota')}
      description={t('Select an operation mode and enter the amount')}
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button variant='outline' onClick={handleCancel}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? t('Processing...') : t('Confirm')}
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        <div className='text-muted-foreground text-sm'>{getPreviewText()}</div>

        <div className='space-y-2'>
          <Label>{t('Mode')}</Label>
          <div className='flex gap-1'>
            {(['add', 'subtract', 'override'] as const).map((m) => (
              <Button
                key={m}
                type='button'
                variant='outline'
                size='sm'
                className={cn(
                  mode === m &&
                    'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                )}
                onClick={() => {
                  setMode(m)
                  setAmount('')
                }}
              >
                {m === 'add' && t('Add')}
                {!(m === 'add') && m === 'subtract' && t('Subtract')}
                {!(m === 'add') && !(m === 'subtract') && t('Override')}
              </Button>
            ))}
          </div>
        </div>

        <div className='space-y-2'>
          <Label>
            {t('Amount')} ({currencyLabel})
          </Label>
          <Input
            type='number'
            step={tokensOnly ? 1 : 0.000001}
            min={mode === 'override' ? undefined : 0}
            placeholder={placeholder}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm()
            }}
          />
        </div>

        {mode === 'add' && (
          <>
            <div className='space-y-2'>
              <Label>{t('Reason')}</Label>
              <div
                role='radiogroup'
                aria-label={t('Reason')}
                className='flex flex-wrap gap-1'
              >
                {ADD_REASONS.map((r) => (
                  <Button
                    key={r.id}
                    type='button'
                    role='radio'
                    aria-checked={reason === r.id}
                    variant='outline'
                    size='sm'
                    className={cn(
                      reason === r.id &&
                        'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                    )}
                    onClick={() => setReason(r.id)}
                  >
                    {t(r.labelKey)}
                  </Button>
                ))}
              </div>
              <p className='text-muted-foreground text-xs'>
                {reason === 'offline_payment'
                  ? t(
                      'Counts as a top-up: the user paid outside the checkout.'
                    )
                  : t('Every reason except "Paid offline" counts as a gift.')}
              </p>
            </div>

            {reason === 'offline_payment' && (
              <div className='space-y-2'>
                <Label htmlFor='quota-paid-amount'>
                  {t('Amount received (CNY)')}
                </Label>
                <Input
                  id='quota-paid-amount'
                  type='number'
                  min={0}
                  step={0.01}
                  placeholder={
                    amountValue > 0 ? String(amountValue) : undefined
                  }
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
                <p className='text-muted-foreground text-xs'>
                  {t('Leave empty if it equals the quota added.')}
                </p>
              </div>
            )}

            <div className='space-y-2'>
              <Label htmlFor='quota-reason-note'>
                {reason === 'other' ? t('Note') : t('Note (optional)')}
              </Label>
              <Input
                id='quota-reason-note'
                maxLength={200}
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
