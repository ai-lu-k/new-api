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
// ----------------------------------------------------------------------------
// Model board metrics
// ----------------------------------------------------------------------------
//
// The text and decision boards count tokens, the image board counts calls.
// Boards rank their own models, so the only difference downstream is this
// metric and the copy of the board.

import type {
  ImageModelRanking,
  ModelKind,
  ModelMetric,
  ModelRanking,
} from '../types'
import { formatCalls, formatTokens } from './format'

/** The board chosen in the `kind` search param; text is the default. */
export function parseModelKind(value: unknown): ModelKind {
  if (value === 'image') return 'image'
  if (value === 'decision') return 'decision'
  return 'text'
}

/** The number a row is ranked by, read from the field of its own board. */
export function metricValue(
  row: ModelRanking | ImageModelRanking,
  metric: ModelMetric
): number {
  if (metric === 'requests') {
    return 'total_requests' in row ? (row.total_requests ?? 0) : 0
  }
  return 'total_tokens' in row ? row.total_tokens : 0
}

/** Format a board value with the same conventions the board's unit uses. */
export function formatMetric(value: number, metric: ModelMetric): string {
  return metric === 'requests' ? formatCalls(value) : formatTokens(value)
}
