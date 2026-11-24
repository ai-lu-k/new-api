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
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import z from 'zod'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import type { PlanTrendUser } from '@/features/token-plan-statistics'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import {
  createVoucherGrant,
  previewVoucherGrant,
  type VoucherGrant,
  type VoucherGrantPreview,
} from './api'

const schema = z
  .object({
    audience: z.enum(['all', 'users']),
    users: z.string(),
    faceValueYuan: z
      .number({ error: 'Face value must be between 1 and 1000 yuan' })
      .int({ message: 'Face value must be between 1 and 1000 yuan' })
      .min(1, { message: 'Face value must be between 1 and 1000 yuan' })
      .max(1000, { message: 'Face value must be between 1 and 1000 yuan' }),
    validityDays: z
      .number({ error: 'Validity must be between 1 and 365 days' })
      .int({ message: 'Validity must be between 1 and 365 days' })
      .min(1, { message: 'Validity must be between 1 and 365 days' })
      .max(365, { message: 'Validity must be between 1 and 365 days' }),
    reason: z
      .string()
      .trim()
      .min(1, { message: 'Required' })
      .max(512, { message: 'Reason must not exceed 512 characters' }),
  })
  .refine(
    (value) =>
      value.audience === 'all' ||
      /^\s*\d+(?:[ ,\n]+\d+)*\s*$/.test(value.users),
    { path: ['users'], message: 'Invalid user IDs' }
  )
type Fields = z.infer<typeof schema>

export function CouponGrantForm(props: {
  onCreated: () => void
  recipient?: PlanTrendUser | null
  onClearRecipient?: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: {
      audience: 'all',
      users: '',
      faceValueYuan: 5,
      validityDays: 30,
      reason: '',
    },
  })
  // Arriving from the user list targets that account explicitly instead of
  // falling back to every enabled user. The confirmation dialog still shows the
  // resolved recipient count before anything is issued.
  const recipient = props.recipient ?? null
  const recipientId = recipient?.id ?? null
  useEffect(() => {
    if (recipientId === null) return
    form.setValue('audience', 'users')
    form.setValue('users', String(recipientId))
  }, [form, recipientId])
  const clearRecipient = () => {
    form.setValue('audience', 'all')
    form.setValue('users', '')
    props.onClearRecipient?.()
  }
  const [preview, setPreview] = useState<{
    grant: VoucherGrant
    result: VoucherGrantPreview
  } | null>(null)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const issuance = useRef<VoucherGrant | null>(null)
  const submit = async (values: Fields) => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    try {
      const grant: VoucherGrant = {
        request_id: crypto.randomUUID(),
        audience: values.audience,
        user_ids:
          values.audience === 'users'
            ? values.users
                .trim()
                .split(/[ ,\n]+/)
                .map(Number)
            : [],
        face_value_yuan: values.faceValueYuan,
        validity_days: values.validityDays,
        reason: values.reason,
      }
      const result = await previewVoucherGrant(grant)
      grant.audience_digest = result.audience_digest
      issuance.current = null
      setPreview({ grant, result })
    } catch (error) {
      handleServerError(error)
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  const issue = async () => {
    if (!preview || busy.current) return
    busy.current = true
    setPending(true)
    try {
      // Resending the same request ID after an ambiguous failure returns the
      // batch that already exists instead of issuing the vouchers twice.
      issuance.current ??= preview.grant
      const batch = await createVoucherGrant(issuance.current)
      props.onCreated()
      setPreview(null)
      issuance.current = null
      toast.success(
        t('Issued {{count}} vouchers', { count: batch.recipient_count })
      )
    } catch (error) {
      props.onCreated()
      handleServerError(error)
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <div className='rounded-xl border p-5'>
      <h2 className='mb-4 font-semibold'>{t('Issue vouchers')}</h2>
      {recipient && (
        <div
          role='status'
          className='bg-muted/40 mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm'
        >
          <span>
            {t('Target user')}:{' '}
            <strong>
              #{formatNumber(recipient.id, locale)} {recipient.name}
            </strong>
          </span>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={clearRecipient}
          >
            {t('Clear')}
          </Button>
        </div>
      )}
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(submit)}
          className='grid gap-4 md:grid-cols-2'
        >
          <FormField
            control={form.control}
            name='audience'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Recipients')}</FormLabel>
                <FormControl>
                  <NativeSelect {...field} disabled={pending}>
                    <NativeSelectOption value='all'>
                      {t('All enabled ordinary users')}
                    </NativeSelectOption>
                    <NativeSelectOption value='users'>
                      {t('Specific users')}
                    </NativeSelectOption>
                  </NativeSelect>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='users'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('User IDs')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    disabled={pending || form.watch('audience') === 'all'}
                    placeholder={t('Comma-separated user IDs')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='faceValueYuan'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Face value (yuan)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={1}
                    max={1000}
                    step={1}
                    {...field}
                    onChange={(event) =>
                      field.onChange(Number(event.target.value))
                    }
                    disabled={pending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='validityDays'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Validity (days)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={1}
                    max={365}
                    step={1}
                    {...field}
                    onChange={(event) =>
                      field.onChange(Number(event.target.value))
                    }
                    disabled={pending}
                  />
                </FormControl>
                <FormMessage />
                <FormDescription>
                  {t('Validity starts when issued. Unopened vouchers expire.')}
                </FormDescription>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='reason'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Reason')}</FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'A snapshot of current users. New registrations are not included.'
            )}
          </p>
          <Button type='submit' disabled={pending} className='justify-self-end'>
            {t('Preview issuance')}
          </Button>
        </form>
      </Form>
      <ConfirmDialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setPreview(null)
            issuance.current = null
          }
        }}
        title={t('Issue vouchers')}
        desc={
          <div className='space-y-2'>
            <p>
              {t('{{recipients}} users · {{vouchers}} vouchers', {
                recipients: preview?.result.recipients,
                vouchers: preview?.result.vouchers,
              })}
            </p>
            <p>
              {t('Face value')}:{' '}
              {formatQuotaWithCurrency(preview?.result.face_value, {
                locale,
              })}
            </p>
            <p>
              {t('Total face value')}:{' '}
              {formatQuotaWithCurrency(preview?.result.total_face_value, {
                locale,
              })}
            </p>
            <p>
              {t('Validity (days)')}:{' '}
              {formatNumber(preview?.grant.validity_days, locale)}
            </p>
          </div>
        }
        isLoading={pending}
        handleConfirm={() => void issue()}
      />
    </div>
  )
}
