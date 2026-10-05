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
import { EXCLUDED_GROUPS, FILTER_ALL, QUOTA_TYPE_VALUES } from '../constants'
import type { PricingModel } from '../types'

// ----------------------------------------------------------------------------
// Model Helper Utilities
// ----------------------------------------------------------------------------

/**
 * Get available groups for a model
 */
export function getAvailableGroups(
  model: PricingModel,
  usableGroup: Record<string, { desc: string; ratio: number }>
): string[] {
  const modelEnableGroups = Array.isArray(model.enable_groups)
    ? model.enable_groups
    : []

  return Object.keys(usableGroup)
    .filter((g) => !EXCLUDED_GROUPS.includes(g))
    .filter((g) => modelEnableGroups.includes(g))
}

/**
 * Whether visitors can choose between groups. With a single group there is
 * nothing to choose, and groups are not shown at all.
 */
export function hasSelectableGroups(
  usableGroup: Record<string, unknown>
): boolean {
  return (
    Object.keys(usableGroup).filter((g) => !EXCLUDED_GROUPS.includes(g))
      .length > 1
  )
}

/**
 * Group ratios as they apply to one model: a price tier in the model name
 * multiplies every group's ratio.
 */
export function scaleGroupRatios(
  groupRatio: Record<string, number>,
  multiplier: number | undefined
): Record<string, number> {
  if (multiplier === undefined || multiplier === 1) return groupRatio
  return Object.fromEntries(
    Object.entries(groupRatio).map(([group, ratio]) => [
      group,
      ratio * multiplier,
    ])
  )
}

/**
 * How far below the official price a price tier sells, or null when it does
 * not: `percent` off and the same in tenths ("2.5 折" for 0.25).
 */
export function priceTierDiscount(
  multiplier: number | undefined
): { percent: number; tenths: number } | null {
  if (
    multiplier === undefined ||
    !Number.isFinite(multiplier) ||
    multiplier < 0 ||
    multiplier >= 1
  ) {
    return null
  }
  return {
    percent: Number(((1 - multiplier) * 100).toFixed(2)),
    tenths: Number((multiplier * 10).toFixed(4)),
  }
}

/**
 * Read a configured group ratio while preserving valid zero ratios.
 */
export function getConfiguredGroupRatio(
  groupRatio: Record<string, number>,
  group: string
): number {
  const ratio = groupRatio[group]
  return typeof ratio === 'number' && Number.isFinite(ratio) ? ratio : 1
}

/**
 * Resolve the group ratio used by model square summary prices.
 *
 * When no specific group is selected, the model square shows the best price
 * available to the viewer. When a group filter is active, it shows that
 * group's price instead.
 */
export function getDisplayGroupRatio(
  model: PricingModel,
  selectedGroup?: string
): number {
  const modelEnableGroups = Array.isArray(model.enable_groups)
    ? model.enable_groups
    : []
  const groupRatio = model.group_ratio || {}

  if (
    selectedGroup &&
    selectedGroup !== FILTER_ALL &&
    modelEnableGroups.includes(selectedGroup)
  ) {
    return getConfiguredGroupRatio(groupRatio, selectedGroup)
  }

  if (modelEnableGroups.length === 0) {
    return 1
  }

  let minRatio = Number.POSITIVE_INFINITY

  for (const group of modelEnableGroups) {
    const ratio = groupRatio[group]
    if (
      typeof ratio === 'number' &&
      Number.isFinite(ratio) &&
      ratio < minRatio
    ) {
      minRatio = ratio
    }
  }

  return minRatio === Number.POSITIVE_INFINITY ? 1 : minRatio
}

/**
 * Replace model placeholder in endpoint path
 */
export function replaceModelInPath(path: string, modelName: string): string {
  return path.replaceAll('{model}', modelName)
}

/**
 * Check if model is token-based pricing
 */
export function isTokenBasedModel(model: PricingModel): boolean {
  return model.quota_type === QUOTA_TYPE_VALUES.TOKEN
}

/**
 * What is left of a limited-time offer, in the two largest units that say
 * something: days and hours, hours and minutes, or minutes. Null once over.
 */
export function promoTimeLeft(
  endsAt: number,
  nowMs: number
): { days: number; hours: number; minutes: number } | null {
  const seconds = Math.floor(endsAt - nowMs / 1000)
  if (!(seconds > 0)) return null
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    // Round the last minute up, so that "0 minutes left" never shows.
    minutes: Math.max(1, Math.ceil((seconds % 3600) / 60)),
  }
}
