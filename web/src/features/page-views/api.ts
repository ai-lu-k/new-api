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
import { api } from '@/lib/api'

import type { PageViewTotalsResponse } from './types'

/** Count one visit to a page. Failures are the caller's to swallow. */
export async function recordPageView(page: string): Promise<void> {
  await api.post('/api/page_views/', { page }, { skipErrorHandler: true })
}

/** Site-wide visit totals for the last rolling week, most visited first. */
export async function getPopularPageViews(): Promise<PageViewTotalsResponse> {
  const res = await api.get('/api/page_views/popular', {
    skipErrorHandler: true,
  })
  return res.data
}
