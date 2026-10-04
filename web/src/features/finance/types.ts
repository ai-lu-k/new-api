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
/**
 * One calendar month of money in and out. Top-ups are money received; gifts
 * are quota given away, at face value; expenses come from the expense ledger.
 */
export type FinanceMonth = {
  /** "2026-10" */
  month: string
  online_topup: number
  manual_topup: number
  gift_manual: number
  gift_checkin: number
  gift_redemption: number
  expenses: number
}
