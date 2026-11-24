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

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface HeaderMenuButtonProps {
  open: boolean
  onToggle: () => void
}

/** The button that folds the bar into its menu, and back. It shows at every width. */
export function HeaderMenuButton(props: HeaderMenuButtonProps) {
  const { t } = useTranslation()

  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      className='size-9'
      onClick={props.onToggle}
      aria-label={t('Toggle navigation menu')}
      aria-expanded={props.open}
    >
      <div className='relative size-4' aria-hidden='true'>
        <span
          className={cn(
            'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300',
            props.open ? 'top-[7px] rotate-45' : 'top-[3px]'
          )}
        />
        <span
          className={cn(
            'absolute inset-x-0 top-[7px] block h-[1.5px] rounded-full bg-current transition-all duration-300',
            props.open ? 'scale-x-0 opacity-0' : 'opacity-100'
          )}
        />
        <span
          className={cn(
            'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300',
            props.open ? 'top-[7px] -rotate-45' : 'top-[11px]'
          )}
        />
      </div>
    </Button>
  )
}
