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
import { useStatus } from '@/hooks/use-status'

export type SiteEndpoints = {
  /** The address a reader opens in a browser, without a trailing slash. */
  site: string
  /** The OpenAI-compatible root every example is written against. */
  base: string
}

/**
 * The two addresses the tutorial quotes. They come from the instance's own
 * `server_address` so a copied snippet points at the host serving this page;
 * an unconfigured instance falls back to wherever the page is open.
 */
export function useSiteEndpoints(): SiteEndpoints {
  const { status } = useStatus()
  const configured =
    typeof status?.server_address === 'string' ? status.server_address : ''
  const site = (configured || window.location.origin).replace(/\/+$/, '')
  return { site, base: `${site}/v1` }
}
