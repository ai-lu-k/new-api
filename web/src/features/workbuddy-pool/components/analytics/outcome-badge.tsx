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

import { Badge } from '@/components/ui/badge'

const OUTCOME_LABELS: Record<string, string> = {
  completed: 'Completed',
  client_aborted: 'Client aborted',
  upstream_aborted: 'Upstream aborted',
  failed: 'Failed',
}

const OUTCOME_VARIANTS: Record<
  string,
  'secondary' | 'destructive' | 'warning' | 'outline'
> = {
  completed: 'secondary',
  client_aborted: 'outline',
  upstream_aborted: 'warning',
  failed: 'destructive',
}

/**
 * How a request ended. A client cancellation is shown apart from a real
 * failure, because the gateway did nothing wrong in that case.
 */
export function OutcomeBadge(props: { outcome: string }): React.JSX.Element {
  const { t } = useTranslation()
  const label = OUTCOME_LABELS[props.outcome] ?? props.outcome
  return (
    <Badge variant={OUTCOME_VARIANTS[props.outcome] ?? 'outline'}>
      {t(label)}
    </Badge>
  )
}
