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

import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency, getCurrencyDisplay } from '@/lib/currency'

import type { Voucher } from '../api'
import { FIBER_OVERLAP, type TearGeometry } from '../lib/tear-geometry'

/**
 * One voucher as paper: a body with the amount still sealed, and the stub that
 * holds it shut. Nothing here moves on its own — the deck owns the gesture and
 * writes the clip paths, so a pointer frame never re-renders React.
 */
export function ResetTicket(props: {
  voucher: Voucher
  geometry: TearGeometry | null
  /** The card in hand: its stub is the control, the rest is printed paper. */
  inHand: boolean
  /**
   * Without a tear to drag there is no gesture to learn, so a plain click is
   * the explicit action instead of an accident.
   */
  clickOpens?: boolean
  bodyRef?: React.Ref<HTMLDivElement>
  stubRef?: React.Ref<HTMLDivElement>
  onKeyTear?: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const serial = String(props.voucher.id).padStart(6, '0')
  // The face steps with the money: a plain sheet, a sheet whose rules are inked
  // in the seal colour, and a sheet that reverses the ink entirely.
  const yuan =
    props.voucher.face_value / getCurrencyDisplay().config.quotaPerUnit
  let tier = 'base'
  if (yuan >= 20) tier = 'premium'
  else if (yuan >= 5) tier = 'plus'
  // A sealed voucher already says what it is worth: the tear is the ceremony,
  // not the moment the reader learns the amount.
  const amount = formatQuotaWithCurrency(props.voucher.face_value, {
    locale,
    digitsLarge: 2,
    digitsSmall: 2,
  })
  const expiresAt = props.voucher.expires_at
  const geometry = props.geometry
  // The untouched ticket is drawn once: every seam, tooth and bite comes from
  // the same geometry the tear advances, so closing and opening agree exactly.
  const bodyClip = geometry?.bodyClip(0)
  const stubClip = geometry?.stubClip(0)
  const expires =
    expiresAt === undefined
      ? null
      : new Date(expiresAt * 1000).toLocaleString(locale, {
          timeZone: 'Asia/Shanghai',
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })

  return (
    <div
      className='voucher-ticket'
      data-voucher-id={props.voucher.id}
      data-tier={tier}
    >
      <div
        ref={props.bodyRef}
        className='voucher-ticket-body'
        style={{ clipPath: bodyClip, width: geometry?.bodyWidth }}
      >
        {/* Printed under the ink: the serial repeats as a watermark, the way a
            real ticket carries the same number twice. */}
        <span className='voucher-watermark' aria-hidden='true'>
          {serial}
        </span>
        <span className='voucher-hatch' aria-hidden='true' />
        <div className='voucher-print-header'>
          <span>NEW API / VOUCHER</span>
          <span className='voucher-serial'>Nº {serial}</span>
        </div>
        <span className='voucher-print-kind'>
          {/* The seal is the red block marker of the design system, not a colour
              of its own. */}
          <span className='voucher-seal' aria-hidden='true' />
          {t('Cash voucher')}
        </span>
        <strong className='voucher-print-amount'>{amount}</strong>
        <div className='voucher-print-footer'>
          {expires ? (
            <time dateTime={new Date((expiresAt ?? 0) * 1000).toISOString()}>
              {t('Expires at {{time}}', { time: expires })}
            </time>
          ) : null}
          <span className='voucher-print-bars'>NEW API</span>
        </div>
      </div>
      {geometry ? (
        <svg
          className='voucher-bridges'
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          width={geometry.width}
          height={geometry.height}
          aria-hidden='true'
        >
          <path d={geometry.bridgePath(0)} />
        </svg>
      ) : null}
      {props.inHand ? (
        <button
          type='button'
          className='voucher-ticket-stub'
          data-tear-stub=''
          aria-label={t('Open this voucher')}
          // A pointer press only starts a pull. The string is cut by the drag,
          // or by a keyboard activation, and by nothing else.
          onClick={(event) => {
            if (event.detail === 0 || props.clickOpens) props.onKeyTear?.()
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            props.onKeyTear?.()
          }}
        >
          {/*
            The paper reaches FIBER_OVERLAP px back over the body, so both
            halves are clipped along one seam. The stub's box starts at the seam
            already, which is why the reach is negative here.
          */}
          <div
            ref={props.stubRef}
            className='voucher-stub-paper'
            style={{
              clipPath: stubClip,
              left: geometry ? -FIBER_OVERLAP : undefined,
              width: geometry ? geometry.stubWidth + FIBER_OVERLAP : undefined,
            }}
          >
            <span className='voucher-stub-number'>{serial}</span>
            <span className='voucher-stub-grip' aria-hidden='true' />
          </div>
        </button>
      ) : (
        <div className='voucher-ticket-stub' aria-hidden='true'>
          <div
            className='voucher-stub-paper'
            style={{
              clipPath: stubClip,
              left: geometry ? -FIBER_OVERLAP : undefined,
              width: geometry ? geometry.stubWidth + FIBER_OVERLAP : undefined,
            }}
          >
            <span className='voucher-stub-number'>{serial}</span>
            <span className='voucher-stub-grip' aria-hidden='true' />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The piece that came off, resting beside the ticket it was torn from. It keeps
 * the ripped edge it had at the moment it let go, so nothing about the tear is
 * redrawn after the fact.
 */
export function TornStrip(props: {
  clip: string
  stubWidth: number
  angle: number
  serial: string
}) {
  return (
    <div className='voucher-torn-strip' aria-hidden='true'>
      <div className='voucher-ticket-stub'>
        <div
          className='voucher-stub-paper'
          style={{
            clipPath: props.clip,
            left: -FIBER_OVERLAP,
            width: props.stubWidth + FIBER_OVERLAP,
            // It keeps the tilt it had at the moment it let go.
            transform: `rotate(${props.angle}deg)`,
          }}
        >
          <span className='voucher-stub-number'>{props.serial}</span>
        </div>
      </div>
    </div>
  )
}
