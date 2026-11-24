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
import { ListChecks } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TitledCard } from '@/components/ui/titled-card'

import { hubPost } from '../../api'
import { modelIds, type HubAgentModel } from './types'

/**
 * Which models the one-click setup writes into a client's config. This list is
 * global and lives in the hub, so it can be edited even from a console that is
 * not on the gateway host — nothing here touches a file.
 */
export function ModelSelectionSection(props: {
  models: HubAgentModel[]
  selected: string[]
  configured: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const ids = modelIds(props.models)
  const [draft, setDraft] = useState<string[] | null>(null)
  // A catalogue the hub never saved means "everything is selected".
  const current = draft ?? (props.configured ? props.selected : ids)

  const save = useMutation({
    mutationFn: async (models: string[]) => {
      const response = await hubPost<{ selected_models?: string[] }>(
        'agents.model-selection',
        { models }
      )
      if (!response.success) {
        throw new Error(
          response.message || t('Unable to save the model selection.')
        )
      }
      return models
    },
    onSuccess: async (models) => {
      setDraft(null)
      toast.success(
        t('{{count}} models selected for the one-click setup.', {
          count: models.length,
        })
      )
      await queryClient.invalidateQueries({
        queryKey: ['workbuddy', 'agents', 'model-selection'],
      })
    },
    onError: (error: Error) => {
      setDraft(null)
      toast.error(error.message)
    },
  })

  function toggle(id: string, checked: boolean): void {
    const next = checked
      ? [...current.filter((value) => value !== id), id]
      : current.filter((value) => value !== id)
    setDraft(next)
    save.mutate(next)
  }

  function pickAll(next: string[]): void {
    setDraft(next)
    save.mutate(next)
  }

  return (
    <TitledCard
      icon={<ListChecks />}
      title={t('Model selection')}
      description={t(
        'The models the one-click setup writes into a client config. This does not change gateway routing; unchecked models stay callable through the API.'
      )}
      action={
        <Badge variant='outline'>
          {t('{{picked}} of {{total}} selected', {
            picked: current.length,
            total: ids.length,
          })}
        </Badge>
      }
    >
      <div className='space-y-3'>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={save.isPending}
            onClick={() => pickAll(ids)}
          >
            {t('Select all')}
          </Button>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={save.isPending}
            onClick={() => pickAll([])}
          >
            {t('Select none')}
          </Button>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={save.isPending}
            onClick={() => pickAll(ids.filter((id) => !current.includes(id)))}
          >
            {t('Invert')}
          </Button>
        </div>
        {ids.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {t(
              'The model catalogue is only readable on the gateway host. The saved selection is kept either way.'
            )}
          </p>
        ) : (
          <div className='grid gap-1 sm:grid-cols-2 lg:grid-cols-3'>
            {ids.map((id) => (
              <label key={id} className='flex items-center gap-2 text-sm'>
                <Checkbox
                  checked={current.includes(id)}
                  onCheckedChange={(checked) => toggle(id, checked === true)}
                />
                <span className='truncate font-mono text-xs'>{id}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </TitledCard>
  )
}
