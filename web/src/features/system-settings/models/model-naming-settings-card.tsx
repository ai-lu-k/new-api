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
import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { JsonCodeEditor } from '@/components/json-code-editor'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const aliasesExample = JSON.stringify(
  { 'deepseek/deepseek-v4.1-flash': 'deepseek-v4.1-flash-x0.25' },
  null,
  2
)

/** A JSON object of non-empty names, each pointing at another name. */
const aliasesJson = z.string().refine((value) => {
  const trimmed = value.trim()
  if (!trimmed) return true
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false
    }
    return Object.entries(parsed).every(
      ([from, to]) =>
        from.trim() !== '' && typeof to === 'string' && to.trim() !== ''
    )
  } catch {
    return false
  }
}, 'Enter a JSON object that maps model names to model names')

/**
 * Nested so that the dotted field names line up with react-hook-form paths
 * (see grok-settings-card).
 */
const schema = z.object({
  model_naming: z.object({
    price_suffix_enabled: z.boolean(),
    aliases: aliasesJson,
  }),
})

type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>

type FlatModelNaming = {
  'model_naming.price_suffix_enabled': boolean
  'model_naming.aliases': string
}

function formatAliases(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return value
  }
}

const buildFormDefaults = (defaults: FlatModelNaming): FormInput => ({
  model_naming: {
    price_suffix_enabled: defaults['model_naming.price_suffix_enabled'],
    aliases: formatAliases(defaults['model_naming.aliases']),
  },
})

const normalizeFormValues = (values: FormValues): FlatModelNaming => {
  const aliases = values.model_naming.aliases.trim()
  return {
    'model_naming.price_suffix_enabled':
      values.model_naming.price_suffix_enabled,
    'model_naming.aliases': aliases
      ? JSON.stringify(JSON.parse(aliases))
      : '{}',
  }
}

interface Props {
  defaultValues: FlatModelNaming
}

/**
 * Price tiers in model names and the aliases that keep old names working.
 * A model named "deepseek-v4.1-flash-x0.25" is billed at a quarter of the
 * price of deepseek-v4.1-flash.
 */
export function ModelNamingSettingsCard(props: Props) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const formDefaults = useMemo(
    () => buildFormDefaults(props.defaultValues),
    [props.defaultValues]
  )
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: formDefaults,
  })

  const baselineRef = useRef<FlatModelNaming>(props.defaultValues)
  const baselineSerializedRef = useRef(JSON.stringify(props.defaultValues))

  useEffect(() => {
    const serialized = JSON.stringify(props.defaultValues)
    if (serialized === baselineSerializedRef.current) return
    baselineRef.current = props.defaultValues
    baselineSerializedRef.current = serialized
    form.reset(buildFormDefaults(props.defaultValues))
  }, [props.defaultValues, form])

  const onSubmit = async (values: FormValues) => {
    const normalized = normalizeFormValues(values)
    const changedKeys = (
      Object.keys(normalized) as Array<keyof FlatModelNaming>
    ).filter((key) => normalized[key] !== baselineRef.current[key])

    if (changedKeys.length === 0) {
      toast.info(t('No changes to save'))
      return
    }
    for (const key of changedKeys) {
      await updateOption.mutateAsync({ key, value: normalized[key] })
    }
    baselineRef.current = normalized
    baselineSerializedRef.current = JSON.stringify(normalized)
    form.reset(buildFormDefaults(normalized))
  }

  return (
    <SettingsSection title={t('Model names and price tiers')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />
          <FormField
            control={form.control}
            name='model_naming.price_suffix_enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Price tier in the model name')}</FormLabel>
                  <FormDescription>
                    {t(
                      'A model name ending in -x and a number is billed at that multiple of the price of the name without it: deepseek-v4.1-flash-x0.25 costs a quarter of deepseek-v4.1-flash. Add such names to a channel and map them to the upstream model.'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <FormField
            control={form.control}
            name='model_naming.aliases'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Default name mapping')}</FormLabel>
                <FormControl>
                  <JsonCodeEditor
                    value={field.value}
                    onChange={(value) => field.onChange(value)}
                    name={field.name}
                    onBlur={field.onBlur}
                    textareaRef={field.ref}
                    placeholder={`${t('Example:')}\n${aliasesExample}`}
                    heightClassName='h-56 min-h-56 max-h-56'
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Names callers already use, each pointing at the name that serves them now. A request for a name on the left is routed, billed and logged as the name on the right, so old configurations keep working. These names are not listed anywhere.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
