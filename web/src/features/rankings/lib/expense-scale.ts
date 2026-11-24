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

/** Ink on paper, heaviest first. Five steps are enough to keep the expense
 * items apart without turning the block into a colour key. */
const LIGHT_RAMP = ['#111111', '#4a4a4a', '#7d7d7d', '#a8a8a8', '#c9c9c9']
const DARK_RAMP = ['#f2f2f2', '#c4c4c4', '#9a9a9a', '#6e6e6e', '#4a4a4a']

/**
 * One grey per expense item, ordered by how much that item costs in total: the
 * biggest series is the darkest, so the stack reads from the baseline up and a
 * glance says which line dominates the bill. Items past the fifth share the
 * lightest tone — an expense list that long has bigger problems than colour.
 */
export function expenseColorScale(
  totals: Map<string, number>,
  dark = false
): Record<string, string> {
  const ramp = dark ? DARK_RAMP : LIGHT_RAMP
  const ordered = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)

  const scale: Record<string, string> = {}
  for (const [index, name] of ordered.entries()) {
    scale[name] = ramp[Math.min(index, ramp.length - 1)]
  }
  return scale
}
