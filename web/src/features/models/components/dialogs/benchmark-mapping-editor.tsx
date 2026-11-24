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
import { useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { ComboboxInput } from '@/components/ui/combobox-input'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import type { BenchmarkModel } from '@/features/pricing/lib/benchmark'

import {
  benchmarkMappingSchema,
  benchmarkTiers,
  type BenchmarkMappingValues,
} from '../../lib/benchmark-mapping'

export function BenchmarkMappingEditor(props: {
  model?: BenchmarkModel
  modelName?: string
  sources: string[]
  pending: boolean
  onSave: (model: BenchmarkModel) => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const form = useForm<BenchmarkMappingValues>({
    resolver: zodResolver(benchmarkMappingSchema),
    defaultValues: {
      id: props.model?.id ?? '',
      aliases: props.model?.aliases.join('\n') ?? props.modelName ?? '',
      highest_tier: props.model?.highest_tier ?? 'default',
      tiers: props.model?.tiers.map((tier) => ({
        id: tier.id as BenchmarkMappingValues['tiers'][number]['id'],
        source_name: tier.source_name,
      })) ?? [{ id: 'default', source_name: '' }],
    },
  })
  const tiers = useFieldArray({
    control: form.control,
    name: 'tiers',
    keyName: 'fieldKey',
  })
  const values = form.watch('tiers')
  const available = benchmarkTiers.filter(
    (tier) => !values.some((value) => value.id === tier)
  )

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((value) =>
          props.onSave({
            id: value.id,
            aliases: value.aliases
              .split('\n')
              .map((alias) => alias.trim())
              .filter(Boolean),
            highest_tier: value.highest_tier,
            tiers: value.tiers.map((tier) => ({ ...tier, scores: {} })),
          })
        )}
      >
        <fieldset disabled={props.pending} className='min-w-0 space-y-5'>
          <FieldGroup>
            <FormField
              control={form.control}
              name='id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Benchmark model')}</FormLabel>
                  <FormControl>
                    <Input {...field} readOnly={Boolean(props.model)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='aliases'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Model aliases')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={4} />
                  </FormControl>
                  <FieldDescription>
                    {t(
                      'One exact model name per line. Discounts and other suffixes are matched only when listed.'
                    )}
                  </FieldDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='highest_tier'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Highest evaluation tier')}</FormLabel>
                  <FormControl>
                    <NativeSelect {...field} className='w-full'>
                      {values.map((tier) => (
                        <NativeSelectOption key={tier.id} value={tier.id}>
                          {tier.id}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FieldGroup>
          {tiers.fields.map((tier, index) => (
            <FieldGroup
              key={tier.fieldKey}
              className='gap-2 rounded-lg border p-3'
            >
              <FormField
                control={form.control}
                name={`tiers.${index}.source_name`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Benchmark model for {{tier}}', {
                        tier: tier.id,
                      })}
                    </FormLabel>
                    <FormControl>
                      <ComboboxInput
                        value={field.value}
                        onValueChange={field.onChange}
                        options={props.sources.map((source) => ({
                          value: source,
                          label: source,
                        }))}
                        allowCustomValue
                        placeholder={t('Select or enter a benchmark model')}
                        disabled={props.pending}
                      />
                    </FormControl>
                    <FormMessage />
                    {field.value && !props.sources.includes(field.value) && (
                      <FieldDescription>
                        {t('No published score for this source yet.')}
                      </FieldDescription>
                    )}
                  </FormItem>
                )}
              />
              {tiers.fields.length > 1 && (
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='justify-self-start'
                  aria-label={t('Remove {{tier}} tier', { tier: tier.id })}
                  onClick={() => {
                    if (form.getValues('highest_tier') === tier.id) {
                      const next = values.find((value) => value.id !== tier.id)
                      if (next) form.setValue('highest_tier', next.id)
                    }
                    tiers.remove(index)
                  }}
                >
                  {t('Remove')}
                </Button>
              )}
            </FieldGroup>
          ))}
          {available.length > 0 && (
            <Field>
              <FieldLabel htmlFor='benchmark-add-tier'>
                {t('Add evaluation tier')}
              </FieldLabel>
              <NativeSelect
                id='benchmark-add-tier'
                value=''
                onChange={(event) => {
                  const tier = available.find(
                    (value) => value === event.target.value
                  )
                  if (tier) tiers.append({ id: tier, source_name: '' })
                }}
              >
                <NativeSelectOption value=''>{t('Select')}</NativeSelectOption>
                {available.map((tier) => (
                  <NativeSelectOption key={tier} value={tier}>
                    {tier}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
          <div className='flex flex-wrap justify-between gap-2'>
            {props.onDelete && (
              <Button
                type='button'
                variant='destructive'
                onClick={() => setConfirmDelete(true)}
              >
                {t('Delete mapping')}
              </Button>
            )}
            <Button type='submit' disabled={props.pending}>
              {t('Save changes')}
            </Button>
          </div>
        </fieldset>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('Delete mapping')}
        desc={t(
          'Models using this mapping will no longer show benchmark scores.'
        )}
        destructive
        isLoading={props.pending}
        handleConfirm={() => props.onDelete?.()}
      />
    </Form>
  )
}
