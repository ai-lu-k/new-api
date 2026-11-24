import { Link } from '@tanstack/react-router'
import { Megaphone, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import { dismissReferralBanner } from '../api'

/**
 * Campaign banner shown on every authenticated page. Closing it stores the
 * campaign on the account, so it stays closed across devices until a new
 * campaign ships.
 */
export function ReferralBanner() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const setUser = useAuthStore((state) => state.auth.setUser)
  const [dismissing, setDismissing] = useState(false)

  if (!user?.referral_banner) return null

  const close = async () => {
    if (dismissing) return
    setDismissing(true)
    try {
      await dismissReferralBanner()
      setUser({ ...user, referral_banner: '' })
    } catch (error) {
      handleServerError(error)
    } finally {
      setDismissing(false)
    }
  }

  return (
    <div
      role='status'
      className='bg-muted/40 flex shrink-0 items-center gap-3 border-b px-3 py-2 sm:px-4'
    >
      <Megaphone aria-hidden='true' className='size-4 shrink-0' />
      <p className='min-w-0 flex-1 truncate text-xs sm:text-sm'>
        {t(
          'Invite friends, earn vouchers: the first three friends bring ¥1 / ¥3 / ¥5, then ¥1 each, and your friend also gets ¥3'
        )}
      </p>
      <Button
        size='sm'
        className='h-7 shrink-0 px-2 text-xs'
        render={<Link to='/referral' />}
      >
        {t('View the referral ladder')}
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-7 shrink-0'
        aria-label={t('Close')}
        disabled={dismissing}
        onClick={() => void close()}
      >
        <X aria-hidden='true' className='size-4' />
      </Button>
    </div>
  )
}
