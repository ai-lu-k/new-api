import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { SectionPanel } from '@/components/section-panel'
import { generateAffiliateLink } from '@/features/wallet/lib'

interface InviteCodeCardProps {
  affCode: string
  invites: number
  pending: number
}

/** The code and link to hand out, with one copy action each. */
export function InviteCodeCard(props: InviteCodeCardProps) {
  const { t } = useTranslation()
  const link = props.affCode ? generateAffiliateLink(props.affCode) : ''
  const counts = `${t('Total invites')}: ${props.invites}`
  const waiting =
    props.pending > 0
      ? ` · ${t('Waiting for verification')}: ${props.pending}`
      : ''

  return (
    <SectionPanel
      title={t('Your invite code')}
      description={`${counts}${waiting}`}
      contentClassName='space-y-3 pt-1'
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 space-y-0.5'>
          <p className='text-muted-foreground text-[13px]'>
            {t('Invite code')}
          </p>
          <p className='font-mono text-sm tracking-wider break-all'>
            {props.affCode || '—'}
          </p>
        </div>
        <CopyButton
          value={props.affCode}
          variant='outline'
          className='size-9 min-h-11 shrink-0 sm:min-h-8'
          iconClassName='size-4'
          tooltip={t('Copy invite code')}
          aria-label={t('Copy invite code')}
        />
      </div>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 space-y-0.5'>
          <p className='text-muted-foreground text-[13px]'>
            {t('Invite link')}
          </p>
          <p className='font-mono text-xs break-all'>{link || '—'}</p>
        </div>
        <CopyButton
          value={link}
          variant='outline'
          className='size-9 min-h-11 shrink-0 sm:min-h-8'
          iconClassName='size-4'
          tooltip={t('Copy invite link')}
          aria-label={t('Copy invite link')}
        />
      </div>
      <p className='text-muted-foreground text-[13px]'>
        {t(
          'The invite code is filled in automatically from the link and can still be edited before signing up.'
        )}
      </p>
    </SectionPanel>
  )
}
