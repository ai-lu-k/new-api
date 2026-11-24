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
import { useSharedName } from '@/components/motion/use-shared-name'
import { cn } from '@/lib/utils'

import { apiKeySharedName } from '../lib/key-shared-name'
import type { ApiKey } from '../types'
import { useApiKeys } from './api-keys-provider'

type ApiKeySharedNameProps = {
  apiKey: ApiKey
  className?: string
}

/**
 * The key's name, in the list row **or** in the edit drawer — never both.
 *
 * Whichever side is on screen holds `key-<id>`, so opening the drawer morphs
 * the name from the row into the drawer title instead of the list blinking out
 * and the drawer blinking in. The row steps aside while its drawer is open
 * (a name may only exist once per snapshot).
 */
export function ApiKeySharedName(props: ApiKeySharedNameProps) {
  const { open, currentRow } = useApiKeys()
  const detailOpen = open === 'update' && currentRow?.id === props.apiKey.id
  const shared = useSharedName(
    detailOpen ? undefined : apiKeySharedName(props.apiKey.id)
  )

  return (
    <span className={cn('font-medium', props.className)} {...shared}>
      {props.apiKey.name}
    </span>
  )
}
