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
import { createFileRoute, redirect } from '@tanstack/react-router'

import { RelayFunnel } from '@/features/relay-funnel'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

function readTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export const Route = createFileRoute('/_authenticated/relay-funnel/')({
  validateSearch: (search: Record<string, unknown>) => ({
    startTime: readTimestamp(search.startTime),
    endTime: readTimestamp(search.endTime),
    model: typeof search.model === 'string' ? search.model : undefined,
  }),
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()

    if (auth.user?.role !== ROLE.SUPER_ADMIN) {
      throw redirect({
        to: '/403',
      })
    }
  },
  component: RelayFunnelRoute,
})

function RelayFunnelRoute() {
  const { startTime, endTime, model } = Route.useSearch()
  return (
    <RelayFunnel
      initialStart={startTime}
      initialEnd={endTime}
      initialModel={model}
    />
  )
}
