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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { api } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import {
  getServerErrorMessage,
  requireServerSuccess,
} from '@/lib/server-error-message'

import type {
  RelayAttempt,
  RelayOutcome,
  RelayReport,
  RelayScope,
  RelayTimeline,
} from '../../types'
import { DetailRow, DetailSection } from './log-detail-layout'

type TraceWindow = {
  scope: RelayScope
  until: number
  reason: string
  disabled?: boolean
  detailed: number
}
type TraceStatus = {
  windows: TraceWindow[]
  shared: boolean
  window_seconds: number
  writes: { dropped: number; failed: number }
  dropped_updates?: number
}

function TraceControl(props: { scope: RelayScope }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [failed, setFailed] = useState<string | null>(null)
  const status = useQuery({
    queryKey: ['relay-diagnostics'],
    queryFn: async () =>
      requireServerSuccess(
        (
          await api.get<{
            success: boolean
            message?: string
            data: TraceStatus
          }>('/api/relay-diagnostics')
        ).data
      ).data,
    staleTime: 2000,
    refetchInterval: 5000,
    meta: { errorToast: false },
  })
  const update = useMutation({
    mutationFn: async (enabled: boolean) =>
      requireServerSuccess(
        (
          await api.put<{ success: boolean; message?: string }>(
            '/api/relay-diagnostics',
            { scope: props.scope, enabled }
          )
        ).data
      ),
    onMutate: () => setFailed(null),
    onError: (error) =>
      setFailed(getServerErrorMessage(error, t('Trace update failed'))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['relay-diagnostics'] })
    },
    meta: { errorToast: false },
  })
  const window = status.data?.windows.find(
    (item) =>
      item.scope.channel_id === props.scope.channel_id &&
      item.scope.model === props.scope.model &&
      item.scope.path === props.scope.path
  )
  const active = !!window && !window.disabled && window.until > Date.now()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  return (
    <div className='space-y-2 pt-2'>
      <DetailRow
        label={t('Temporary trace')}
        value={active ? t('Active') : t('Inactive')}
      />
      {window && (
        <>
          <DetailRow
            label={t('Reason')}
            value={window.reason === 'manual' ? t('Manual') : t('Timeout')}
          />
          <DetailRow
            label={t('Expires')}
            value={new Date(window.until).toLocaleString(locale)}
          />
        </>
      )}
      {status.data && (
        <DetailRow
          label={t('Trace synchronization')}
          value={
            status.data.shared ? t('Shared via Redis') : t('Local instance')
          }
        />
      )}
      {status.data && (
        <DetailRow
          label={t('Dropped diagnostics')}
          value={formatNumber(
            status.data.writes.dropped +
              status.data.writes.failed +
              (status.data.dropped_updates ?? 0),
            locale
          )}
        />
      )}
      <div className='flex flex-wrap gap-2'>
        <Button
          size='sm'
          disabled={update.isPending}
          onClick={() => update.mutate(!active)}
        >
          {active ? t('Stop temporary trace') : t('Start temporary trace')}
        </Button>
      </div>
      {(failed || status.isError) && (
        <p role='alert' className='text-destructive text-xs'>
          {failed ?? t('Trace status unavailable')}
        </p>
      )}
    </div>
  )
}

function AttemptDetails(props: { attempt: RelayAttempt; isRoot: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const a = props.attempt
  const ms = (value: number | null | undefined) =>
    value == null ? t('Unavailable') : `${formatNumber(value, locale)} ms`
  const seconds = (value: number) =>
    value > 0 ? `${formatNumber(value, locale)} s` : t('Unlimited')
  return (
    <div className='space-y-1 border-t pt-2 first:border-t-0'>
      <DetailRow label={t('Attempt')} value={formatNumber(a.attempt, locale)} />
      <DetailRow label={t('Channel')} value={`#${a.scope.channel_id}`} />
      <DetailRow label={t('Model')} value={a.scope.model} />
      <DetailRow label={t('Path')} value={a.scope.path} mono />
      <DetailRow
        label={t('Protocol')}
        value={`${a.format} · ${a.protocol ?? t('Unavailable')}`}
      />
      <DetailRow
        label={t('Reasoning Effort')}
        value={a.effort ?? t('Unavailable')}
      />
      <DetailRow
        label={t('Input Tokens')}
        value={
          a.input_tokens == null
            ? t('Unavailable')
            : formatNumber(a.input_tokens, locale)
        }
      />
      <DetailRow
        label={t('Timeout budgets')}
        value={`${t('Response headers')}: ${seconds(a.budgets.headers_seconds)} · ${t('First byte')}: ${seconds(a.budgets.first_byte_seconds)} · ${t('Upstream idle')}: ${seconds(a.budgets.idle_seconds)} · ${t('Total')}: ${seconds(a.budgets.total_seconds)}`}
      />
      <DetailRow label={t('Source')} value={a.budgets.source} />
      <DetailRow label={t('Connected')} value={ms(a.connected_ms)} />
      <DetailRow label={t('Response headers')} value={ms(a.headers_ms)} />
      <DetailRow label={t('First byte')} value={ms(a.first_byte_ms)} />
      <DetailRow label={t('First event')} value={ms(a.first_event_ms)} />
      <DetailRow label={t('First content')} value={ms(a.first_content_ms)} />
      <DetailRow
        label={t('First reasoning')}
        value={ms(a.first_reasoning_ms)}
      />
      <DetailRow label={t('Last upstream data')} value={ms(a.last_data_ms)} />
      <DetailRow label={t('Maximum silence')} value={ms(a.max_silence_ms)} />
      <DetailRow
        label={t('Upstream heartbeats')}
        value={formatNumber(a.upstream_heartbeats, locale)}
      />
      <DetailRow
        label={t('Downstream pings')}
        value={formatNumber(a.downstream_pings, locale)}
      />
      <DetailRow
        label={t('Received bytes')}
        value={formatNumber(a.bytes, locale)}
      />
      <DetailRow
        label={t('Events')}
        value={formatNumber(a.event_count, locale)}
      />
      <DetailRow label={t('Status')} value={a.status || t('Unavailable')} />
      <DetailRow label={t('End Reason')} value={a.end_reason} />
      <DetailRow
        label={t('Timeout phase')}
        value={a.timeout_phase || t('Unavailable')}
      />
      <DetailRow label={t('Temporary trace')} value={a.detail_state} />
      {a.truncated && (
        <p className='text-muted-foreground text-xs'>
          {t('Diagnostic events truncated')}
        </p>
      )}
      {props.isRoot && <TraceControl scope={a.scope} />}
    </div>
  )
}

export function RelayDiagnostics(props: {
  outcome?: RelayOutcome
  report?: RelayReport
  timeline?: RelayTimeline
  isAdmin: boolean
  isRoot: boolean
}) {
  const { t, i18n } = useTranslation()
  if (!props.outcome && (!props.isAdmin || !props.report)) return null
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  return (
    <DetailSection label={t('Relay diagnostics')}>
      {props.outcome && (
        <>
          <DetailRow label={t('End Reason')} value={props.outcome.end_reason} />
          <DetailRow
            label={t('Timeout phase')}
            value={props.outcome.timeout_phase || t('Unavailable')}
          />
          <DetailRow
            label={t('Maximum silence')}
            value={`${formatNumber(props.outcome.max_silence_ms, locale)} ms`}
          />
        </>
      )}
      {props.isAdmin &&
        props.report?.attempts.map((a) => (
          <AttemptDetails key={a.attempt} attempt={a} isRoot={props.isRoot} />
        ))}
      {props.isAdmin && props.report?.truncated && (
        <p className='text-muted-foreground text-xs'>
          {t('Diagnostic attempts truncated')}
        </p>
      )}
      {props.isRoot &&
        props.timeline?.map((attempt) => (
          <ol
            key={attempt.attempt}
            aria-label={t('Diagnostic timeline')}
            className='space-y-1 border-t pt-2 text-xs'
          >
            {attempt.events.map((event) => (
              <li
                key={event.sequence}
                className='flex min-w-0 flex-wrap gap-2 font-mono'
              >
                <span>{formatNumber(event.at_ms, locale)} ms</span>
                <span>{event.direction}</span>
                <span>{event.kind}</span>
                {event.bytes != null && (
                  <span>{formatNumber(event.bytes, locale)} B</span>
                )}
              </li>
            ))}
          </ol>
        ))}
    </DetailSection>
  )
}
