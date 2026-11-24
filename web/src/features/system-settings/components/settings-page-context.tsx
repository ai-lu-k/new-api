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
import { RotateCcw, Save } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { MOTION_SHIFT, MOTION_TRANSITION } from '@/lib/motion'

type SettingsPageContextValue = {
  actionsContainer: HTMLDivElement | null
  titleStatusContainer: HTMLSpanElement | null
  saveBarStatusContainer: HTMLSpanElement | null
  setSaveBarStatusContainer: (element: HTMLSpanElement | null) => void
  suppressSectionHeader: boolean
}

const SettingsPageContext = createContext<SettingsPageContextValue>({
  actionsContainer: null,
  titleStatusContainer: null,
  saveBarStatusContainer: null,
  setSaveBarStatusContainer: () => undefined,
  suppressSectionHeader: false,
})

type SettingsPageProviderProps = {
  actionsContainer: HTMLDivElement | null
  titleStatusContainer?: HTMLSpanElement | null
  children: ReactNode
  suppressSectionHeader?: boolean
}

export function SettingsPageProvider(props: SettingsPageProviderProps) {
  // State (not a ref) so the dirty marker re-renders once its slot in the save
  // bar exists.
  const [saveBarStatusContainer, setSaveBarStatusContainer] =
    useState<HTMLSpanElement | null>(null)

  return (
    <SettingsPageContext.Provider
      value={{
        actionsContainer: props.actionsContainer,
        titleStatusContainer: props.titleStatusContainer ?? null,
        saveBarStatusContainer,
        setSaveBarStatusContainer,
        suppressSectionHeader: props.suppressSectionHeader ?? true,
      }}
    >
      {props.children}
    </SettingsPageContext.Provider>
  )
}

export function useSuppressSettingsSectionHeader() {
  return useContext(SettingsPageContext).suppressSectionHeader
}

type SettingsPageTitleStatusPortalProps = {
  children: ReactNode
}

export function SettingsPageTitleStatusPortal(
  props: SettingsPageTitleStatusPortalProps
) {
  const { titleStatusContainer } = useContext(SettingsPageContext)

  if (!titleStatusContainer) return null

  return createPortal(props.children, titleStatusContainer)
}

/**
 * Status marker rendered inside the sticky save bar, next to the actions it
 * belongs to, so an unsaved form is flagged where the user is looking.
 */
export function SettingsPageSaveBarStatusPortal(
  props: SettingsPageTitleStatusPortalProps
) {
  const { saveBarStatusContainer } = useContext(SettingsPageContext)

  if (!saveBarStatusContainer) return null

  return createPortal(props.children, saveBarStatusContainer)
}

type SettingsPageActionsPortalProps = {
  children: ReactNode
}

export function SettingsPageActionsPortal(
  props: SettingsPageActionsPortalProps
) {
  const { actionsContainer, setSaveBarStatusContainer } =
    useContext(SettingsPageContext)
  const shouldReduce = useReducedMotion()

  if (!actionsContainer) return null

  return createPortal(
    // The save bar rises 4px as the section's actions take their slot.
    <motion.div
      initial={shouldReduce ? false : { opacity: 0, y: MOTION_SHIFT.micro }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION_TRANSITION.base}
      className='flex w-full flex-wrap items-center justify-end gap-2'
    >
      <span
        ref={setSaveBarStatusContainer}
        className='mr-auto inline-flex min-w-0 items-center'
      />
      {props.children}
    </motion.div>,
    actionsContainer
  )
}

type SettingsPageFormActionsProps = {
  onSave: () => void
  onReset?: () => void
  isSaving?: boolean
  isSaveDisabled?: boolean
  isResetDisabled?: boolean
  saveLabel?: string
  savingLabel?: string
  resetLabel?: string
  resetVariant?: ComponentProps<typeof Button>['variant']
  saveButtonRef?: RefObject<HTMLButtonElement | null>
}

export function SettingsPageFormActions(props: SettingsPageFormActionsProps) {
  const { t } = useTranslation()
  const saveLabel = props.isSaving
    ? (props.savingLabel ?? 'Saving...')
    : (props.saveLabel ?? 'Save Changes')

  return (
    <SettingsPageActionsPortal>
      {props.onReset && (
        <Button
          type='button'
          size='sm'
          variant={props.resetVariant ?? 'outline'}
          onClick={props.onReset}
          disabled={props.isResetDisabled || props.isSaving}
        >
          <RotateCcw data-icon='inline-start' />
          <span>{t(props.resetLabel ?? 'Reset')}</span>
        </Button>
      )}
      <Button
        ref={props.saveButtonRef}
        type='button'
        size='sm'
        onClick={props.onSave}
        disabled={props.isSaving || props.isSaveDisabled}
      >
        <Save data-icon='inline-start' />
        <span>{t(saveLabel)}</span>
      </Button>
    </SettingsPageActionsPortal>
  )
}
