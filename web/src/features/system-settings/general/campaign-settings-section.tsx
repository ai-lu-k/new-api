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
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

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
import { Switch } from '@/components/ui/switch'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const schema = z.object({
  enabled: z.boolean(),
  startDate: z.string().regex(DATE_PATTERN).or(z.literal('')),
  endDate: z.string().regex(DATE_PATTERN).or(z.literal('')),
  claimDeadline: z.string().regex(DATE_PATTERN).or(z.literal('')),
  rewardSlots: z.coerce.number().int().min(1).max(10000),
})

type Values = z.infer<typeof schema>

type CampaignDefaults = {
  enabled: boolean
  startDate: string
  endDate: string
  claimDeadline: string
  rewardSlots: number
}

export function CampaignSettingsSection(props: {
  defaultValues: CampaignDefaults
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const defaults = props.defaultValues

  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: {
      enabled: defaults.enabled,
      startDate: defaults.startDate,
      endDate: defaults.endDate,
      claimDeadline: defaults.claimDeadline,
      rewardSlots: defaults.rewardSlots,
    },
  })

  const { isDirty, isSubmitting } = form.formState
  const enabled = form.watch('enabled')
  // While the campaign is off its window is archived: only the switch itself may
  // change, and that change still has to be saved so the campaign can come back.
  const archived = !enabled
  const isSaveDisabled = !isDirty || (archived && enabled === defaults.enabled)

  async function onSubmit(values: Values) {
    const updates: Array<{ key: string; value: string }> = []
    if (values.enabled !== defaults.enabled) {
      updates.push({
        key: 'ctf_setting.enabled',
        value: String(values.enabled),
      })
    }
    if (values.startDate !== defaults.startDate) {
      updates.push({ key: 'ctf_setting.start_date', value: values.startDate })
    }
    if (values.endDate !== defaults.endDate) {
      updates.push({ key: 'ctf_setting.end_date', value: values.endDate })
    }
    if (values.claimDeadline !== defaults.claimDeadline) {
      updates.push({
        key: 'ctf_setting.claim_deadline',
        value: values.claimDeadline,
      })
    }
    if (values.rewardSlots !== defaults.rewardSlots) {
      updates.push({
        key: 'ctf_setting.reward_slots',
        value: String(values.rewardSlots),
      })
    }
    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }
    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
    form.reset(values)
  }

  return (
    <SettingsSection title={t('Campaign Event')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending || isSubmitting}
            isSaveDisabled={isSaveDisabled}
            saveLabel={t('Save campaign settings')}
          />
          {archived ? (
            <div className='rounded-lg border border-dashed px-4 py-3'>
              <p className='text-sm font-medium'>{t('Archived')}</p>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t(
                  'This campaign is switched off, so its window is archived and read-only. Switch it on to edit the dates again.'
                )}
              </p>
            </div>
          ) : null}
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable the campaign event')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Shows the campaign page and its navigation entry. The dates below still decide when answers are accepted.'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={updateOption.isPending || isSubmitting}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          {enabled && (
            <div className='grid gap-6 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='startDate'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Start date')}</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormDescription>
                      {t('Opens at 00:00 Asia/Shanghai on this day.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='endDate'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('End date')}</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormDescription>
                      {t('Accepts answers until 23:59:59 Asia/Shanghai.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='claimDeadline'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Guest claim deadline')}</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Last day visitors can sign in and settle their progress. Empty means the end date.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='rewardSlots'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Reward slots')}</FormLabel>
                    <FormControl>
                      <Input type='number' min={1} max={10000} {...field} />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'How many accounts can hold a reward slot. Changing it mid-event never re-prices past awards.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
