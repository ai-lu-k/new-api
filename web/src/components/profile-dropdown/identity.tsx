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

/** The one square the account is drawn in: the trigger's mark and the panel's block. */
export const profileAvatarClass =
  'flex size-8 shrink-0 items-center justify-center bg-foreground text-[13px] font-semibold text-background'

export type ProfileIdentityProps = {
  /** First letter of the username. */
  initial: string
  name: string
  /** Role, then the handle or address that identifies the account. */
  role: string
  identifier: string
}

/**
 * Who is signed in: the square mark, the name, and one line of context. Two
 * lines only — the panel is 280px wide, so anything more would be an index of
 * account details rather than a header.
 */
export function ProfileIdentity(props: ProfileIdentityProps) {
  return (
    <div className='border-border flex items-center gap-[10px] border-b px-4 py-[14px]'>
      <span aria-hidden='true' className={profileAvatarClass}>
        {props.initial}
      </span>
      <div className='flex min-w-0 flex-col gap-0.5'>
        <p className='truncate text-[14px] leading-tight font-semibold'>
          {props.name}
        </p>
        {/* The instance only uses the default group, so it is not shown
            (see .agents/design/ui-approved.md). */}
        <p className='text-muted-foreground flex min-w-0 items-baseline gap-1 text-[12px]'>
          <span className='shrink-0'>{props.role}</span>
          <span aria-hidden='true'>·</span>
          <span className='truncate'>{props.identifier}</span>
        </p>
      </div>
    </div>
  )
}
