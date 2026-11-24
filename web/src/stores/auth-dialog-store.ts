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
import { create } from 'zustand'

export type AuthDialogMode = 'sign-in' | 'sign-up'

type AuthDialogState = {
  /** Open panel, or null when the dialog is closed. */
  mode: AuthDialogMode | null
  /** Where to go after a successful sign-in; omitted means stay put. */
  redirectTo?: string
  open: (mode: AuthDialogMode, options?: { redirectTo?: string }) => void
  close: () => void
  setMode: (mode: AuthDialogMode) => void
}

/**
 * Auth is a dialog over the page the visitor is already on, so any component
 * can request it without owning the panel state or navigating away.
 */
export const useAuthDialogStore = create<AuthDialogState>()((set) => ({
  mode: null,
  redirectTo: undefined,
  open: (mode, options) =>
    set({ mode, redirectTo: options?.redirectTo ?? undefined }),
  close: () => set({ mode: null, redirectTo: undefined }),
  setMode: (mode) => set({ mode }),
}))

/** Convenience for non-React callers (route guards, request handlers). */
export function openAuthDialog(
  mode: AuthDialogMode,
  options?: { redirectTo?: string }
): void {
  useAuthDialogStore.getState().open(mode, options)
}
