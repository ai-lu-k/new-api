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

import {
  SectionPanel,
  type SectionPanelStatus,
} from '@/components/section-panel'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { fetchTokenKey } from '@/features/keys/api'
import { QuickImportDialog } from '@/features/keys/components/dialogs/quick-import-dialog'
import { API_KEY_STATUS, API_KEY_STATUSES } from '@/features/keys/constants'
import type { ApiKey } from '@/features/keys/types'
import { handleServerError } from '@/lib/handle-server-error'
import { textActionClass } from '@/lib/text-action'
import { cn } from '@/lib/utils'

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
  const [handed, setHanded] = useState<{
    id: number
    name: string
    key: string
  } | null>(null)

  const open = async (apiKey: ApiKey) => {
    setBusy(apiKey.id)
    try {
      const result = await fetchTokenKey(apiKey.id)
      if (result.success && result.data?.key) {
        setHanded({
          id: apiKey.id,
          name: apiKey.name,
          key: `sk-${result.data.key}`,
        })
      } else {
        handleServerError(result, t('Failed to load API keys'))
      }
    } catch (error) {
      handleServerError(error, t('Failed to load API keys'))
    } finally {
      setBusy(null)
    }
  }

  let status: SectionPanelStatus = 'ready'
  if (props.loading) status = 'loading'
  else if (props.keys.length === 0) status = 'empty'

  return (
    <>
      <SectionPanel
        title={
          <>
            {t('API Keys')}
            {props.total > 0 && (
              <span className='text-muted-foreground ms-2 font-normal tabular-nums'>
                {props.total}
              </span>
            )}
          </>
        }
        actions={
          <Link
            to='/keys'
            className={cn(
              'text-muted-foreground hover:text-foreground text-xs',
              textActionClass
            )}
          >
            {props.total === 0 && !props.loading
              ? t('Create API Key')
              : t('View all')}
          </Link>
        }
        status={status}
        emptyMessage={t('No API keys yet')}
      >
        <ul className='divide-y text-sm'>
          {props.keys.slice(0, SHOWN).map((apiKey) => {
            const keyStatus = API_KEY_STATUSES[apiKey.status]
            const enabled = apiKey.status === API_KEY_STATUS.ENABLED
            return (
              <li key={apiKey.id} className='flex items-center gap-3 py-3'>
                <span className='min-w-0 flex-1 truncate font-medium'>
                  {apiKey.name}
                </span>
                {keyStatus && !enabled && (
                  <StatusBadge
                    label={t(keyStatus.label)}
                    variant={keyStatus.variant}
                    copyable={false}
                  />
                )}
                <Button
                  variant='outline'
                  size='sm'
                  className='h-9 shrink-0'
                  disabled={!enabled || busy !== null}
                  onClick={() => open(apiKey)}
                >
                  {t('Quick import')}
                </Button>
              </li>
            )
          })}
        </ul>
      </SectionPanel>
      <QuickImportDialog
        open={handed !== null}
        onOpenChange={(isOpen) => !isOpen && setHanded(null)}
        keyId={handed?.id ?? 0}
        keyName={handed?.name ?? ''}
        tokenKey={handed?.key ?? ''}
      />
    </>
  )
}
