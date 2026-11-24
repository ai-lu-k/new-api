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
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { ChainChannel, ModelChain } from '../types'

/** Channels sharing a priority are one tier: the router weighs them against
 * each other instead of trying them in a fixed order. */
function tierNumbers(channels: ChainChannel[]): number[] {
  let current: number | undefined
  let tier = 0
  return channels.map((channel) => {
    if (channel.priority !== current) {
      current = channel.priority
      tier += 1
    }
    return tier
  })
}

function quietWhenEmpty<T>(
  value: (row: T) => number,
  tone: string
): (row: T) => string {
  const quiet = 'text-muted-foreground/50 tabular-nums'
  return (row) =>
    value(row) === 0 ? quiet : ['tabular-nums', tone].filter(Boolean).join(' ')
}

function channelLabel(
  channel: ChainChannel,
  channelNames: Record<string, string>
): string {
  return channelNames[String(channel.channel_id)] ?? ''
}

/** One model's channels, counted once each and ordered the way the router
 * tries them: highest priority tier first, heaviest channel inside it. */
function ModelChainCard(props: {
  chain: ModelChain
  channelNames: Record<string, string>
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const tiers = tierNumbers(props.chain.channels)
  // Failover rescued what the first tier dropped: only later tiers count.
  const rescued = props.chain.channels.reduce(
    (sum, channel, index) => (tiers[index] > 1 ? sum + channel.succeeded : sum),
    0
  )

  return (
    <article className='bg-card overflow-hidden rounded-lg border'>
      <header className='flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-2.5'>
        <h3 className='text-sm font-medium'>{props.chain.model}</h3>
        <span className='text-muted-foreground text-xs tabular-nums'>
          {t('Requests')} {formatNumber(props.chain.requests, locale)} ·{' '}
          {t('Completed')} {formatNumber(props.chain.completed, locale)} ·{' '}
          {t('Failed')} {formatNumber(props.chain.failed, locale)}
        </span>
        <span className='text-muted-foreground ml-auto text-xs tabular-nums'>
          {t('Failover recoveries')} {formatNumber(rescued, locale)}
        </span>
      </header>
      <StaticDataTable
        data={props.chain.channels}
        getRowKey={(channel) => channel.channel_id}
        className='px-4'
        columns={[
          {
            id: 'tier',
            header: t('Tier'),
            className: 'w-12',
            cell: (_channel, index) => (
              <span className='text-muted-foreground font-mono text-[11px] tabular-nums'>
                {tiers[index]}
              </span>
            ),
          },
          {
            id: 'channel',
            header: t('Channel'),
            cell: (channel) => (
              <span className='inline-flex min-w-0 items-baseline gap-2'>
                <span className='font-medium'>
                  #{formatNumber(channel.channel_id, locale)}
                </span>
                <span className='min-w-0 truncate text-xs'>
                  {channelLabel(channel, props.channelNames) ||
                    channel.upstream_model}
                </span>
                {channel.upstream_model ? (
                  <span className='text-muted-foreground truncate text-[11px]'>
                    {channel.upstream_model}
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            id: 'reached',
            header: t('Reached'),
            cell: (channel) => formatNumber(channel.reached, locale),
          },
          {
            id: 'succeeded',
            header: t('Succeeded'),
            // A zero is a fact worth seeing, but it should not compete with the
            // numbers that carry the traffic, so empty cells recede.
            cellClassName: quietWhenEmpty(
              (channel) => channel.succeeded,
              'text-emerald-600'
            ),
            cell: (channel) => formatNumber(channel.succeeded, locale),
          },
          {
            id: 'failed',
            header: t('Failed'),
            cellClassName: quietWhenEmpty(
              (channel) => channel.failed,
              'text-rose-600'
            ),
            cell: (channel) => formatNumber(channel.failed, locale),
          },
          {
            id: 'skipped',
            header: t('Skipped'),
            cellClassName: quietWhenEmpty(
              (channel) => channel.skipped + channel.rejected,
              'text-muted-foreground'
            ),
            cell: (channel) =>
              formatNumber(channel.skipped + channel.rejected, locale),
          },
          {
            id: 'terminated',
            header: t('Stopped here'),
            cellClassName: quietWhenEmpty((channel) => channel.terminated, ''),
            cell: (channel) => formatNumber(channel.terminated, locale),
          },
          {
            id: 'flow',
            header: t('Flow'),
            cellClassName: 'w-28',
            cell: (channel) => {
              const total = Math.max(channel.reached, 1)
              const segments = [
                {
                  key: 'succeeded',
                  value: channel.succeeded,
                  className: 'bg-emerald-500',
                  label: t('Succeeded'),
                },
                {
                  key: 'failed',
                  value: channel.failed,
                  className: 'bg-rose-500',
                  label: t('Failed'),
                },
                {
                  key: 'skipped',
                  value: channel.skipped + channel.rejected,
                  className: 'bg-muted-foreground/40',
                  label: t('Skipped'),
                },
              ]
              return (
                <span
                  className='bg-muted flex h-2 w-full overflow-hidden rounded-full'
                  title={segments
                    .map(
                      (segment) =>
                        `${segment.label} ${formatNumber(segment.value, locale)}`
                    )
                    .join(' · ')}
                >
                  {segments.map((segment) => (
                    <span
                      key={segment.key}
                      className={segment.className}
                      style={{ width: `${(segment.value / total) * 100}%` }}
                    />
                  ))}
                </span>
              )
            },
          },
        ]}
      />
    </article>
  )
}

export function ChainFunnel(props: {
  chains: ModelChain[]
  channelNames: Record<string, string>
}) {
  return (
    <div className='space-y-3'>
      {props.chains.map((chain) => (
        <ModelChainCard
          key={chain.model}
          chain={chain}
          channelNames={props.channelNames}
        />
      ))}
    </div>
  )
}
