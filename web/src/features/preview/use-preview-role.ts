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
import { isPreviewRoleEnabled, setPreviewRole } from '@/lib/preview-mode'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export function usePreviewRole() {
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = (user?.role ?? 0) >= ROLE.ADMIN
  const previewActive = user?.preview_active === true
  // The server demotes an administrator to role 1 while previewing, so the
  // stored flag keeps the exit action reachable inside that demoted session.
  const enabled = isPreviewRoleEnabled()
  const visible = isAdmin || enabled

  const enter = () => {
    setPreviewRole(true)
    window.location.reload()
  }
  const exit = () => {
    setPreviewRole(false)
    window.location.reload()
  }

  return { previewActive, visible, enabled, enter, exit }
}
