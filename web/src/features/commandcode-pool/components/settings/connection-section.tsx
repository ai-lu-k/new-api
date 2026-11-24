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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Cable } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { TitledCard } from '@/components/ui/titled-card'
import { requireServerSuccess } from '@/lib/server-error-message'

import { commandCodePoolKeys, getPoolConfig, updatePoolConfig } from '../../api'

/**
 * How this console reaches the proxy: the address and whether the console may
 * use it at all. These are new-api's own options, not the proxy's, so saving
 * them takes effect immediately.
 */
export function ConnectionSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [address, setAddress] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)

  const config = useQuery({
    queryKey: commandCodePoolKeys.config,
    queryFn: async () => requireServerSuccess(await getPoolConfig()),
  })
  const current = config.data?.data

  const save = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error(t('The proxy configuration is not loaded.'))
      const response = await updatePoolConfig({
        base_url: address ?? current.base_url,
        enabled: enabled ?? current.enabled,
      })
      if (!response.success) {
        throw new Error(response.message || t('Unable to save the connection.'))
      }
      return response.data
    },
    onSuccess: async () => {
      setAddress(null)
      setEnabled(null)
      toast.success(t('Connection saved. It applies immediately.'))
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: commandCodePoolKeys.config,
        }),
        queryClient.invalidateQueries({ queryKey: commandCodePoolKeys.status }),
        queryClient.invalidateQueries({ queryKey: commandCodePoolKeys.pool }),
      ])
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  if (config.isPending) {
    return <Skeleton className='h-56 w-full' />
  }
  if (!current) {
    return null
  }

  return (
    <TitledCard
      icon={<Cable />}
      title={t('Proxy connection')}
      description={t(
        'The address this console uses to reach the CommandCode proxy. Saving applies without a restart.'
      )}
    >
      <div className='space-y-4'>
        <div className='space-y-2'>
          <Label htmlFor='commandcode-base-url'>{t('Proxy address')}</Label>
          <Input
            id='commandcode-base-url'
            value={address ?? current.base_url}
            placeholder={current.default_base_url}
            onChange={(event) => setAddress(event.target.value)}
            spellCheck={false}
          />
          <p className='text-muted-foreground text-xs'>
            {t('The address the proxy answers on inside the private network.')}
          </p>
        </div>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <Switch
              id='commandcode-enabled'
              checked={enabled ?? current.enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor='commandcode-enabled'>{t('Console enabled')}</Label>
          </div>
          <Button
            type='button'
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {t('Save connection')}
          </Button>
        </div>
      </div>
    </TitledCard>
  )
}
