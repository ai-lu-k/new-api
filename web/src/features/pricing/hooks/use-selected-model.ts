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
import { createContext, useContext } from 'react'

/**
 * The model whose details drawer is open.
 *
 * The card that opened it steps aside so the drawer can hold the shared name
 * (see `modelSharedName()`); nothing else needs the name, so it travels through
 * context instead of through every list component.
 */
export const SelectedModelContext = createContext<string | null>(null)

export function useSelectedModelName(): string | null {
  return useContext(SelectedModelContext)
}
