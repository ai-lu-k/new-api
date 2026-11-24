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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { getServerErrorStatus } from '@/lib/server-error-message'

import {
  useCampaignSettle,
  useCampaignStatus,
} from '../../campaign/hooks/use-campaign'
import type {
  CampaignRankingSettlement,
  CampaignState,
  CampaignStatus,
} from '../../campaign/types'
import { SettingsSection } from '../components/settings-section'

// 用活动专属的词，别复用通用 UI 词（'Active' → 「生效」在别处是开关的语义）。
const STATE_LABEL: Record<CampaignState, string> = {
  disabled: 'Event disabled',
  scheduled: 'Event scheduled',
  active: 'Event active',
  ended: 'Event ended',
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className='rounded-lg border px-3 py-2'>
      <div className='text-muted-foreground text-xs'>{props.label}</div>
      <div className='mt-1 font-mono text-lg leading-tight'>{props.value}</div>
    </div>
  )
}

/**
 * Administrator view of the campaign money side.
 *
 * The event page pays per-solve rewards automatically, but the ranking prizes
 * are an explicit, one-off administrator action — the rules text promises that,
 * and the server enforces it (the backend ranking-state errors).
 * Without this page the only way to pay them is to call the admin endpoint by
 * hand, so the UI's job is to show who would be paid and make the single
 * irreversible click deliberate.
 *
 * Every guard here is cosmetic: the server re-checks the window and the
 * already-settled flag inside its transaction, so a stale tab cannot double-pay.
 */
export function CampaignSettlementSection() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const statusQuery = useCampaignStatus()
  const settleMutation = useCampaignSettle()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const status = statusQuery.data
  const settlement: CampaignRankingSettlement | null =
    settleMutation.data ?? null
  // With no campaign served the status endpoint answers 404; that is the
  // archived state, not a failure, so the panel stays readable without data.
  const archived =
    statusQuery.isError && getServerErrorStatus(statusQuery.error) === 404

  function onSettle() {
    settleMutation.mutate(undefined, {
      onSuccess: (result) => {
        setConfirmOpen(false)
        toast.success(
          t('Ranking rewards settled for {{count}} accounts', {
            count: result.winners.length,
          })
        )
      },
      onError: (error) => {
        setConfirmOpen(false)
        handleServerError(error, t('Could not settle the ranking rewards'))
      },
    })
  }

  return (
    <SettingsSection title={t('Campaign Event · Ranking Settlement')}>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Per-solve rewards are paid the moment an answer is accepted. The ranking prizes below are paid by hand, exactly once, after the event window closes — saving the settings above never pays anything.'
        )}
      </p>
      {archived ? (
        <ArchivedNotice />
      ) : (
        <SettlementBody
          status={status}
          settlement={settlement}
          loading={statusQuery.isLoading}
          settling={settleMutation.isPending}
          confirmOpen={confirmOpen}
          onConfirmOpenChange={setConfirmOpen}
          onRetry={() => void statusQuery.refetch()}
          onSettle={onSettle}
          locale={locale}
        />
      )}
    </SettingsSection>
  )
}

type BodyProps = {
  status: CampaignStatus | undefined
  settlement: CampaignRankingSettlement | null
  loading: boolean
  settling: boolean
  confirmOpen: boolean
  onConfirmOpenChange: (open: boolean) => void
  onRetry: () => void
  onSettle: () => void
  locale: string | undefined
}

function ArchivedNotice() {
  const { t } = useTranslation()
  return (
    <div className='rounded-lg border border-dashed px-4 py-3'>
      <p className='text-sm font-medium'>{t('Archived')}</p>
      <p className='text-muted-foreground mt-1 text-xs'>
        {t(
          'This campaign is switched off, so payouts are disabled here. Switch it on again to settle a running event.'
        )}
      </p>
    </div>
  )
}

function SettlementBody(props: BodyProps) {
  const { t } = useTranslation()
  const { status, settlement, locale } = props

  if (props.loading) {
    return <p className='text-muted-foreground text-sm'>{t('Loading…')}</p>
  }

  if (!status) {
    return (
      <div className='flex items-center gap-3'>
        <span className='text-muted-foreground text-sm'>
          {t('The event data could not be loaded.')}
        </span>
        <Button size='sm' variant='outline' onClick={props.onRetry}>
          {t('Retry')}
        </Button>
      </div>
    )
  }

  const settledAt = settlement?.settled_at || status.ranking_settled_at || 0
  const alreadySettled = status.ranking_settled_at > 0
  const settled = settlement !== null || alreadySettled
  const ended = status.state === 'ended'
  const canSettle = ended && !settled && !props.settling
  const prizeLadder = status.ranking_yuan
  const rows = status.leaderboard

  const settledAtLabel = settledAt
    ? new Date(settledAt * 1000).toLocaleString(locale)
    : ''

  const settleHint = ended
    ? t(
        'The event has ended. Paying now credits the prize ladder to the top eligible entrants and marks their final rank.'
      )
    : t('The event has not ended yet, so the ranking prizes are still locked.')

  const settleLabel = props.settling ? t('Settling…') : t('Settle now')

  return (
    <>
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
        <Stat label={t('Event state')} value={t(STATE_LABEL[status.state])} />
        <Stat
          label={t('Participants')}
          value={formatNumber(status.participants, locale)}
        />
        <Stat
          label={t('Solves')}
          value={formatNumber(status.solve_count, locale)}
        />
        <Stat
          label={t('Reward slots')}
          value={`${formatNumber(status.slots_left, locale)} / ${formatNumber(status.reward_slots, locale)}`}
        />
        <Stat
          label={t('Prize pool')}
          value={`¥${formatNumber(status.reward_pool_yuan, locale)}`}
        />
      </div>

      {prizeLadder.length > 0 ? (
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <span className='text-muted-foreground'>{t('Prize ladder')}</span>
          {prizeLadder.map((yuan, index) => (
            <span
              key={`prize-${index + 1}`}
              className='rounded-md border px-2 py-0.5 font-mono text-xs'
            >
              #{index + 1} ¥{formatNumber(yuan, locale)}
            </span>
          ))}
        </div>
      ) : null}

      <div className='rounded-lg border'>
        <div className='text-muted-foreground grid grid-cols-[3rem_minmax(0,1fr)_5rem_5rem_6rem] gap-2 border-b px-3 py-2 text-xs'>
          <span>{t('Rank')}</span>
          <span>{t('Name')}</span>
          <span className='text-right'>{t('Points')}</span>
          <span className='text-right'>{t('Solved')}</span>
          <span className='text-right'>{t('Prize')}</span>
        </div>
        {rows.length === 0 ? (
          <p className='text-muted-foreground px-3 py-4 text-sm'>
            {t('Nobody has scored yet.')}
          </p>
        ) : (
          rows.map((row) => {
            const place = row.final_rank > 0 ? row.final_rank : row.rank
            const prize = prizeLadder[place - 1]
            const showPrize = row.eligible && prize !== undefined
            return (
              <div
                key={row.user_id}
                className='grid grid-cols-[3rem_minmax(0,1fr)_5rem_5rem_6rem] items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0'
              >
                <span className='font-mono text-xs'>{place}</span>
                <span className='flex min-w-0 items-center gap-2'>
                  <span className='truncate'>{row.name}</span>
                  {row.eligible ? null : (
                    <span className='text-muted-foreground shrink-0 rounded border px-1 text-[0.65rem]'>
                      {t('Not eligible')}
                    </span>
                  )}
                </span>
                <span className='text-right font-mono text-xs'>
                  {formatNumber(row.points, locale)}
                </span>
                <span className='text-right font-mono text-xs'>
                  {formatNumber(row.solved_count, locale)}
                </span>
                <span className='text-right font-mono text-xs'>
                  {showPrize ? `¥${formatNumber(prize, locale)}` : '—'}
                </span>
              </div>
            )
          })
        )}
      </div>

      <div className='flex flex-col gap-3 rounded-lg border p-3'>
        {settled ? (
          <>
            <div className='text-sm font-medium'>
              {t('Ranking rewards already settled')}
            </div>
            {settledAtLabel ? (
              <p className='text-muted-foreground text-xs'>
                {t('Settled at {{time}}', { time: settledAtLabel })}
              </p>
            ) : null}
            {settlement && settlement.winners.length > 0 ? (
              <ul className='space-y-1 text-sm'>
                {settlement.winners.map((winner) => (
                  <li key={winner.user_id} className='flex gap-2'>
                    <span className='font-mono text-xs'>#{winner.rank}</span>
                    <span className='min-w-0 flex-1 truncate'>
                      {winner.name}
                    </span>
                    <span className='font-mono text-xs'>
                      ¥{formatNumber(winner.yuan, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'These prizes were paid earlier; the winner list is only shown right after this session performs the payout.'
                )}
              </p>
            )}
            <p className='text-muted-foreground text-xs'>
              {t(
                'Settlement runs once and is never repeated, so a second click cannot pay twice.'
              )}
            </p>
          </>
        ) : (
          <>
            <div className='text-sm font-medium'>
              {t('Settle ranking rewards')}
            </div>
            <p className='text-muted-foreground text-xs'>{settleHint}</p>
            <div>
              <AlertDialog
                open={props.confirmOpen}
                onOpenChange={props.onConfirmOpenChange}
              >
                <AlertDialogTrigger
                  render={<Button size='sm' disabled={!canSettle} />}
                >
                  {settleLabel}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('Pay the ranking prizes now?')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t(
                        'This credits real balance to up to {{count}} entrants and cannot be undone. It only works after the event window has closed, and only once.',
                        { count: prizeLadder.length || 3 }
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={props.onSettle}>
                      {t('Yes, settle')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </div>
    </>
  )
}
