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
import { GatewayConsolePanel } from './gateway/console-panel'
import { GatewayHealthPanel } from './gateway/health-panel'
import { GatewayModelCatalogue } from './gateway/model-catalogue'
import { GatewayRealmCards } from './gateway/realm-cards'
import { GatewayRecentRequests } from './gateway/recent-requests'
import { GatewaySettingsSnapshot } from './gateway/settings-snapshot'
import { GatewayVersionPanel } from './gateway/version-panel'

/**
 * The hub's gateway page: which realm serves, how much credit the pool can
 * still spend, what the gateway reports about itself, the models it prices,
 * and the traffic it just served. Everything here reads the hub; the only
 * live action is refetching prices.
 */
export function GatewayTab(): React.JSX.Element {
  return (
    <div className='space-y-4'>
      <GatewayRealmCards />
      <div className='grid gap-4 lg:grid-cols-2'>
        <GatewayHealthPanel />
        <GatewaySettingsSnapshot />
      </div>
      <GatewayRecentRequests />
      <GatewayModelCatalogue />
      <div className='grid gap-4 lg:grid-cols-2'>
        <GatewayVersionPanel />
        <GatewayConsolePanel />
      </div>
    </div>
  )
}
