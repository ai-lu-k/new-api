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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
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
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { handleServerError } from '@/lib/handle-server-error'

import { COMMAND_CODE_POOL_QUERY_ROOT, updatePoolKey } from '../../api'
import {
  commandCodeKeyEditSchema,
  type CommandCodeKeyEditValues,
  type CommandCodePoolKey,
} from '../../types'

/**
 * Edits the parts of a key the proxy lets us change. The credential itself is
 * not editable: replacing a key means deleting it and adding the new one.
 */
export function EditKeyDialog(props: {
  poolKey: CommandCodePoolKey | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const form = useForm<CommandCodeKeyEditValues>({
    resolver: zodResolver(commandCodeKeyEditSchema),
    defaultValues: { label: '', weight: 1, priority: 0, enabled: true },
  })
  const reset = form.reset

  useEffect(() => {
    if (!props.open || !props.poolKey) return
    reset({
      label: props.poolKey.label,
      weight: props.poolKey.weight,
      priority: props.poolKey.priority,
      enabled: props.poolKey.enabled,
    })
  }, [props.open, props.poolKey, reset])

  const save = useMutation({
    mutationFn: async (values: CommandCodeKeyEditValues) => {
      if (!props.poolKey) throw new Error(t('Select a key to edit.'))
      const response = await updatePoolKey(props.poolKey.id, {
        label: values.label.trim(),
        weight: values.weight,
        priority: values.priority,
        enabled: values.enabled,
      })
      if (!response.success) {
        throw new Error(response.message || t('Unable to save the key.'))
      }
      return response.data
    },
    onSuccess: async () => {
      toast.success(t('Key saved'))
      props.onOpenChange(false)
      await queryClient.invalidateQueries({
        queryKey: COMMAND_CODE_POOL_QUERY_ROOT,
      })
    },
    onError: (error: unknown) => {
      handleServerError(error, t('Unable to save the key.'))
    },
  })

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Edit key')}
      description={
        props.poolKey
          ? t('{{label}} · {{prefix}}', {
              label: props.poolKey.label || t('Unnamed'),
              prefix: props.poolKey.keyPrefix,
            })
          : undefined
      }
      contentClassName='sm:max-w-lg'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form='commandcode-edit-key'
            disabled={save.isPending}
          >
            {save.isPending && <Spinner data-icon='inline-start' />}
            {t('Save')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id='commandcode-edit-key'
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className='space-y-4'
        >
          <FormField
            control={form.control}
            name='label'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Label')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>
                  {t('The label must not be empty.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='weight'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Weight')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      max={1000}
                      step={1}
                      value={String(field.value)}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value) || 0)
                      }
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='priority'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Priority')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      step={1}
                      value={String(field.value)}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value) || 0)
                      }
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <FormItem className='flex items-center justify-between gap-4'>
                <div>
                  <FormLabel>{t('Enabled')}</FormLabel>
                  <FormDescription>
                    {t(
                      'A disabled key stays in the pool but takes no traffic.'
                    )}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
