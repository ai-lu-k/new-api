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
import { ConnectionSection } from './settings/connection-section'
import { LoadBalancingSection } from './settings/load-balancing-section'
import { SchedulingSection } from './settings/scheduling-section'

/**
 * The settings the console owns: the proxy address, the load balancing the
 * proxy applies, and its scheduling. Each block saves on its own, so a field
 * this proxy build does not report never blocks the rest.
 */
export function SettingsTab() {
  return (
    <div className='space-y-4'>
      <ConnectionSection />
      <LoadBalancingSection />
      <SchedulingSection />
    </div>
  )
}
