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
import { Boxes } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  SideDrawerSectionHeader,
  sideDrawerSectionClassName,
} from '@/components/drawer-layout'
import { Reveal } from '@/components/motion/reveal'

type ChannelModelsSectionProps = {
  children: ReactNode
  /** Entrance delay in seconds; the drawer sequences its form groups. */
  delay?: number
}

export function ChannelModelsSection(props: ChannelModelsSectionProps) {
  const { t } = useTranslation()

  return (
    <Reveal
      as='section'
      delay={props.delay}
      className={sideDrawerSectionClassName()}
    >
      <SideDrawerSectionHeader
        title={t('Models')}
        icon={<Boxes className='h-4 w-4' aria-hidden='true' />}
        iconTone='neutral'
      />
      {props.children}
    </Reveal>
  )
}
