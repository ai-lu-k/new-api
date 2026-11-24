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
import { ArrowUpRight } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { openAuthDialog } from '@/stores/auth-dialog-store'
import { useAuthStore } from '@/stores/auth-store'
import { useTopupCampaignStore } from '@/stores/topup-campaign-store'

import { CampaignRules } from './campaign-rules'
import { useTopupCampaign } from './use-topup-campaign'

const CampaignRecharge = lazy(() =>
  import('@/features/wallet').then((module) => ({ default: module.Wallet }))
)

export function CampaignEntry() {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const ready = useAuthStore(
    (state) => state.auth.bootstrapState !== 'checking'
  )
  const seen = useTopupCampaignStore((state) => state.seen)
  const markSeen = useTopupCampaignStore((state) => state.markSeen)
  const [openFor, setOpenFor] = useState<string | null>(null)
  const { campaign, active } = useTopupCampaign()
  const identity = `${campaign?.id}:${userId ?? 'guest'}`

  useEffect(() => {
    if (!active || !ready || seen[identity]) return
    // Mark on presentation, rather than close, so refreshing an open notice
    // never presents it a second time. StrictMode replays do not close it.
    markSeen(identity)
    setOpenFor(identity)
  }, [active, identity, markSeen, ready, seen])

  if (!active || !campaign) return null

  return (
    <>
      <Button
        variant='ghost'
        size='sm'
        className='double11-entry'
        aria-label={t('Double 11 top-up offer')}
        onClick={() => setOpenFor(identity)}
      >
        <ArrowUpRight size={14} aria-hidden='true' />
        <span
          aria-hidden='true'
          className='text-sm font-black tracking-tighter'
        >
          11.11
        </span>
        <span className='hidden sm:inline'>{t('Double 11')}</span>
      </Button>
      <Dialog
        open={openFor === identity}
        onOpenChange={(open) => setOpenFor(open ? identity : null)}
        title={t('Double 11 top-up offer')}
        contentClassName={cn(
          'double11-modal',
          userId && 'double11-modal-recharge'
        )}
        headerClassName='sr-only'
        bodyViewportClassName='double11-viewport'
        bodyClassName='double11-dialog-body'
        footerClassName='double11-footer'
        footer={
          !userId ? (
            <Button
              className='double11-cta'
              onClick={() => {
                setOpenFor(null)
                openAuthDialog('sign-in', { redirectTo: '/wallet' })
              }}
            >
              {t('Sign in to top up')}
            </Button>
          ) : undefined
        }
      >
        <CampaignRules featured />
        {userId && openFor === identity && (
          <div className='double11-checkout'>
            <Suspense fallback={<LoadingState />}>
              <CampaignRecharge embedded />
            </Suspense>
          </div>
        )}
      </Dialog>
    </>
  )
}
