import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { JsonEditor } from '@/components/json-editor'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormMessage,
} from '@/components/ui/form'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useSavePolicy } from './use-save-policy'

type Values = { ModelDailyTokenLimits: string }
export function ModelDailyTokensSection(props: { defaultValues: Values }) {
  const { t } = useTranslation()
  const save = useSavePolicy()
  const schema = z.object({
    ModelDailyTokenLimits: z.string().refine((value) => {
      try {
        const parsed: unknown = JSON.parse(value)
        return (
          parsed !== null &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          Object.keys(parsed).length <= 100 &&
          Object.entries(parsed).every(
            ([name, limit]) =>
              name.length > 0 &&
              name.length <= 255 &&
              name.trim() === name &&
              typeof limit === 'number' &&
              Number.isSafeInteger(limit) &&
              limit > 0
          )
        )
      } catch {
        return false
      }
    }, t('Enter model names and positive integer token limits')),
  })
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: props.defaultValues,
  })
  useResetForm(form, props.defaultValues)
  const submit = (values: Values) =>
    save.mutate(values, { onSuccess: () => form.reset(values) })
  return (
    <SettingsSection title={t('Model daily token limits')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(submit)}>
          <FormField
            control={form.control}
            name='ModelDailyTokenLimits'
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('Default daily tokens per account and model')}
                </FormLabel>
                <JsonEditor
                  value={field.value}
                  onChange={field.onChange}
                  disabled={save.isPending}
                  keyLabel={t('Model')}
                  valueLabel={t('Daily token limit')}
                  valueType='number'
                />
                <FormDescription>
                  {t(
                    'Resets at 00:00 Asia/Shanghai. Input and output tokens include cache tokens without price multipliers. Requests already started may finish past the limit. Administrators can override each model in the user editor.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <SettingsPageFormActions
            onSave={form.handleSubmit(submit)}
            onReset={() => form.reset(props.defaultValues)}
            isSaving={save.isPending}
            isSaveDisabled={!form.formState.isDirty}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
