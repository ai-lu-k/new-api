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
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useStatus } from '@/hooks/use-status'

import { DshManualSteps } from './dsh-manual-steps'
import { DshQuickSetup } from './dsh-quick-setup'

/**
 * Getting started with DSH: the one-command setup where the site offers it,
 * with the manual steps kept one click away; the manual steps alone otherwise.
 */
export function DshGuide() {
  const { t } = useTranslation()
  const { status } = useStatus()

  if (!status?.dsh_setup_enabled) {
    // The first step brings its own top margin, which the section already has.
    return (
      <div className='-mt-9'>
        <DshManualSteps />
      </div>
    )
  }

  return (
    <>
      <DshQuickSetup />
      <Collapsible className='mt-6'>
        <CollapsibleTrigger className='group text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-sm font-medium'>
          <ChevronRight
            className='size-4 transition-transform group-data-[panel-open]:rotate-90'
            aria-hidden='true'
          />
          {t('Set it up by hand instead')}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <DshManualSteps />
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}
