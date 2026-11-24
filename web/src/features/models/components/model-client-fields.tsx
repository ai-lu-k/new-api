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
import { useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { SideDrawerSection } from '@/components/drawer-layout'
import { JsonEditor } from '@/components/json-editor'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import { MODEL_REASONING_LEVELS, type ModelFormValues } from '../lib/model-form'
import { ModelCatalogChoices } from './model-catalog-choices'

export function ModelClientFields() {
  const { t } = useTranslation()
  const form = useFormContext<ModelFormValues>()
  return (
    <SideDrawerSection>
      <div>
        <h3 className='text-sm font-semibold'>{t('Quick import settings')}</h3>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Quick import uses these settings together with the model context and input modalities.'
          )}
        </p>
      </div>
      <FormField
        control={form.control}
        name='max_output_tokens'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Maximum output tokens')}</FormLabel>
            <FormControl>
              <Input inputMode='numeric' placeholder='128000' {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name='output_modalities'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Output modalities')}</FormLabel>
            <ModelCatalogChoices
              choices={[
                { value: 'text', label: t('Text output') },
                { value: 'image', label: t('Image output') },
                { value: 'audio', label: t('Audio output') },
                { value: 'video', label: t('Video output') },
              ]}
              chosen={field.value}
              onChange={field.onChange}
            />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name='reasoning_efforts'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Reasoning levels')}</FormLabel>
            <ModelCatalogChoices
              choices={MODEL_REASONING_LEVELS.map((value) => ({
                value,
                label: value,
              }))}
              chosen={Object.keys(field.value)}
              onChange={(levels) =>
                field.onChange(
                  Object.fromEntries(
                    levels.map((level) => [
                      level,
                      field.value[level] ?? (level === 'off' ? 'none' : level),
                    ])
                  )
                )
              }
            />
            <div className='grid gap-2 sm:grid-cols-2'>
              {MODEL_REASONING_LEVELS.filter((level) =>
                Object.hasOwn(field.value, level)
              ).map((level) => (
                <label key={level} className='space-y-1 text-xs'>
                  <span>{t('Upstream value for {{level}}', { level })}</span>
                  <Input
                    value={field.value[level]}
                    onChange={(event) =>
                      field.onChange({
                        ...field.value,
                        [level]: event.target.value,
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name='client_display_name'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Client display name')}</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name='client_compat'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Client compatibility')}</FormLabel>
            <JsonEditor
              value={field.value}
              onChange={field.onChange}
              valueType='any'
            />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name='quick_import_hidden'
        render={({ field }) => (
          <FormItem className='flex items-center justify-between'>
            <div>
              <FormLabel>{t('Hide from quick import')}</FormLabel>
              <FormDescription>
                {t('This does not disable API access.')}
              </FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
    </SideDrawerSection>
  )
}
