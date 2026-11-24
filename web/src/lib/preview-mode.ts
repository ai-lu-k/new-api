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
export const PREVIEW_ROLE_HEADER = 'X-Preview-Role'
export const PREVIEW_ROLE_VALUE = 'user'

const PREVIEW_ROLE_STORAGE = 'new-api.preview-role'

export function isPreviewRoleEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return (
      window.localStorage.getItem(PREVIEW_ROLE_STORAGE) === PREVIEW_ROLE_VALUE
    )
  } catch {
    // Private mode can reject storage reads; treat that as preview off.
    return false
  }
}

export function setPreviewRole(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (enabled) {
      window.localStorage.setItem(PREVIEW_ROLE_STORAGE, PREVIEW_ROLE_VALUE)
    } else {
      window.localStorage.removeItem(PREVIEW_ROLE_STORAGE)
    }
  } catch {
    // Without storage the flag cannot persist; the reload leaves no preview.
  }
}

export function getPreviewHeaders(): Record<string, string> {
  if (!isPreviewRoleEnabled()) return {}
  return { [PREVIEW_ROLE_HEADER]: PREVIEW_ROLE_VALUE }
}
