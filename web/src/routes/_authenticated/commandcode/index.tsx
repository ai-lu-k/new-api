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

import {
  CommandCodePool,
  type CommandCodePoolTab,
} from '@/features/commandcode-pool'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

const TABS = new Set<CommandCodePoolTab>(['gateway', 'accounts', 'settings'])

export const Route = createFileRoute('/_authenticated/commandcode/')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: TABS.has(search.tab as CommandCodePoolTab)
      ? (search.tab as CommandCodePoolTab)
      : undefined,
  }),
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()

    if (auth.user?.role !== ROLE.SUPER_ADMIN) {
      throw redirect({
        to: '/403',
      })
    }
  },
  component: CommandCodeRoute,
})

function CommandCodeRoute() {
  const { tab } = Route.useSearch()
  return <CommandCodePool tab={tab} />
}
