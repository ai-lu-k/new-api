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
import { createJSONStorage, persist } from 'zustand/middleware'

interface TopupCampaignState {
  seen: Record<string, boolean>
  markSeen: (key: string) => void
}

// A campaign/account pair belongs only to this browser. No server acknowledgement
// is sent, so another browser or device can announce the same campaign again.
export const useTopupCampaignStore = create<TopupCampaignState>()(
  persist(
    (set) => ({
      seen: {},
      markSeen: (key) =>
        set((state) => ({ seen: { ...state.seen, [key]: true } })),
    }),
    {
      name: 'topup-campaign:v1',
      partialize: (state) => ({ seen: state.seen }),
      storage: createJSONStorage(() => ({
        getItem: (key) => {
          try {
            return localStorage.getItem(key)
          } catch {
            return null
          }
        },
        setItem: (key, value) => {
          try {
            localStorage.setItem(key, value)
          } catch {
            /* Keep this tab's acknowledgement in memory. */
          }
        },
        removeItem: (key) => {
          try {
            localStorage.removeItem(key)
          } catch {
            /* Storage may be disabled. */
          }
        },
      })),
    }
  )
)
