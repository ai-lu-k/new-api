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
import { Save } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubGet, hubPost } from '../api'
import { ApiKeysSection } from './settings/api-keys-section'
import { BehaviourSection } from './settings/behaviour-section'
import { ConnectionSection } from './settings/connection-section'
import { LimitsSection } from './settings/limits-section'
import { PanelPasswordSection } from './settings/panel-password-section'
import { PricingSection } from './settings/pricing-section'
import { ProxySlotsSection } from './settings/proxy-slots-section'
import {
  EMPTY_DRAFT,
  type HubLimits,
  type HubSettings,
  type HubSettingsDraft,
  type HubSettingsScalarKey,
  type HubSettingsScalarValue,
} from './settings/types'
import { UpdatesSection } from './settings/updates-section'

/**
 * The gateway's settings, grouped the way its own payload is: connection,
 * access, guard rails, pricing, behaviour, egress slots and updates. Scalar
 * edits collect in one draft so a single save sends one patch — the hub's own
 * dashboard sends one patch per control, so this is the same field set.
 */
export function SettingsTab() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<HubSettingsDraft>(EMPTY_DRAFT)
  const [confirmSave, setConfirmSave] = useState(false)

  const settings = useQuery({
    queryKey: ['workbuddy', 'settings'],
    queryFn: async () =>
      requireServerSuccess(await hubGet<HubSettings>('settings')),
  })
  const data = settings.data?.data

  function setValue(
    key: HubSettingsScalarKey,
    value: HubSettingsScalarValue
  ): void {
    setDraft({ ...draft, values: { ...draft.values, [key]: value } })
  }

  function setLimits(limits: HubLimits): void {
    setDraft({ ...draft, limits })
  }

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { ...draft.values }
      if (draft.limits) body.limits = draft.limits
      const response = await hubPost<{ ok?: boolean }>('settings.save', body)
      if (!response.success) {
        throw new Error(response.message || t('Unable to save the settings.'))
      }
      return Object.keys(body).length
    },
    onSuccess: async (fields) => {
      setConfirmSave(false)
      setDraft(EMPTY_DRAFT)
      toast.success(t('Saved {{count}} settings.', { count: fields }))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workbuddy', 'settings'] }),
        queryClient.invalidateQueries({ queryKey: ['workbuddy', 'gateway'] }),
      ])
    },
    onError: (error: Error) => {
      setConfirmSave(false)
      toast.error(error.message)
    },
  })

  if (settings.isPending) {
    return <LoadingState />
  }
  if (!data) {
    return (
      <ErrorState
        title={t('Unable to read the gateway settings')}
        description={settings.error?.message}
        onRetry={() => settings.refetch()}
      />
    )
  }

  const pending = Object.keys(draft.values).length + (draft.limits ? 1 : 0)

  return (
    <div className='space-y-4'>
      <ConnectionSection />
      <PanelPasswordSection isDefault={data.panel_password_is_default} />
      <ApiKeysSection settings={data} />
      <LimitsSection
        limits={data.limits}
        draft={draft.limits}
        onChange={setLimits}
      />
      <PricingSection
        settings={data}
        values={draft.values}
        onChange={setValue}
      />
      <BehaviourSection
        settings={data}
        values={draft.values}
        onChange={setValue}
      />
      <ProxySlotsSection />
      <UpdatesSection />

      <div className='bg-card sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 shadow-sm'>
        <p className='text-muted-foreground text-sm'>
          {pending > 0
            ? t('{{count}} unsaved changes', { count: pending })
            : t('No unsaved changes')}
        </p>
        <div className='flex gap-2'>
          <Button
            type='button'
            variant='outline'
            disabled={pending === 0}
            onClick={() => setDraft(EMPTY_DRAFT)}
          >
            {t('Discard')}
          </Button>
          <Button
            type='button'
            disabled={pending === 0 || save.isPending}
            onClick={() => setConfirmSave(true)}
          >
            <Save className='mr-1 size-4' />
            {t('Save settings')}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title={t('Save these gateway settings?')}
        desc={t(
          'The gateway applies the changed settings immediately and keeps serving requests.'
        )}
        confirmText={t('Save')}
        isLoading={save.isPending}
        handleConfirm={() => save.mutate()}
      />
    </div>
  )
}
