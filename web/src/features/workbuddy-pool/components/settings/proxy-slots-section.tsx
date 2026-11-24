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
import { Network, Plus, Save } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubGet, hubPost } from '../../api'
import { ProxyDiscover } from './proxy-discover'
import { ProxySlotsTable } from './proxy-slots-table'
import type { HubProxySlot, HubProxySlotList } from './types'

type SlotTestReply = {
  ok?: boolean
  slot?: HubProxySlot
  exit_ip?: string
  country?: string
  ip_type?: string
  latency_ms?: number
  error?: string
}

/** The exact row shape the hub's own slot save expects, probe fields included. */
function slotPayload(slot: HubProxySlot): Record<string, unknown> {
  return {
    id: slot.id || '',
    name: slot.name || '',
    url: (slot.url || '').trim(),
    enabled: slot.enabled !== false,
    ip: slot.ip || '',
    country: slot.country || '',
    country_code: slot.country_code || '',
    ip_type: slot.ip_type || '',
    isp: slot.isp || '',
    asn: slot.asn || '',
    probed_at: slot.probed_at || 0,
  }
}

/**
 * Proxy slots: the egress endpoints accounts are bound to. Slots are saved as a
 * whole list; a test probes one slot and stores the exit it found.
 */
export function ProxySlotsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draftSlots, setDraftSlots] = useState<HubProxySlot[] | null>(null)
  const [testingKey, setTestingKey] = useState<string | null>(null)

  const slots = useQuery({
    queryKey: ['workbuddy', 'settings', 'slots'],
    queryFn: async () =>
      requireServerSuccess(await hubGet<HubProxySlotList>('proxy.slots')),
  })
  const rows = draftSlots ?? slots.data?.data?.slots ?? []

  function editRows(next: HubProxySlot[]): void {
    setDraftSlots(next.map((slot) => ({ ...slot })))
  }

  function patchRow(index: number, patch: Partial<HubProxySlot>): void {
    const next = rows.map((slot) => ({ ...slot }))
    next[index] = { ...next[index], ...patch }
    setDraftSlots(next)
  }

  const save = useMutation({
    mutationFn: async () => {
      const response = await hubPost<HubProxySlotList>('proxy.slots.save', {
        slots: rows.map(slotPayload),
      })
      if (!response.success) {
        throw new Error(
          response.message || t('Unable to save the proxy slots.')
        )
      }
      return response.data?.slots ?? []
    },
    onSuccess: async (saved) => {
      setDraftSlots(null)
      toast.success(t('Saved {{count}} proxy slots.', { count: saved.length }))
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['workbuddy', 'settings', 'slots'],
        }),
        queryClient.invalidateQueries({ queryKey: ['workbuddy', 'accounts'] }),
      ])
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const test = useMutation({
    mutationFn: async (index: number) => {
      let id = rows[index]?.id ?? ''
      if (!id) {
        const stored = await hubPost<HubProxySlotList>('proxy.slots.save', {
          slots: rows.map(slotPayload),
        })
        if (!stored.success) {
          throw new Error(
            stored.message || t('Unable to save the proxy slots.')
          )
        }
        setDraftSlots(null)
        id = (stored.data?.slots ?? [])[index]?.id ?? ''
      }
      const response = await hubPost<SlotTestReply>('proxy.slots.test', { id })
      if (!response.success) {
        throw new Error(response.message || t('The slot test failed.'))
      }
      return { index, reply: response.data }
    },
    onMutate: (index: number) => {
      setTestingKey(rows[index]?.id || `row-${index}`)
    },
    onSuccess: async ({ index, reply }) => {
      setTestingKey(null)
      if (!reply?.ok) {
        toast.error(reply?.error || t('The slot test failed.'))
        return
      }
      if (reply.slot) {
        const next = rows.map((slot) => ({ ...slot }))
        next[index] = { ...next[index], ...reply.slot }
        setDraftSlots(next)
      }
      toast.success(
        t('Slot exit {{ip}} ({{latency}}ms)', {
          ip: reply.exit_ip || reply.slot?.ip || '',
          latency: reply.latency_ms ?? 0,
        })
      )
      await queryClient.invalidateQueries({
        queryKey: ['workbuddy', 'settings', 'slots'],
      })
    },
    onError: (error: Error) => {
      setTestingKey(null)
      toast.error(error.message)
    },
  })

  if (slots.isPending) {
    return <Skeleton className='h-56 w-full' />
  }

  return (
    <TitledCard
      icon={<Network />}
      title={t('Proxy slots')}
      description={t(
        'Egress endpoints accounts are bound to. A slot address change follows the bound accounts; disabling or deleting it falls back to direct.'
      )}
      action={
        <div className='flex flex-wrap gap-2'>
          <ProxyDiscover
            existingUrls={rows.map((slot) => slot.url)}
            onImport={(imported) => editRows([...rows, ...imported])}
          />
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() =>
              editRows([...rows, { id: '', url: '', enabled: true }])
            }
          >
            <Plus className='mr-1 size-4' />
            {t('Add slot')}
          </Button>
        </div>
      }
    >
      <div className='space-y-3'>
        <ProxySlotsTable
          slots={rows}
          testingKey={testingKey}
          onPatch={patchRow}
          onTest={(index) => test.mutate(index)}
          onDelete={(index) =>
            editRows(rows.filter((_, position) => position !== index))
          }
        />
        <div className='flex justify-end'>
          <Button
            type='button'
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            <Save className='mr-1 size-4' />
            {t('Save slots')}
          </Button>
        </div>
      </div>
    </TitledCard>
  )
}
