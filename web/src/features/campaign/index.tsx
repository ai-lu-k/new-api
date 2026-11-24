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
import '@/styles/campaign.css'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import {
  getServerErrorMessage,
  getServerErrorStatus,
} from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import {
  CampaignHero,
  CampaignLeaderboard,
  CampaignProfile,
  CampaignRules,
  ChallengeBoard,
  ChallengeDialog,
} from './components'
import { EVENT_PATH } from './constants'
import {
  useCampaignClaim,
  useCampaignShare,
  useCampaignStatus,
  useCampaignSubmit,
} from './hooks/use-campaign'
import { formatShanghai, formatYuan } from './lib/format-event'
import { downloadShareCard } from './lib/share-card'
import type {
  CampaignChallenge,
  CampaignStatus,
  CampaignSubmitResult,
} from './types'

export function CampaignPage() {
  const { t } = useTranslation()
  const statusQuery = useCampaignStatus()
  useCampaignClaim()

  if (statusQuery.isPending) {
    return (
      <CampaignShell>
        <LoadingState message={t('Loading...')} />
      </CampaignShell>
    )
  }
  if (statusQuery.isError) {
    // A 404 means the operator has no campaign configured right now. That is a
    // normal state, not a failure: show the archived/empty page instead of an
    // error and a retry button.
    if (getServerErrorStatus(statusQuery.error) === 404) {
      return (
        <CampaignShell>
          <EmptyState
            title={t('No campaign is running')}
            description={t(
              'This page hosts one campaign at a time. Nothing is published right now.'
            )}
            action={
              <Button variant='outline' render={<Link to='/' />}>
                {t('Back to home')}
              </Button>
            }
          />
        </CampaignShell>
      )
    }
    return (
      <CampaignShell>
        <ErrorState onRetry={() => void statusQuery.refetch()} />
      </CampaignShell>
    )
  }
  return <CampaignEvent status={statusQuery.data} />
}

/** The campaign owns the whole viewport: no site chrome, no container margins. */
function CampaignShell(props: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  return (
    <div className='campaign-shell flex min-h-svh flex-col'>
      <header className='mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-6'>
        <Link to={EVENT_PATH} className='flex items-center gap-3'>
          <span className='font-mono text-lg font-bold text-[var(--campaign-fg-accent)]'>
            {t('Campaign')}
          </span>
        </Link>
        <nav className='flex items-center gap-1 text-sm'>
          <Link
            to='/'
            className='rounded-md px-3 py-1.5 text-[var(--campaign-fg-muted)] transition-colors hover:bg-emerald-300/10 hover:text-emerald-50'
          >
            {t('Back to home')}
          </Link>
          {user ? (
            <Link
              to='/dashboard'
              className='rounded-md px-3 py-1.5 text-[var(--campaign-fg-muted)] transition-colors hover:bg-emerald-300/10 hover:text-emerald-50'
            >
              {t('Console')}
            </Link>
          ) : (
            <Link
              to='/sign-in'
              search={{ redirect: EVENT_PATH }}
              className='rounded-md border border-[var(--campaign-line-strong)] px-3 py-1.5 text-[var(--campaign-fg)] transition-colors hover:bg-emerald-300/10'
            >
              {t('Sign in')}
            </Link>
          )}
        </nav>
      </header>
      <main className='mx-auto w-full max-w-[1600px] flex-1 space-y-6 px-4 pb-12 sm:px-6'>
        {props.children}
      </main>
    </div>
  )
}

function CampaignEvent(props: { status: CampaignStatus }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const status = props.status
  const submit = useCampaignSubmit()
  const share = useCampaignShare()
  const user = useAuthStore((state) => state.auth.user)
  const { status: siteStatus } = useStatus()
  const [selected, setSelected] = useState<CampaignChallenge | null>(null)
  const [result, setResult] = useState<CampaignSubmitResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!status.enabled || status.state === 'disabled') {
    return (
      <CampaignShell>
        <div className='campaign-grid flex flex-1 flex-col items-center justify-center rounded-2xl border border-[var(--campaign-line)] p-10 text-center'>
          <p className='font-mono text-3xl font-bold break-words text-[var(--campaign-fg-accent)]'>
            {status.title || status.slug}
          </p>
          <p className='mt-4 text-[var(--campaign-fg-strong)]'>
            {t('The event is not open yet.')}
          </p>
          <Button
            variant='outline'
            className='mt-6 border-[var(--campaign-line-strong)] bg-transparent text-[var(--campaign-fg)] hover:bg-emerald-300/10'
            render={<Link to='/' />}
          >
            {t('Back to home')}
          </Button>
        </div>
      </CampaignShell>
    )
  }

  const openChallenge = (challenge: CampaignChallenge) => {
    setSelected(challenge)
    setResult(
      challenge.solved
        ? {
            correct: true,
            already_solved: true,
            challenge_id: challenge.id,
            points: challenge.points,
            awarded_quota: challenge.awarded_quota,
            awarded_yuan: challenge.awarded_yuan,
            total_points: status.me.points,
            solved_count: status.me.solved_count,
            reward_slot: status.me.reward_slot,
            eligible: status.me.eligible,
            guest: status.me.guest,
          }
        : null
    )
    setError(null)
  }

  const submitAnswer = (answer: string) => {
    if (!selected) return
    setError(null)
    void submit
      .mutateAsync({ challengeId: selected.id, answer })
      .then((value) => {
        setResult(value)
        if (value.awarded_quota > 0) {
          toast.success(
            t('{{amount}} has been added to your balance.', {
              amount: formatYuan(value.awarded_yuan, locale),
            })
          )
        }
      })
      .catch((reason: unknown) => {
        setError(getServerErrorMessage(reason, t('That answer is not right.')))
      })
  }

  const handleShare = () => {
    if (!status.me.share_ready || share.isPending) return
    void (async () => {
      if (status.me.can_share && !status.me.share_claimed) {
        try {
          const value = await share.mutateAsync()
          if (value.quota > 0) {
            toast.success(
              t('Share reward {{amount}} received.', {
                amount: formatYuan(value.yuan, locale),
              })
            )
          }
        } catch (reason) {
          toast.error(
            getServerErrorMessage(
              reason,
              t('The share reward is not available.')
            )
          )
        }
      }
      const me = status.me
      const siteName =
        typeof siteStatus?.system_name === 'string'
          ? siteStatus.system_name
          : ''
      downloadShareCard(
        {
          siteName,
          eventName: status.title || status.slug,
          subtitle: t('Campaign'),
          name: user?.display_name || user?.username || t('Visitor') || '',
          rows: [
            { label: t('Points'), value: formatNumber(me.points, locale) },
            { label: t('Rank'), value: me.rank > 0 ? `#${me.rank}` : '—' },
            {
              label: t('Solved'),
              value: `${me.solved_count}/${status.challenges.length}`,
            },
            {
              label: t('Reward'),
              value: formatYuan(me.total_yuan, locale),
            },
          ],
          badge: me.eligible
            ? t('Reward slot #{{slot}}', { slot: me.reward_slot })
            : t('Outside the reward slots'),
          footer: t('Generated {{time}} (UTC+8)', {
            time: formatShanghai(Math.floor(Date.now() / 1000)),
          }),
        },
        `${status.slug || 'campaign'}-${me.points}pts.png`
      )
    })()
  }

  return (
    <CampaignShell>
      <div className='space-y-6'>
        <CampaignHero status={status} />
        <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]'>
          <div className='min-w-0 space-y-6'>
            <ChallengeBoard
              challenges={status.challenges}
              state={status.state}
              onSelect={openChallenge}
            />
            <CampaignLeaderboard
              rows={status.leaderboard}
              currentUser={user ?? undefined}
            />
          </div>
          <aside className='min-w-0 space-y-6'>
            <CampaignProfile
              status={status}
              sharing={share.isPending}
              onShare={handleShare}
            />
            <CampaignRules status={status} />
          </aside>
        </div>
        <ChallengeDialog
          key={selected?.id ?? 'none'}
          challenge={selected}
          number={
            status.challenges.findIndex((item) => item.id === selected?.id) + 1
          }
          open={selected !== null}
          submitting={submit.isPending}
          error={error}
          result={result}
          guest={status.me.guest}
          onSubmit={submitAnswer}
          onOpenChange={(open) => {
            if (!open) {
              setSelected(null)
              setResult(null)
              setError(null)
            }
          }}
        />
      </div>
    </CampaignShell>
  )
}
