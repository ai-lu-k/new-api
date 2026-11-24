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
import { SlidersHorizontal } from 'lucide-react'
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
  getPoolSettings,
  updatePoolSettings,
} from '../../api'
import {
  COMMAND_CODE_ALL_EXHAUSTED,
  COMMAND_CODE_MODES,
  MILLISECONDS_PER_MINUTE,
  millisecondsToUnit,
  unitToMilliseconds,
} from '../../lib'

/**
 * The proxy's scheduling: how long a session stays on one key, when a failing
 * key is abandoned, how often credits are re-read, and what happens when the
 * whole pool is unusable. Durations are edited in minutes and stored in
 * milliseconds, which is the unit the proxy keeps.
 */
export function SchedulingSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<string | null>(null)
  const [failThreshold, setFailThreshold] = useState<number | null>(null)
  const [sessionTtlMinutes, setSessionTtlMinutes] = useState<number | null>(
    null
  )
  const [refreshMinutes, setRefreshMinutes] = useState<number | null>(null)
  const [busyMinutes, setBusyMinutes] = useState<number | null>(null)
  const [autoDisable, setAutoDisable] = useState<boolean | null>(null)
  const [allExhausted, setAllExhausted] = useState<string | null>(null)

  const query = useQuery({
    queryKey: commandCodePoolKeys.settings,
    queryFn: async () => requireServerSuccess(await getPoolSettings()),
  })
  const settings = query.data?.data?.settings

  const save = useMutation({
    mutationFn: async () => {
      if (!settings) {
        throw new Error(t('The scheduling settings are not loaded.'))
      }
      const body: Parameters<typeof updatePoolSettings>[0] = {
        mode: mode ?? settings.mode,
        failThreshold: failThreshold ?? settings.failThreshold,
        sessionTtlMs: unitToMilliseconds(
          sessionTtlMinutes ??
            millisecondsToUnit(settings.sessionTtlMs, MILLISECONDS_PER_MINUTE),
          MILLISECONDS_PER_MINUTE
        ),
        creditsRefreshMs: unitToMilliseconds(
          refreshMinutes ??
            millisecondsToUnit(
              settings.creditsRefreshMs,
              MILLISECONDS_PER_MINUTE
            ),
          MILLISECONDS_PER_MINUTE
        ),
        autoDisableExhausted: autoDisable ?? settings.autoDisableExhausted,
        onAllExhausted: allExhausted ?? settings.onAllExhausted,
      }
      // Expiry-first dispatch only exists on proxy builds that report it; the
      // field is never invented for a build that does not.
      if (settings.expiryBusyMs !== undefined) {
        body.expiryBusyMs = unitToMilliseconds(
          busyMinutes ??
            millisecondsToUnit(settings.expiryBusyMs, MILLISECONDS_PER_MINUTE),
          MILLISECONDS_PER_MINUTE
        )
      }
      const response = await updatePoolSettings(body)
      if (!response.success) {
        throw new Error(
          response.message || t('Unable to save the scheduling settings.')
        )
      }
      return response.data
    },
    onSuccess: async () => {
      setMode(null)
      setFailThreshold(null)
      setSessionTtlMinutes(null)
      setRefreshMinutes(null)
      setBusyMinutes(null)
      setAutoDisable(null)
      setAllExhausted(null)
      toast.success(t('Scheduling saved.'))
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: commandCodePoolKeys.settings,
        }),
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
  if (!settings) {
    return null
  }

  return (
    <TitledCard
      icon={<SlidersHorizontal />}
      title={t('Scheduling and credits')}
      description={t(
        'How the proxy keeps a session on one key, when it abandons a failing one, and how often it re-reads credits.'
      )}
    >
      <div className='space-y-4'>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='commandcode-mode'>{t('Mode')}</Label>
            <Select
              value={mode ?? settings.mode}
              onValueChange={(value) => setMode(value ?? null)}
            >
              <SelectTrigger id='commandcode-mode'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {COMMAND_CODE_MODES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.label)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Session affinity keeps a conversation on one key; per request re-picks every time.'
              )}
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='commandcode-all-exhausted'>
              {t('When the pool is exhausted')}
            </Label>
            <Select
              value={allExhausted ?? settings.onAllExhausted}
              onValueChange={(value) => setAllExhausted(value ?? null)}
            >
              <SelectTrigger id='commandcode-all-exhausted'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {COMMAND_CODE_ALL_EXHAUSTED.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.label)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='commandcode-fail-threshold'>
              {t('Failures before switching keys')}
            </Label>
            <Input
              id='commandcode-fail-threshold'
              type='number'
              min={1}
              max={20}
              step={1}
              value={String(failThreshold ?? settings.failThreshold)}
              onChange={(event) =>
                setFailThreshold(
                  event.target.value === '' ? 0 : Number(event.target.value)
                )
              }
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='commandcode-session-ttl'>
              {t('Session lifetime')}
            </Label>
            <div className='flex items-center gap-2'>
              <Input
                id='commandcode-session-ttl'
                type='number'
                min={1}
                step={1}
                value={String(
                  sessionTtlMinutes ??
                    millisecondsToUnit(
                      settings.sessionTtlMs,
                      MILLISECONDS_PER_MINUTE
                    )
                )}
                onChange={(event) =>
                  setSessionTtlMinutes(
                    event.target.value === '' ? 0 : Number(event.target.value)
                  )
                }
              />
              <span className='text-muted-foreground text-sm'>
                {t('minutes')}
              </span>
            </div>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='commandcode-refresh-interval'>
              {t('Credits refresh interval')}
            </Label>
            <div className='flex items-center gap-2'>
              <Input
                id='commandcode-refresh-interval'
                type='number'
                min={0}
                step={1}
                value={String(
                  refreshMinutes ??
                    millisecondsToUnit(
                      settings.creditsRefreshMs,
                      MILLISECONDS_PER_MINUTE
                    )
                )}
                onChange={(event) =>
                  setRefreshMinutes(
                    event.target.value === '' ? 0 : Number(event.target.value)
                  )
                }
              />
              <span className='text-muted-foreground text-sm'>
                {t('minutes')}
              </span>
            </div>
            <p className='text-muted-foreground text-xs'>
              {t('Zero turns the background refresh off.')}
            </p>
          </div>
          {settings.expiryBusyMs !== undefined && (
            <div className='space-y-2'>
              <Label htmlFor='commandcode-busy-window'>
                {t('Consider a key busy for')}
              </Label>
              <div className='flex items-center gap-2'>
                <Input
                  id='commandcode-busy-window'
                  type='number'
                  min={0}
                  step={1}
                  value={String(
                    busyMinutes ??
                      millisecondsToUnit(
                        settings.expiryBusyMs,
                        MILLISECONDS_PER_MINUTE
                      )
                  )}
                  onChange={(event) =>
                    setBusyMinutes(
                      event.target.value === '' ? 0 : Number(event.target.value)
                    )
                  }
                />
                <span className='text-muted-foreground text-sm'>
                  {t('minutes')}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className='flex items-center justify-between gap-4'>
          <div className='min-w-0'>
            <Label htmlFor='commandcode-auto-disable'>
              {t('Disable keys whose credits are exhausted')}
            </Label>
            <p className='text-muted-foreground mt-0.5 text-xs'>
              {t(
                'The proxy stops routing to a key until its quota window resets or a fresh reading shows credits again.'
              )}
            </p>
          </div>
          <Switch
            id='commandcode-auto-disable'
            checked={autoDisable ?? settings.autoDisableExhausted}
            onCheckedChange={setAutoDisable}
          />
        </div>
        <div className='flex justify-end'>
          <Button
            type='button'
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {t('Save scheduling')}
          </Button>
        </div>
      </div>
    </TitledCard>
  )
}
