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
import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

import { usePreviewRole } from '../use-preview-role'

export function PreviewRoleMenuItem() {
  const { t } = useTranslation()
  const preview = usePreviewRole()
  if (!preview.visible) return null
  return (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault()
        if (preview.enabled) preview.exit()
        else preview.enter()
      }}
    >
      {preview.enabled ? (
        <EyeOff aria-hidden className='size-4' />
      ) : (
        <Eye aria-hidden className='size-4' />
      )}
      {preview.enabled ? t('Exit preview') : t('Preview as user')}
    </DropdownMenuItem>
  )
}
