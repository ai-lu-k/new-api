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

import { COMMAND_CODE_POOL_QUERY_ROOT, createPoolKey } from '../../api'
import {
  commandCodeKeyFormSchema,
  type CommandCodeKeyFormValues,
} from '../../types'

const EMPTY_KEY: CommandCodeKeyFormValues = {
  key: '',
  label: '',
  weight: 1,
  priority: 0,
  enabled: true,
}

/**
 * Adds one upstream key. The proxy validates the credential shape and refuses
 * duplicates; its wording is what the operator sees, so nothing is rewritten.
 */
export function AddKeyDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const form = useForm<CommandCodeKeyFormValues>({
    resolver: zodResolver(commandCodeKeyFormSchema),
    defaultValues: EMPTY_KEY,
  })

  const create = useMutation({
    mutationFn: async (values: CommandCodeKeyFormValues) => {
      const response = await createPoolKey({
        key: values.key.trim(),
        label: values.label.trim(),
        weight: values.weight,
        priority: values.priority,
        enabled: values.enabled,
      })
      if (!response.success) {
        throw new Error(response.message || t('Unable to add the key.'))
      }
      return response.data
    },
    onSuccess: async () => {
      toast.success(t('Key added'))
      form.reset(EMPTY_KEY)
      props.onOpenChange(false)
      await queryClient.invalidateQueries({
        queryKey: COMMAND_CODE_POOL_QUERY_ROOT,
      })
    },
    onError: (error: unknown) => {
      handleServerError(error, t('Unable to add the key.'))
    },
  })

  function handleOpenChange(open: boolean) {
    if (!open) form.reset(EMPTY_KEY)
    props.onOpenChange(open)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={handleOpenChange}
      title={t('Add a key')}
      description={t(
        'The credential is stored by the proxy and never read back here; only the prefix is shown afterwards.'
      )}
      contentClassName='sm:max-w-lg'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => handleOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form='commandcode-add-key'
            disabled={create.isPending}
          >
            {create.isPending && <Spinner data-icon='inline-start' />}
            {t('Add key')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id='commandcode-add-key'
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
          className='space-y-4'
        >
          <FormField
            control={form.control}
            name='key'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Upstream key')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete='off'
                    spellCheck={false}
                    placeholder='user_...'
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'A CommandCode key starting with user_, exactly as the provider issued it.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='label'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Label')}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder={t('Optional')} />
                </FormControl>
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
                  <FormDescription>
                    {t(
                      'Higher weights take more traffic in weighted strategies.'
                    )}
                  </FormDescription>
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
                  <FormDescription>
                    {t('Higher priority keys are tried first.')}
                  </FormDescription>
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
