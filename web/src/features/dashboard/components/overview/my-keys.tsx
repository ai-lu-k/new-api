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
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { fetchTokenKey } from '@/features/keys/api'
import { QuickImportDialog } from '@/features/keys/components/dialogs/quick-import-dialog'
import { API_KEY_STATUS, API_KEY_STATUSES } from '@/features/keys/constants'
import type { ApiKey } from '@/features/keys/types'
import { handleServerError } from '@/lib/handle-server-error'

const SHOWN = 4

/**
 * The account's first few API keys, each with the quick import that sets a
 * coding client up with it. The rest are on the API keys page.
 */
export function MyKeys(props: {
  keys: ApiKey[]
  total: number
  loading: boolean
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<number | null>(null)
  const [handed, setHanded] = useState<{ name: string; key: string } | null>(
    null
  )

  const open = async (apiKey: ApiKey) => {
    setBusy(apiKey.id)
    try {
      const result = await fetchTokenKey(apiKey.id)
      if (result.success && result.data?.key) {
        setHanded({ name: apiKey.name, key: `sk-${result.data.key}` })
      } else {
        handleServerError(result, t('Failed to load API keys'))
      }
    } catch (error) {
      handleServerError(error, t('Failed to load API keys'))
    } finally {
      setBusy(null)
    }
  }

  let empty = t('No API keys yet')
  if (props.loading) empty = t('Loading...')

  return (
    <section className='bg-card flex flex-col rounded-lg border'>
      <header className='flex items-center justify-between gap-3 border-b px-4 py-3'>
        <h3 className='text-sm font-semibold'>
          {t('API Keys')}
          {props.total > 0 && (
            <span className='text-muted-foreground ms-2 font-normal tabular-nums'>
              {props.total}
            </span>
          )}
        </h3>
        <Link
          to='/keys'
          className='text-muted-foreground hover:text-foreground text-xs'
        >
          {props.total === 0 && !props.loading
            ? t('Create API Key')
            : t('View all')}
        </Link>
      </header>
      {props.keys.length === 0 ? (
        <p className='text-muted-foreground px-4 py-8 text-center text-sm'>
          {empty}
        </p>
      ) : (
        <ul className='divide-y text-sm'>
          {props.keys.slice(0, SHOWN).map((apiKey) => {
            const status = API_KEY_STATUSES[apiKey.status]
            const enabled = apiKey.status === API_KEY_STATUS.ENABLED
            return (
              <li key={apiKey.id} className='flex items-center gap-3 px-4 py-2'>
                <span className='min-w-0 flex-1 truncate font-medium'>
                  {apiKey.name}
                </span>
                {status && !enabled && (
                  <StatusBadge
                    label={t(status.label)}
                    variant={status.variant}
                    copyable={false}
                  />
                )}
                <Button
                  variant='outline'
                  size='sm'
                  className='h-7 shrink-0'
                  disabled={!enabled || busy !== null}
                  onClick={() => open(apiKey)}
                >
                  {t('Quick import')}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <QuickImportDialog
        open={handed !== null}
        onOpenChange={(isOpen) => !isOpen && setHanded(null)}
        keyName={handed?.name ?? ''}
        tokenKey={handed?.key ?? ''}
      />
    </section>
  )
}
