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

// The four administrator sections share one page and one URL parameter, so the
// address bar, back/forward and a direct visit always agree on the open section.
export const TOKEN_PLAN_TABS = [
  'overview',
  'users',
  'trend',
  'coupons',
] as const

export type TokenPlanTab = (typeof TOKEN_PLAN_TABS)[number]
