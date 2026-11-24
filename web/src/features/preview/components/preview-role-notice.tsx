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

import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

import { usePreviewRole } from '../use-preview-role'

export function PreviewRoleNotice() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const preview = usePreviewRole()
  // The server decides whether the preview is really active; a local flag alone
  // must never show this notice to an ordinary user.
  if (user?.preview_active !== true) return null
  return (
    <div
      role='status'
      className='border-border bg-background/95 fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border px-3 py-1.5 text-sm shadow-lg backdrop-blur'
    >
      <span className='min-w-0 truncate'>
        {t('Viewing as an ordinary user')}
      </span>
      <Button variant='outline' size='sm' onClick={preview.exit}>
        {t('Exit preview')}
      </Button>
    </div>
  )
}
