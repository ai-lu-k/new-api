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
import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'
import { pageTitle } from '@/lib/page-title'

/** Keeps the document title on the page being shown. Renders nothing. */
export function DocumentTitle() {
  const { t, i18n } = useTranslation()
  const { status } = useStatus()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const name = typeof status?.system_name === 'string' ? status.system_name : ''
  const homeTitle =
    typeof status?.home_title === 'string' ? status.home_title : ''

  useEffect(() => {
    if (!name) return
    document.title = pageTitle(pathname, { name, homeTitle }, t)
  }, [pathname, name, homeTitle, t, i18n.language])

  return null
}
