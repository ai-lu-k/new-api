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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TitledCard } from '@/components/ui/titled-card'

import { hubPost } from '../../api'

type PanelPasswordReply = {
  token?: string
  using_default_password?: boolean
}

/**
 * The hub's own dashboard password. Changing it here changes the password every
 * panel client uses, so the two fields are the hub's own `current` / `new`
 * pair, exactly as its own dashboard sends them.
 */
export function PanelPasswordSection(props: { isDefault: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  const change = useMutation({
    mutationFn: async () => {
      const response = await hubPost<PanelPasswordReply>('panel.password', {
        current,
        new: next,
      })
      if (!response.success) {
        throw new Error(
          response.message || t('Unable to change the panel password.')
        )
      }
      return response.data
    },
    onSuccess: async () => {
      setCurrent('')
      setNext('')
      toast.success(t('Panel password updated.'))
      await queryClient.invalidateQueries({
        queryKey: ['workbuddy', 'settings'],
      })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const canSubmit = current.length > 0 && next.length >= 4 && !change.isPending

  return (
    <TitledCard
      icon={<KeyRound />}
      title={t('Hub panel password')}
      description={t(
        'The password that opens the WorkBuddy dashboard itself. Every panel client uses it.'
      )}
      action={
        <Badge variant={props.isDefault ? 'warning' : 'secondary'}>
          {props.isDefault ? t('Default password') : t('Custom password')}
        </Badge>
      }
    >
      <div className='space-y-4'>
        {props.isDefault && (
          <p className='text-warning text-xs'>
            {t(
              'The hub still uses its default password. Change it before exposing the panel.'
            )}
          </p>
        )}
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='panel-password-current'>
              {t('Current password')}
            </Label>
            <Input
              id='panel-password-current'
              type='password'
              autoComplete='current-password'
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='panel-password-new'>{t('New password')}</Label>
            <Input
              id='panel-password-new'
              type='password'
              autoComplete='new-password'
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              {t('At least four characters.')}
            </p>
          </div>
        </div>
        <div className='flex justify-end'>
          <Button
            type='button'
            onClick={() => change.mutate()}
            disabled={!canSubmit}
          >
            {t('Change panel password')}
          </Button>
        </div>
      </div>
    </TitledCard>
  )
}
