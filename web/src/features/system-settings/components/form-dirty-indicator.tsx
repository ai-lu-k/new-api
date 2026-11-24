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
import { motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { MOTION_SHIFT, MOTION_TRANSITION } from '@/lib/motion'

import { SettingsPageSaveBarStatusPortal } from './settings-page-context'

type FormDirtyIndicatorProps = {
  isDirty: boolean
  message?: string
}

/**
 * Compact status marker for unsaved form changes. It renders inside the page's
 * sticky save bar, next to the actions it guards, so it stays visible while the
 * fields scroll.
 *
 * @example
 * ```tsx
 * <FormDirtyIndicator isDirty={form.formState.isDirty} />
 * ```
 */
export function FormDirtyIndicator({
  isDirty,
  message,
}: FormDirtyIndicatorProps) {
  const { t } = useTranslation()
  const shouldReduce = useReducedMotion()
  if (!isDirty) return null

  return (
    <SettingsPageSaveBarStatusPortal>
      {/* The save bar raises 4px as the marker appears (contract §5). */}
      <motion.span
        initial={shouldReduce ? false : { opacity: 0, y: MOTION_SHIFT.micro }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOTION_TRANSITION.base}
        className='inline-flex h-5 items-center gap-1.5 rounded-full bg-amber-500/10 px-2 text-[11px] font-medium whitespace-nowrap text-amber-700 ring-1 ring-amber-500/20 ring-inset dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20'
      >
        <span className='size-1.5 rounded-full bg-amber-500 dark:bg-amber-300' />
        {message ? t(message) : t('Unsaved changes')}
      </motion.span>
    </SettingsPageSaveBarStatusPortal>
  )
}
