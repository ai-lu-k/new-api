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
 * Event rewards are promised in yuan, not in the site's display currency, so
 * they are formatted as CNY even when the dashboard shows USD or tokens.
 */
export function formatYuan(
  value: number,
  locale?: Intl.LocalesArgument
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * The event schedule is published in Asia/Shanghai. Shifting the instant by
 * eight hours and reading the UTC ISO text avoids depending on the viewer's
 * browser time zone.
 */
export function formatShanghai(unixSeconds: number): string {
  if (!unixSeconds) return '—'
  return new Date((unixSeconds + 8 * 3600) * 1000)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ')
}

export function padNumber(value: number): string {
  return String(Math.max(0, value)).padStart(2, '0')
}
