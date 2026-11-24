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
import { Scale } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { TitledCard } from '@/components/ui/titled-card'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  commandCodePoolKeys,
  getLoadBalancing,
  updateLoadBalancing,
} from '../../api'
import {
  COMMAND_CODE_STICKY_BY,
  COMMAND_CODE_STRATEGIES,
  MILLISECONDS_PER_SECOND,
  millisecondsToUnit,
  unitToMilliseconds,
} from '../../lib'

/**
 * How the proxy spreads traffic across keys. Only the fields the proxy actually
 * reports are rendered and saved, so a proxy build without the dispatch
 * strategy still gets a working form instead of invisible defaults.
 */
export function LoadBalancingSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [maxRetries, setMaxRetries] = useState<number | null>(null)
  const [cooldownSeconds, setCooldownSeconds] = useState<number | null>(null)
  const [strategy, setStrategy] = useState<string | null>(null)
  const [stickyBy, setStickyBy] = useState<string | null>(null)
  const [expiryFirst, setExpiryFirst] = useState<boolean | null>(null)

  const query = useQuery({
    queryKey: commandCodePoolKeys.lb,
    queryFn: async () => requireServerSuccess(await getLoadBalancing()),
  })
  const lb = query.data?.data

  const save = useMutation({
    mutationFn: async () => {
      if (!lb) {
        throw new Error(t('The load balancing configuration is not loaded.'))
      }
      const body: {
        maxRetries: number
        cooldownMs: number
        strategy?: string
        stickyBy?: string
        expiryFirst?: boolean
      } = {
        maxRetries: maxRetries ?? lb.maxRetries,
        cooldownMs: unitToMilliseconds(
          cooldownSeconds ??
            millisecondsToUnit(lb.cooldownMs, MILLISECONDS_PER_SECOND),
          MILLISECONDS_PER_SECOND
        ),
      }
      if (lb.strategy !== undefined) body.strategy = strategy ?? lb.strategy
      if (lb.stickyBy !== undefined) body.stickyBy = stickyBy ?? lb.stickyBy
      if (lb.expiryFirst !== undefined) {
        body.expiryFirst = expiryFirst ?? lb.expiryFirst
      }
      const response = await updateLoadBalancing(body)
      if (!response.success) {
        throw new Error(
          response.message || t('Unable to save the load balancing.')
        )
      }
      return response.data
    },
    onSuccess: async () => {
      setMaxRetries(null)
      setCooldownSeconds(null)
      setStrategy(null)
      setStickyBy(null)
      setExpiryFirst(null)
      toast.success(t('Load balancing saved.'))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: commandCodePoolKeys.lb }),
        queryClient.invalidateQueries({ queryKey: commandCodePoolKeys.pool }),
      ])
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  if (query.isPending) {
    return <Skeleton className='h-56 w-full' />
  }
  if (!lb) {
    return null
  }

  return (
    <TitledCard
      icon={<Scale />}
      title={t('Load balancing')}
      description={t(
        'How the proxy picks a key, and how long a failing key is held out of rotation.'
      )}
    >
      <div className='space-y-4'>
        <div className='grid gap-4 sm:grid-cols-2'>
          {lb.strategy !== undefined && (
            <div className='space-y-2'>
              <Label htmlFor='commandcode-strategy'>{t('Strategy')}</Label>
              <Select
                value={strategy ?? lb.strategy ?? 'weighted'}
                onValueChange={(value) => setStrategy(value ?? null)}
              >
                <SelectTrigger id='commandcode-strategy'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {COMMAND_CODE_STRATEGIES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
          {lb.stickyBy !== undefined && (
            <div className='space-y-2'>
              <Label htmlFor='commandcode-sticky-by'>
                {t('Session affinity')}
              </Label>
              <Select
                value={stickyBy ?? lb.stickyBy ?? 'client-key'}
                onValueChange={(value) => setStickyBy(value ?? null)}
              >
                <SelectTrigger id='commandcode-sticky-by'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {COMMAND_CODE_STICKY_BY.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className='space-y-2'>
            <Label htmlFor='commandcode-max-retries'>{t('Max retries')}</Label>
            <Input
              id='commandcode-max-retries'
              type='number'
              min={0}
              max={5}
              step={1}
              value={String(maxRetries ?? lb.maxRetries)}
              onChange={(event) =>
                setMaxRetries(
                  event.target.value === '' ? 0 : Number(event.target.value)
                )
              }
            />
            <p className='text-muted-foreground text-xs'>
              {t('How many other keys are tried after a retryable failure.')}
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='commandcode-cooldown'>
              {t('Cooldown after a failure')}
            </Label>
            <div className='flex items-center gap-2'>
              <Input
                id='commandcode-cooldown'
                type='number'
                min={0}
                step={1}
                value={String(
                  cooldownSeconds ??
                    millisecondsToUnit(lb.cooldownMs, MILLISECONDS_PER_SECOND)
                )}
                onChange={(event) =>
                  setCooldownSeconds(
                    event.target.value === '' ? 0 : Number(event.target.value)
                  )
                }
              />
              <span className='text-muted-foreground text-sm'>
                {t('seconds')}
              </span>
            </div>
          </div>
        </div>
        {lb.expiryFirst !== undefined && (
          <div className='flex items-center justify-between gap-4'>
            <div className='min-w-0'>
              <Label htmlFor='commandcode-expiry-first'>
                {t('Prefer the key that expires first')}
              </Label>
              <p className='text-muted-foreground mt-0.5 text-xs'>
                {t(
                  'Spend the credits closest to expiring first, and let a busy key give way to an idle one.'
                )}
              </p>
            </div>
            <Switch
              id='commandcode-expiry-first'
              checked={expiryFirst ?? lb.expiryFirst}
              onCheckedChange={setExpiryFirst}
            />
          </div>
        )}
        <div className='flex justify-end'>
          <Button
            type='button'
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {t('Save load balancing')}
          </Button>
        </div>
      </div>
    </TitledCard>
  )
}
