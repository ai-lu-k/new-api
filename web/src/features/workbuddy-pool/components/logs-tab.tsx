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
import { ScrollText } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubGet, hubPost } from '../api'
import { LogFilterBar } from './runtime-logs/log-filter-bar'
import { LogList } from './runtime-logs/log-list'
import {
  logMatches,
  type HubLogEntry,
  type HubLogPayload,
} from './runtime-logs/types'

/** How many lines one read asks for; the hub keeps a 2000-entry ring buffer. */
const LOG_LIMIT = 500

/**
 * The hub's runtime log. Reads go through the hub's own server-side filters so a
 * level or tag narrows the whole buffer, not only the tail that arrived. Nothing
 * polls unless auto refresh is on.
 */
export function LogsTab() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const [level, setLevel] = useState('all')
  const [tag, setTag] = useState('all')
  const [text, setText] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const logs = useQuery({
    queryKey: ['workbuddy', 'logs', { level, tag }],
    queryFn: async () => {
      const params: Record<string, unknown> = { limit: LOG_LIMIT }
      if (level !== 'all') params.level = level
      if (tag !== 'all') params.tag = tag
      return requireServerSuccess(await hubGet<HubLogPayload>('logs', params))
    },
    refetchInterval: autoRefresh ? 5000 : false,
    meta: { errorToast: false },
  })

  const payload = logs.data?.data
  const entries: HubLogEntry[] = payload?.logs ?? []
  const visible = entries.filter((entry) => logMatches(entry, text)).reverse()
  const knownTags = entries
    .map((entry) => entry.tag)
    .filter((value) => value !== '')
  const mode = payload?.mode === 'db' ? t('Persisted') : t('Memory buffer')

  const exportLogs = useMutation({
    mutationFn: async () => {
      const response = await hubGet<{ text?: string }>('logs.export')
      if (!response.success) {
        throw new Error(response.message || t('Unable to export the log.'))
      }
      const body = response.data?.text
      if (!body) {
        throw new Error(t('The hub returned an empty log.'))
      }
      return body
    },
    onSuccess: (body) => {
      const blob = new Blob([body], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'workbuddy.log'
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(t('Log downloaded.'))
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const clearLogs = useMutation({
    mutationFn: async () => {
      const response = await hubPost<{ ok?: boolean }>('logs.clear', {})
      if (!response.success) {
        throw new Error(response.message || t('Unable to clear the log.'))
      }
      return true
    },
    onSuccess: async () => {
      setConfirmClear(false)
      toast.success(t('Log cleared.'))
      await queryClient.invalidateQueries({ queryKey: ['workbuddy', 'logs'] })
    },
    onError: (error: Error) => {
      setConfirmClear(false)
      toast.error(error.message)
    },
  })

  if (logs.isPending) {
    return <LoadingState />
  }
  if (!payload) {
    return (
      <ErrorState
        title={t('Unable to read the runtime log')}
        description={logs.error?.message}
        onRetry={() => logs.refetch()}
      />
    )
  }

  return (
    <TitledCard
      icon={<ScrollText />}
      title={t('Runtime log')}
      description={t(
        'Reverse-proxy requests, streaming forwards, dispatch checks, scheduled tasks and warnings, captured by the gateway as they happen.'
      )}
      action={
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline'>
            {t('{{visible}} of {{total}} lines', {
              visible: formatNumber(visible.length, locale),
              total: formatNumber(payload.total, locale),
            })}
          </Badge>
          <Badge variant='secondary'>{mode}</Badge>
        </div>
      }
    >
      <div className='space-y-3'>
        <LogFilterBar
          level={level}
          tag={tag}
          text={text}
          autoRefresh={autoRefresh}
          tags={knownTags}
          busy={exportLogs.isPending || clearLogs.isPending}
          onLevelChange={setLevel}
          onTagChange={setTag}
          onTextChange={setText}
          onAutoRefreshChange={setAutoRefresh}
          onExport={() => exportLogs.mutate()}
          onClear={() => setConfirmClear(true)}
        />
        {logs.isError && (
          <p className='text-destructive text-xs'>
            {logs.error?.message || t('Unable to read the runtime log')}
          </p>
        )}
        <LogList entries={visible} />
        <p className='text-muted-foreground text-xs'>
          {payload.mode === 'db'
            ? t(
                'History is kept in the log database ({{stored}} rows); the console reads the newest {{limit}}.',
                {
                  stored: formatNumber(payload.stored ?? 0, locale),
                  limit: formatNumber(LOG_LIMIT, locale),
                }
              )
            : t(
                'The gateway keeps the newest {{limit}} lines in memory; this console reads the newest {{limit}}.',
                { limit: formatNumber(LOG_LIMIT, locale) }
              )}
        </p>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t('Clear the runtime log?')}
        desc={t(
          'The gateway drops the lines it holds in memory. If the log database is enabled, its stored history is deleted too. This cannot be undone.'
        )}
        destructive
        confirmText={t('Clear log')}
        isLoading={clearLogs.isPending}
        handleConfirm={() => clearLogs.mutate()}
      />
    </TitledCard>
  )
}
