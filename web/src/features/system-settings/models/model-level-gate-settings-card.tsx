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

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const minLevelsExample = JSON.stringify({ 'gpt-6-astra-x0.001': 2 }, null, 2)

/** A JSON object of model names to a minimum level in 0..6. */
const minLevelsJson = z.string().refine((value) => {
  const trimmed = value.trim()
  if (!trimmed) return true
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false
    }
    return Object.entries(parsed).every(
      ([model, level]) =>
        model.trim() !== '' &&
        typeof level === 'number' &&
        Number.isInteger(level) &&
        level >= 0 &&
        level <= 6
    )
  } catch {
    return false
  }
}, 'Enter a JSON object that maps model names to a level between 0 and 6')

/**
 * Nested so that the dotted field names line up with react-hook-form paths
 * (see model-naming-settings-card).
 */
const schema = z.object({
  model_level_gate: z.object({
    min_levels: minLevelsJson,
  }),
})

type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>

type FlatModelLevelGate = {
  'model_level_gate.min_levels': string
}

function formatMinLevels(value: string): string {
  const trimmed = (value ?? '').toString().trim()
  if (!trimmed) return ''
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return value
  }
}

const buildFormDefaults = (defaults: FlatModelLevelGate): FormInput => ({
  model_level_gate: {
    min_levels: formatMinLevels(defaults['model_level_gate.min_levels']),
  },
})

const normalizeFormValues = (values: FormValues): FlatModelLevelGate => {
  const raw = values.model_level_gate.min_levels.trim()
  return {
    'model_level_gate.min_levels': raw ? JSON.stringify(JSON.parse(raw)) : '{}',
  }
}

interface Props {
  defaultValues: FlatModelLevelGate
}

/**
 * Which models need a usage level before they can be called. The level is
 * derived from paid consumption, so a user unlocks a model by spending their
 * own money and there is no group membership to keep in sync by hand.
 */
export function ModelLevelGateSettingsCard(props: Props) {
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

  const baselineRef = useRef<FlatModelLevelGate>(props.defaultValues)
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
      Object.keys(normalized) as Array<keyof FlatModelLevelGate>
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
    <SettingsSection title={t('Model usage level requirement')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />
          <FormField
            control={form.control}
            name='model_level_gate.min_levels'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Models that need a level')}</FormLabel>
                <FormControl>
                  <JsonCodeEditor
                    value={field.value}
                    onChange={(value) => field.onChange(value)}
                    name={field.name}
                    onBlur={field.onBlur}
                    textareaRef={field.ref}
                    placeholder={`${t('Example:')}\n${minLevelsExample}`}
                    heightClassName='h-56 min-h-56 max-h-56'
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'A model listed here can only be called by users whose usage level has reached the given level; everyone else is refused and does not see the model in the model list. The level is derived from paid consumption, excluding gifted balance and check-ins, so a user unlocks the model by spending their own money rather than by being moved into a group. Leave a level at 0, or omit the entry, to keep the model open to everyone. The level thresholds themselves are configured under the usage level settings.'
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
