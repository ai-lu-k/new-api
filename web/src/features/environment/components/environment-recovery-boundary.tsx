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
import { useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { clearAuthentication } from '@/lib/auth-session'
import {
  isEnvironmentRecoveryBlocked,
  subscribeEnvironmentChanges,
  subscribeEnvironmentRecovery,
} from '@/lib/environment'
import { getServerErrorMessage } from '@/lib/server-error-message'

import { useEnvironmentSwitch } from '../use-environment'

export function EnvironmentRecoveryBoundary(props: { children: ReactNode }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const blocked = useSyncExternalStore(
    subscribeEnvironmentRecovery,
    isEnvironmentRecoveryBlocked,
    () => false
  )
  const [error, setError] = useState<string | null>(null)
  const switching = useEnvironmentSwitch((failure) => {
    setError(getServerErrorMessage(failure))
  })

  useEffect(
    () =>
      subscribeEnvironmentChanges(() => {
        void queryClient.cancelQueries()
        queryClient.clear()
        clearAuthentication(false, 'idle')
        window.location.reload()
      }),
    [queryClient]
  )

  useEffect(() => {
    if (!blocked) return
    void queryClient.cancelQueries()
    queryClient.clear()
    clearAuthentication(false, 'idle')
  }, [blocked, queryClient])

  if (!blocked) return props.children
  return (
    <main className='flex min-h-svh items-center justify-center p-6'>
      <ErrorState
        className='w-full max-w-lg'
        title={t('Environment recovery stopped')}
        description={t(
          'The selected environment could not be loaded. Return to production to continue.'
        )}
        action={
          <>
            <Button
              disabled={switching.isSwitching}
              onClick={() => {
                setError(null)
                switching.switchEnvironment.mutate('production')
              }}
            >
              {t('Return to production')}
            </Button>
            {error && (
              <p role='alert' className='text-destructive text-sm'>
                {error}
              </p>
            )}
          </>
        }
      />
    </main>
  )
}
