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
import { useStatus } from '@/hooks/use-status'

import { DshManualSteps } from './dsh-manual-steps'
import { DshQuickSetup } from './dsh-quick-setup'

/**
 * Getting started with DSH. Where the site offers the setup, both ways in run
 * the same script: through a prompt, or by hand. A site that has it switched
 * off shows the steps for filling DSH's own forms instead.
 */
export function DshGuide() {
  const { status } = useStatus()

  if (status?.dsh_setup_enabled) return <DshQuickSetup />

  // The first step brings its own top margin, which the section already has.
  return (
    <div className='-mt-9'>
      <DshManualSteps />
    </div>
  )
}
