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
import type { Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'

import { FormDirtyIndicator } from '../components/form-dirty-indicator'
import { FormNavigationGuard } from '../components/form-navigation-guard'
import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useSettingsForm } from '../hooks/use-settings-form'
import { useUpdateOption } from '../hooks/use-update-option'
import {
  parseUsageLevelThresholds,
  usageLevelSchema,
} from './usage-level-schema'

type Values = z.infer<typeof usageLevelSchema>

export function UsageLevelSettingsSection(props: { defaultValue: string }) {
  const { t, i18n } = useTranslation()
  const updateOption = useUpdateOption()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { form, handleSubmit, handleReset, isDirty, isSubmitting } =
    useSettingsForm<Values>({
      resolver: zodResolver(usageLevelSchema) as Resolver<Values>,
      defaultValues: {
        thresholds: parseUsageLevelThresholds(props.defaultValue),
      },
      onSubmit: async (values) => {
        await updateOption.mutateAsync({
          key: 'usage_level.thresholds',
          value: JSON.stringify(values.thresholds),
        })
      },
    })
  const disabled = updateOption.isPending || isSubmitting

  return (
    <SettingsSection title={t('Usage levels')}>
      <FormNavigationGuard when={isDirty} />
      <Form {...form}>
        <SettingsForm onSubmit={handleSubmit}>
          <SettingsPageFormActions
            onSave={handleSubmit}
            onReset={handleReset}
            isSaving={disabled}
            isSaveDisabled={!isDirty}
            isResetDisabled={!isDirty}
          />
          <FormDirtyIndicator isDirty={isDirty} />
          <p className='text-muted-foreground text-sm'>
            {t(
              'LV0 has no consumption. The first consumption unlocks LV1. Set the cumulative thresholds for LV2 to LV6.'
            )}
          </p>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Enter whole balance units. One unit is {{amount}}. Display exchange rates do not change levels.',
              { amount: formatBillingCurrencyFromUSD(1, { locale }) }
            )}
          </p>
          {Array.from({ length: 5 }, (_, index) => (
            <FormField
              key={index}
              control={form.control}
              name={`thresholds.${index}`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('Threshold for LV{{level}}', { level: index + 2 })}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={1}
                      max={1_000_000_000}
                      step={1}
                      disabled={disabled}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <p className='text-muted-foreground text-xs'>
            {t(
              'Gifted balance counts when consumed. Changing thresholds recalculates levels for all users without changing balances or pricing.'
            )}
          </p>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
