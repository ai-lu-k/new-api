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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'

type AnalyticsQueryStateProps = {
  isPending: boolean
  isError: boolean
  errorMessage?: string
  onRetry: () => void
  children: ReactNode
}

/**
 * The loading and failure states every Analytics section shares, so a hub call
 * that fails shows up inside its own card instead of blanking the tab.
 */
export function AnalyticsQueryState(
  props: AnalyticsQueryStateProps
): ReactNode {
  const { t } = useTranslation()

  if (props.isPending) {
    return <LoadingState size='sm' className='min-h-24' />
  }

  if (props.isError) {
    return (
      <ErrorState
        compact
        onRetry={props.onRetry}
        title={t('The hub did not answer this section')}
        description={props.errorMessage}
      />
    )
  }

  return props.children
}
