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
import { useMutation } from '@tanstack/react-query'
import { Radar } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

import { hubPost } from '../../api'
import type { HubProxyDiscoverCandidate, HubProxySlot } from './types'

type DiscoverReply = { candidates?: HubProxyDiscoverCandidate[] }

/**
 * Ask the hub to scan the local mihomo ports and offer what it finds. Only
 * reachable exits can be imported; each one keeps the probe result so the slot
 * table shows the exit without a second test.
 */
export function ProxyDiscover(props: {
  existingUrls: string[]
  onImport: (slots: HubProxySlot[]) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])

  const discover = useMutation({
    mutationFn: async () => {
      const response = await hubPost<DiscoverReply>('proxy.discover', {})
      if (!response.success) {
        throw new Error(
          response.message || t('Unable to scan for proxy exits.')
        )
      }
      return response.data?.candidates ?? []
    },
    onSuccess: (candidates) => {
      const reachable = candidates.filter((item) => item.reachable)
      setPicked(reachable.map((item) => item.url))
      setOpen(true)
      if (reachable.length === 0) {
        toast.warning(t('No reachable exits were found.'))
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const candidates = discover.data ?? []

  function importPicked(): void {
    const imported: HubProxySlot[] = []
    for (const candidate of candidates) {
      if (!picked.includes(candidate.url)) continue
      if (props.existingUrls.includes(candidate.url)) continue
      imported.push({
        id: '',
        name: '',
        url: candidate.url,
        enabled: true,
        ip: candidate.exit_ip ?? '',
        country: candidate.country ?? '',
        country_code: candidate.country_code ?? '',
        ip_type: candidate.ip_type ?? '',
        isp: candidate.isp ?? '',
        asn: candidate.asn ?? '',
      })
    }
    if (imported.length === 0) {
      toast.warning(t('Nothing new to import.'))
      return
    }
    props.onImport(imported)
    setOpen(false)
    toast.success(
      t('Imported {{count}} exits. Save the slots to keep them.', {
        count: imported.length,
      })
    )
  }

  return (
    <>
      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={discover.isPending}
        onClick={() => discover.mutate()}
      >
        <Radar className='mr-1 size-4' />
        {t('Discover exits')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('Discovered proxy exits')}
        description={t('Pick the exits to add as slots.')}
        contentHeight='min(60vh, 520px)'
        footer={
          <Button type='button' onClick={importPicked}>
            {t('Import selected')}
          </Button>
        }
      >
        <div className='space-y-2'>
          {candidates.map((candidate) => (
            <label
              key={candidate.url}
              className='flex items-center gap-3 rounded-lg border p-2 text-sm'
            >
              <Checkbox
                checked={picked.includes(candidate.url)}
                disabled={!candidate.reachable}
                onCheckedChange={(checked) =>
                  setPicked(
                    checked
                      ? [...picked, candidate.url]
                      : picked.filter((url) => url !== candidate.url)
                  )
                }
              />
              <code className='font-mono text-xs'>{candidate.url}</code>
              {candidate.reachable ? (
                <Badge variant='secondary'>
                  {candidate.exit_ip} · {candidate.country || t('Unknown')} ·{' '}
                  {candidate.latency_ms ?? 0}ms
                </Badge>
              ) : (
                <Badge variant='destructive'>{t('Unreachable')}</Badge>
              )}
            </label>
          ))}
        </div>
      </Dialog>
    </>
  )
}
