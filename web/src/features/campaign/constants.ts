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
import type { CampaignTier } from './types'

/** Tier labels are i18n keys, resolved with `t()` where they are rendered. */
export const TIER_LABEL: Record<CampaignTier, string> = {
  beginner: 'Beginner',
  advanced: 'Advanced',
  hard: 'Hard',
  final: 'Final',
}

/**
 * Tier badges. The board and the dialog both follow the active site theme now,
 * so they share one palette: readable ink on a light surface, glowing on the
 * dark one. (The board used to hardcode the dark variant because the whole
 * event was dark-only.)
 */
const TIER_TONE: Record<CampaignTier, string> = {
  beginner:
    'border-emerald-600/40 bg-emerald-600/10 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-200',
  advanced:
    'border-sky-600/40 bg-sky-600/10 text-sky-800 dark:border-sky-400/40 dark:bg-sky-400/10 dark:text-sky-200',
  hard: 'border-amber-600/40 bg-amber-600/10 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200',
  final:
    'border-rose-600/40 bg-rose-600/10 text-rose-800 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-200',
}

export const TIER_CLASS = TIER_TONE

/** Kept as a separate name for the dialog's call sites. */
export const TIER_CLASS_DIALOG = TIER_TONE

export const EVENT_PATH = '/campaign'
