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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { INTERFACE_LANGUAGE_OPTIONS, toIntlLocale } from '@/i18n/languages'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

/** Stands for "no default language" in the select, which needs a value. */
const FOLLOW_BROWSER = 'browser'

/**
 * Nested so that the dotted field names line up with react-hook-form paths
 * (see grok-settings-card).
 */
const schema = z.object({
  site_page: z.object({
    default_language: z.string(),
    home_title: z.string(),
    home_description: z.string(),
  }),
})

type FormValues = z.infer<typeof schema>

type FlatSitePage = {
  'site_page.default_language': string
  'site_page.home_title': string
  'site_page.home_description': string
}

const buildFormDefaults = (defaults: FlatSitePage): FormValues => ({
  site_page: {
    default_language: defaults['site_page.default_language'] || FOLLOW_BROWSER,
    home_title: defaults['site_page.home_title'],
    home_description: defaults['site_page.home_description'],
  },
})

const normalizeFormValues = (values: FormValues): FlatSitePage => ({
  'site_page.default_language':
    values.site_page.default_language === FOLLOW_BROWSER
      ? ''
      : values.site_page.default_language,
  'site_page.home_title': values.site_page.home_title.trim(),
  'site_page.home_description': values.site_page.home_description.trim(),
})

interface Props {
  defaultValues: FlatSitePage
}

/**
 * What search engines read of the site: the language they see it in and the
 * home page's title and summary.
 */
export function SitePageSettingsCard(props: Props) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const formDefaults = useMemo(
    () => buildFormDefaults(props.defaultValues),
    [props.defaultValues]
  )
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: formDefaults,
  })

  const baselineRef = useRef<FlatSitePage>(props.defaultValues)
  const baselineSerializedRef = useRef(JSON.stringify(props.defaultValues))

  useEffect(() => {
    const serialized = JSON.stringify(props.defaultValues)
    if (serialized === baselineSerializedRef.current) return
    baselineRef.current = props.defaultValues
    baselineSerializedRef.current = serialized
    form.reset(buildFormDefaults(props.defaultValues))
  }, [props.defaultValues, form])

  const languages = useMemo(
    () => [
      { value: FOLLOW_BROWSER, label: t('Follow the browser') },
      ...INTERFACE_LANGUAGE_OPTIONS.map((language) => ({
        value: toIntlLocale(language.code) ?? language.code,
        label: language.label,
      })),
    ],
    [t]
  )

  const onSubmit = async (values: FormValues) => {
    const normalized = normalizeFormValues(values)
    const changedKeys = (
      Object.keys(normalized) as Array<keyof FlatSitePage>
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
    <SettingsSection title={t('Search engines')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />
          <FormField
            control={form.control}
            name='site_page.default_language'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Default language')}</FormLabel>
                <FormControl>
                  <Select
                    items={languages}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {languages.map((language) => (
                          <SelectItem
                            key={language.value}
                            value={language.value}
                          >
                            {language.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormDescription>
                  {t(
                    'The language a visitor sees before choosing one. Search engines crawl with an English browser, so a site written in another language should set it here; otherwise they index the English interface.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='site_page.home_title'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Home page title')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>
                  {t(
                    'Shown in the browser tab and as the headline of the home page in search results. Leave empty to use the system name followed by the heading of the home page.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='site_page.home_description'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Home page description')}</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} />
                </FormControl>
                <FormDescription>
                  {t(
                    'The summary under the headline in search results, up to about 160 characters. Leave empty to use the first paragraphs of the home page.'
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
