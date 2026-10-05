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
export const FEEDBACK_STATUS = { OPEN: 1, RESOLVED: 2 } as const

/**
 * A message left for the administrators. An anonymous one has user_id 0 and
 * no username: nothing links it to its author.
 */
export type Feedback = {
  id: number
  user_id: number
  username: string
  content: string
  contact: string
  status: number
  reply: string
  replied_at: number
  created_at: number
}
