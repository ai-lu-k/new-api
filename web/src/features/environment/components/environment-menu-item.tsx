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
import { FlaskConical, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { getAppEnvironment, getEnvironmentVersion } from '@/lib/environment'

import { useEnvironment } from '../use-environment'

export function EnvironmentMenuItem() {
  const { t } = useTranslation()
  const environment = useEnvironment()
  if (!environment.isAdmin || environment.status.data?.enabled !== true) {
    return null
  }
  const isStaging = getAppEnvironment() === 'staging'
  const pending = environment.isSwitching
  const version = getEnvironmentVersion()
  return (
    <>
      <DropdownMenuSeparator />
      <div className='text-muted-foreground px-1.5 py-1 text-xs'>
        {isStaging ? t('Test environment') : t('Production environment')}
        {isStaging && version && (
          <div className='mt-1 truncate text-[10px]' title={version}>
            {version}
          </div>
        )}
      </div>
      <DropdownMenuItem
        disabled={pending}
        onSelect={(event) => {
          event.preventDefault()
          if (!pending) {
            environment.switchEnvironment.mutate(
              isStaging ? 'production' : 'staging'
            )
          }
        }}
      >
        {pending ? (
          <LoaderCircle aria-hidden className='size-4 animate-spin' />
        ) : (
          <FlaskConical aria-hidden className='size-4' />
        )}
        {isStaging
          ? t('Return to production')
          : t('Switch to test environment')}
      </DropdownMenuItem>
    </>
  )
}
