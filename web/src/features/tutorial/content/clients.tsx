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
import { useTranslation } from 'react-i18next'

import { QuickStart } from '@/features/guide/components/quick-start'

/**
 * 03 — the quick start, read as part of the tutorial: the client tabs DSH,
 * Claude Code, Codex and the API sit where the walkthrough leaves off.
 */
export function ClientsSection() {
  const { t } = useTranslation()

  return (
    <>
      <p>
        {t(
          'Every client above the API is set up the same way: pick it, copy the one-time setup, and it writes the address and the key for you.'
        )}
      </p>
      <QuickStart embedded />
    </>
  )
}
