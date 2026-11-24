import { Check, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Reveal } from '@/components/motion/reveal'
import { SectionPanel } from '@/components/section-panel'
import { StatusBadge } from '@/components/status-badge'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ReferralLadderStep } from '../types'

interface RewardLadderCardProps {
  ladder: ReferralLadderStep[]
  inviteeRewardYuan: number
  nextRewardYuan: number
}

export function RewardLadderCard(props: RewardLadderCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const rewarded = props.ladder.filter((step) => step.reached).length
  // An unconfigured ladder must not read as "0/0".
  const progress =
    props.ladder.length > 0
      ? `${t('Ladder progress')}: ${rewarded}/${props.ladder.length}`
      : undefined

  return (
    <SectionPanel
      title={t('Reward ladder')}
      description={progress}
      contentClassName='space-y-4 pt-1'
    >
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4'>
        {props.ladder.map((step, index) => (
          <Reveal
            key={step.ordinal}
            delay={Math.min(index, 3) * 0.04}
            className={cn(
              'flex min-w-0 flex-col items-center gap-2 border p-3 text-center',
              step.reached ? 'border-foreground' : 'border-border',
              step.current && !step.reached && 'border-dashed'
            )}
          >
            <div
              className={cn(
                'flex size-9 items-center justify-center border',
                step.reached
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground'
              )}
            >
              {step.reached ? (
                <Check aria-hidden='true' className='size-4' />
              ) : (
                <Lock aria-hidden='true' className='size-4' />
              )}
            </div>
            <div className='text-xl font-bold tabular-nums'>
              ¥{formatNumber(step.reward_yuan, locale)}
            </div>
            <div className='text-muted-foreground text-[11px] leading-snug'>
              {step.ordinal <= 3
                ? t('Invite #{{ordinal}}', { ordinal: step.ordinal })
                : t('4th invite and later')}
            </div>
            <StatusBadge
              type='text'
              label={step.reached ? t('Received') : t('Not unlocked yet')}
              variant='neutral'
              copyable={false}
              className={cn(
                'text-xs font-normal',
                step.reached && 'text-foreground'
              )}
            />
          </Reveal>
        ))}
      </div>
      <p className='text-muted-foreground text-[13px]'>
        {t('Your next friend reward is ¥{{amount}}.', {
          amount: formatNumber(props.nextRewardYuan, locale),
        })}{' '}
        {t('The invitee also receives a ¥{{amount}} voucher.', {
          amount: formatNumber(props.inviteeRewardYuan, locale),
        })}
      </p>
    </SectionPanel>
  )
}
