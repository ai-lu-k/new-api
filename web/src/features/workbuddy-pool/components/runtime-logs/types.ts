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

/** One captured runtime log line. */
export type HubLogEntry = {
  id: number
  ts: string
  time: string
  level: string
  tag: string
  msg: string
}

/**
 * `/logs`. `total` counts the entries matching the request after any server
 * filter; `mode` is `memory` (a ring buffer) or `db` (persisted, with `stored`).
 */
export type HubLogPayload = {
  total: number
  logs: HubLogEntry[]
  max_id: number
  mode: string
  stored?: number
}

/** Log levels the hub emits, in severity order. */
export const LOG_LEVELS = ['INFO', 'WARN', 'ERROR'] as const

/**
 * Known module tags, ordered the way an operator scans them. A tag the hub adds
 * later still shows up because the list is extended with whatever arrived.
 */
export const LOG_TAGS = [
  'chat',
  'tasks',
  'scheduler',
  'accounts',
  'agents',
  'pricing',
  'egress',
  'upstream',
  'webtools',
  'catalog',
  'auth',
  'settings',
  'update',
  'usage',
  'system',
] as const

/** Case-insensitive text match over the message, tag and time, as the hub's own panel does. */
export function logMatches(entry: HubLogEntry, text: string): boolean {
  if (text === '') return true
  const haystack = `${entry.msg} ${entry.tag} ${entry.time}`.toLowerCase()
  return haystack.includes(text.toLowerCase())
}
