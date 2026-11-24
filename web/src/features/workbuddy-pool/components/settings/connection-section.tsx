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

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { TitledCard } from '@/components/ui/titled-card'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getHubConfig, updateHubConfig } from '../../api'

/**
 * How this console reaches the hub: the address, the panel password it logs in
 * with, and whether the console is enabled at all. These are new-api's own
 * options, not the hub's, so saving them takes effect immediately.
 */
export function ConnectionSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [address, setAddress] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [enabled, setEnabled] = useState<boolean | null>(null)

  const config = useQuery({
    queryKey: ['workbuddy', 'settings', 'connection'],
    queryFn: async () => requireServerSuccess(await getHubConfig()),
  })
  const current = config.data?.data

  const save = useMutation({
    mutationFn: async () => {
      const input: {
        base_url?: string
        panel_password?: string
        enabled?: boolean
      } = {}
      if (address !== null) input.base_url = address.trim()
      if (password) input.panel_password = password
      if (enabled !== null) input.enabled = enabled
      const response = await updateHubConfig(input)
      if (!response.success) {
        throw new Error(response.message || t('Unable to save the connection.'))
      }
      return response
    },
    onSuccess: async () => {
      setPassword('')
      setAddress(null)
      setEnabled(null)
      toast.success(t('Connection saved. It applies immediately.'))
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['workbuddy', 'settings', 'connection'],
        }),
        queryClient.invalidateQueries({ queryKey: ['workbuddy-hub-status'] }),
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

  const environmentPassword = current.environment_password
  const passwordNote = environmentPassword
    ? t(
        'The panel password comes from the server environment, so it cannot be changed here.'
      )
    : t('Leave the password blank to keep the stored one.')

  return (
    <TitledCard
      icon={<Cable />}
      title={t('Hub connection')}
      description={t(
        'The address and panel password this console uses to reach the WorkBuddy gateway.'
      )}
      action={
        <Badge variant={current.password_set ? 'secondary' : 'destructive'}>
          {current.password_set ? t('Password stored') : t('Password missing')}
        </Badge>
      }
    >
      <div className='space-y-4'>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='hub-base-url'>{t('Hub address')}</Label>
            <Input
              id='hub-base-url'
              value={address ?? current.base_url}
              placeholder={current.default_base_url}
              onChange={(event) => setAddress(event.target.value)}
              spellCheck={false}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='hub-panel-password'>
              {t('Hub panel password')}
            </Label>
            <Input
              id='hub-panel-password'
              type='password'
              autoComplete='new-password'
              value={password}
              disabled={environmentPassword}
              placeholder={
                current.password_set
                  ? t('Stored, type to replace')
                  : t('Required')
              }
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className='text-muted-foreground text-xs'>{passwordNote}</p>
          </div>
        </div>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <Switch
              id='hub-enabled'
              checked={enabled ?? current.enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor='hub-enabled'>{t('Console enabled')}</Label>
          </div>
          <Button
            type='button'
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {t('Save connection')}
          </Button>
        </div>
        <p className='text-muted-foreground text-xs'>
          {t('Saving the connection applies without a restart.')}
        </p>
      </div>
    </TitledCard>
  )
}
