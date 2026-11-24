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

import { StatusBadge, type StatusVariant } from '@/components/status-badge'
import { cn } from '@/lib/utils'

const tones: StatusVariant[] = [
  'neutral',
  'info',
  'blue',
  'purple',
  'orange',
  'pink',
  'amber',
]

const backgrounds = [
  'bg-muted',
  'bg-info/10',
  'bg-chart-1/10',
  'bg-chart-4/10',
  'bg-warning/10',
  'bg-chart-5/10',
  'bg-warning/10',
]

export function UsageLevelBadge(props: {
  level?: number
  showTitle?: boolean
  compact?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  if (
    props.level == null ||
    !Number.isInteger(props.level) ||
    props.level < 0 ||
    props.level > 6
  ) {
    return null
  }
  const titles = [
    t('Newcomer'),
    t('First steps'),
    t('Regular user'),
    t('Advanced user'),
    t('Veteran'),
    t('Core member'),
    t('Honorary member'),
  ]
  const title = titles[props.level]
  const label = props.showTitle
    ? `LV${props.level} · ${title}`
    : `LV${props.level}`
  return (
    <StatusBadge
      label={label}
      variant={tones[props.level]}
      copyable={false}
      type='badge'
      className={cn(
        'shrink-0',
        props.compact ? 'h-4 text-[10px]' : 'text-xs',
        backgrounds[props.level],
        props.className
      )}
      aria-label={t('Usage level {{level}}: {{title}}', {
        level: props.level,
        title,
      })}
    />
  )
}
