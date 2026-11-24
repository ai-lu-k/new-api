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
import { ConnectionPanel } from './gateway/connection-panel'
import { CreditsRefreshPanel } from './gateway/credits-refresh-panel'
import { LoadBalancingPanel } from './gateway/load-balancing-panel'
import { PoolOverviewPanel } from './gateway/pool-overview-panel'
import { UpstreamPanel } from './gateway/upstream-panel'

/**
 * The gateway page: whether the console can reach the proxy, where the proxy
 * sends CommandCode traffic, what the pool holds, how traffic is balanced and
 * when credits were last read.
 */
export function GatewayTab(): React.JSX.Element {
  return (
    <div className='space-y-4'>
      <div className='grid gap-4 lg:grid-cols-2'>
        <ConnectionPanel />
        <UpstreamPanel />
      </div>
      <PoolOverviewPanel />
      <div className='grid gap-4 lg:grid-cols-2'>
        <LoadBalancingPanel />
        <CreditsRefreshPanel />
      </div>
    </div>
  )
}
