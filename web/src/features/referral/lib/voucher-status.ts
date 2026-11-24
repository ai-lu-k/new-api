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
import type { StatusVariant } from '@/components/status-badge'

export interface VoucherStatusDisplay {
  labelKey: string
  variant: StatusVariant
}

/**
 * Lifecycle of an invite voucher. Both the user reward history and the
 * administrator table render from this map so a state never shows a different
 * label or colour depending on where it is displayed.
 */
const VOUCHER_STATUS_DISPLAY: Record<string, VoucherStatusDisplay> = {
  unopened: { labelKey: 'Unopened', variant: 'success' },
  opened: { labelKey: 'Opened', variant: 'neutral' },
  expired: { labelKey: 'Expired', variant: 'warning' },
  legacy: { labelKey: 'Legacy coupon', variant: 'neutral' },
}

const PENDING_VOUCHER_DISPLAY: VoucherStatusDisplay = {
  labelKey: 'Pending',
  variant: 'neutral',
}

export function getVoucherStatusDisplay(status: string): VoucherStatusDisplay {
  return VOUCHER_STATUS_DISPLAY[status] ?? PENDING_VOUCHER_DISPLAY
}
