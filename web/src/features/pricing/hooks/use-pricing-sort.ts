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

import {
  DEFAULT_MODEL_SORT,
  type ModelSort,
  type ModelSortKey,
} from '../lib/model-sort'

export type PricingSortState = {
  /** The column the model list is sorted by. */
  sort: ModelSort
  /** Called with a column when its heading is clicked. */
  onSort?: (key: ModelSortKey) => void
}

/**
 * The table's column definitions are created once, so that a heading is not
 * rebuilt (losing a click in progress, and keyboard focus) every time the
 * table renders. Headings read the current sort from this context instead.
 */
export const PricingSortContext = createContext<PricingSortState>({
  sort: DEFAULT_MODEL_SORT,
})

export function usePricingSort(): PricingSortState {
  return useContext(PricingSortContext)
}
