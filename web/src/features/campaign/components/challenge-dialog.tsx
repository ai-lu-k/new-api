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
import { Download } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { TIER_CLASS_DIALOG, TIER_LABEL } from '../constants'
import { shiftText } from '../lib/caesar'
import { formatYuan } from '../lib/format-event'
import type { CampaignChallenge, CampaignSubmitResult } from '../types'

const ANSWER_FORM_ID = 'campaign-answer-form'

type ChallengeDialogProps = {
  challenge: CampaignChallenge | null
  number?: number
  open: boolean
  submitting: boolean
  error: string | null
  result: CampaignSubmitResult | null
  guest: boolean
  onSubmit: (answer: string) => void
  onOpenChange: (open: boolean) => void
}

export function ChallengeDialog(props: ChallengeDialogProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const imageTitleRef = useRef<HTMLSpanElement>(null)
  const [answer, setAnswer] = useState('')
  const [shift, setShift] = useState(0)
  const [hinted, setHinted] = useState(0)
  const challenge = props.challenge

  if (!challenge) {
    return (
      <Dialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={t('Challenge')}
      >
        <p className='text-muted-foreground text-sm'>{t('Pick a puzzle.')}</p>
      </Dialog>
    )
  }

  const hints = challenge.hints ?? []
  const disabled = props.submitting || answer.trim().length === 0

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      initialFocus={challenge.image_url ? imageTitleRef : undefined}
      title={
        <span
          ref={imageTitleRef}
          tabIndex={-1}
        >{`#${props.number === undefined ? challenge.id : formatNumber(props.number, locale)} · ${challenge.title}`}</span>
      }
      description={
        <span className='flex flex-wrap items-center gap-2'>
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 text-[0.65rem]',
              TIER_CLASS_DIALOG[challenge.tier]
            )}
          >
            {t(TIER_LABEL[challenge.tier])}
          </span>
          <span className='font-mono text-xs'>
            {challenge.points} pts ·{' '}
            {challenge.bonus
              ? t('Bonus · score only')
              : formatYuan(challenge.reward_yuan, locale)}
          </span>
        </span>
      }
      footer={
        props.result ? (
          <Button variant='secondary' onClick={() => props.onOpenChange(false)}>
            {t('Close')}
          </Button>
        ) : (
          <Button type='submit' form={ANSWER_FORM_ID} disabled={disabled}>
            {props.submitting ? t('Submitting...') : t('Submit answer')}
          </Button>
        )
      }
    >
      <div className='space-y-4'>
        {challenge.prompt ? (
          <pre className='max-h-80 overflow-auto rounded-lg border border-emerald-600/25 bg-emerald-50 p-4 font-mono text-xs leading-6 whitespace-pre-wrap text-emerald-950 dark:border-emerald-400/15 dark:bg-[#04100a] dark:text-emerald-100'>
            {challenge.prompt}
          </pre>
        ) : null}
        {challenge.image_url ? (
          <img
            src={challenge.image_url}
            alt={challenge.title}
            className='h-auto w-full rounded-lg'
          />
        ) : null}

        {challenge.widget === 'caesar' && challenge.widget_data ? (
          <div className='space-y-2 rounded-lg border p-3'>
            <div className='flex items-center justify-between text-sm'>
              <label htmlFor='campaign-shift' className='font-medium'>
                {t('Shift')}
              </label>
              <span className='font-mono text-xs'>{shift}</span>
            </div>
            <Slider
              id='campaign-shift'
              min={0}
              max={25}
              step={1}
              value={[shift]}
              onValueChange={(value) =>
                setShift(Array.isArray(value) ? (value[0] ?? 0) : value)
              }
            />
            <pre
              aria-live='polite'
              className='bg-muted max-h-40 overflow-auto rounded-md p-2 font-mono text-xs break-words whitespace-pre-wrap'
            >
              {shiftText(challenge.widget_data, -shift)}
            </pre>
            <p className='text-muted-foreground text-xs'>
              {t('Drag until the text reads like a sentence.')}
            </p>
          </div>
        ) : null}

        {hints.length > 0 ? (
          <div className='space-y-2'>
            <div className='flex items-center justify-between gap-2'>
              <p className='text-sm font-medium'>{t('Hints')}</p>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={hinted >= hints.length}
                onClick={() =>
                  setHinted((count) => Math.min(count + 1, hints.length))
                }
              >
                {hinted >= hints.length
                  ? t('All hints shown')
                  : t('Show hint {{index}}/{{total}}', {
                      index: hinted + 1,
                      total: hints.length,
                    })}
              </Button>
            </div>
            {hinted > 0 ? (
              <ol className='text-muted-foreground list-decimal space-y-1 ps-5 text-sm'>
                {hints.slice(0, hinted).map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}

        {challenge.files.length > 0 ? (
          <ul className='flex flex-wrap gap-2'>
            {challenge.files.map((file) => (
              <li key={file.name}>
                <a
                  href={file.url}
                  download={file.name}
                  className='text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs underline-offset-2'
                >
                  <Download className='size-3' aria-hidden='true' />
                  {file.name}
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {props.result ? (
          <div
            className='rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-4 dark:border-emerald-400/30 dark:bg-emerald-400/10'
            role='status'
          >
            <p className='font-mono text-sm text-emerald-900 dark:text-emerald-100'>
              {props.result.already_solved
                ? t('Already solved. No points added twice.')
                : t('Correct! +{{points}} points', {
                    points: props.result.points,
                  })}
            </p>
            <p className='mt-2 text-xs text-emerald-800/80 dark:text-emerald-100/80'>
              {props.result.awarded_quota > 0
                ? t('{{amount}} has been added to your balance.', {
                    amount: formatYuan(props.result.awarded_yuan, locale),
                  })
                : null}
              {challenge.bonus
                ? t('This bonus adds ranking points without a solve reward.')
                : null}
              {!challenge.bonus &&
              props.result.awarded_quota === 0 &&
              props.result.guest
                ? t('Sign in to link this progress and claim the reward.')
                : null}
              {!challenge.bonus &&
              props.result.awarded_quota === 0 &&
              !props.result.guest &&
              !props.result.eligible
                ? t('The reward slots are full. Your score still counts.')
                : null}
            </p>
            <p className='mt-1 font-mono text-[0.7rem] text-emerald-700/70 dark:text-emerald-200/60'>
              {t('Total {{points}} points · {{count}} solved', {
                points: props.result.total_points,
                count: props.result.solved_count,
              })}
            </p>
            {props.result.guest ? null : (
              <p className='mt-1 font-mono text-[0.7rem] text-emerald-700/70 dark:text-emerald-200/60'>
                {props.result.eligible
                  ? t('Reward slot #{{slot}}', {
                      slot: props.result.reward_slot,
                    })
                  : t('Outside the reward slots')}
              </p>
            )}
          </div>
        ) : (
          <form
            id={ANSWER_FORM_ID}
            className='space-y-2'
            onSubmit={(event) => {
              event.preventDefault()
              if (disabled) return
              props.onSubmit(answer)
            }}
          >
            <label
              className='text-sm font-medium'
              htmlFor='campaign-answer-input'
            >
              {t('Your answer')}
            </label>
            <Input
              id='campaign-answer-input'
              value={answer}
              autoComplete='off'
              spellCheck={false}
              className='font-mono'
              disabled={props.submitting}
              onChange={(event) => setAnswer(event.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              {t('Case and surrounding spaces are ignored.')}
            </p>
            {props.error ? (
              <p className='text-destructive text-sm' role='alert'>
                {props.error}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </Dialog>
  )
}
