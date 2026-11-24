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
// ============================================================================
// Home Page Types
// ============================================================================

/**
 * Response from home page content API
 */
export interface HomePageContentResponse {
  success: boolean
  message?: string
  data?: string
}

/**
 * Home page content result from hook
 */
export interface HomePageContentResult {
  content: string
  isLoaded: boolean
  isUrl: boolean
}

/** Money granted on the site, in yuan, with the number of entries it took. */
export type GiftAmount = {
  amount: number
  count: number
}

/**
 * One way gift money is granted. The backend owns the wording: `label` and
 * `note` are rendered as received, and `key` only picks a fallback label.
 */
export type GiftSource = {
  key: string
  label?: string
  amount: number
  count: number
  note?: string
}

/** `GET /api/gift-stats`: what the site handed out today, this week, in 30 days. */
export type GiftStats = {
  today: GiftAmount
  week: GiftAmount
  month: GiftAmount
  sources: GiftSource[]
}

export type GiftStatsResponse = {
  success: boolean
  message?: string
  data?: GiftStats
}

/** One row of a rankings board, narrowed to the field the home page reads. */
export type HomeRankingRow = {
  total_requests?: number
}

/**
 * `/api/rankings` also returns an image board, a decision board and a request
 * count per row. `RankingsSnapshot` in `features/rankings` declares neither, so
 * the home page narrows the same response here instead of widening the shared
 * type from a page-local feature.
 */
export type HomeRankingsSnapshot = {
  models?: HomeRankingRow[]
  image_models?: HomeRankingRow[]
  decision_models?: HomeRankingRow[]
  models_history?: {
    points?: { ts: string; tokens: number }[]
  }
}
