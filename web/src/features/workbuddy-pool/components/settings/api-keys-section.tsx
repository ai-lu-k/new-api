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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeySquare, Plus, Save } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'

import { hubGet, hubPost } from '../../api'
import { ApiKeyRow } from './api-key-row'
import { generateKey } from './lib'
import type { HubApiKey, HubSettings } from './types'

/**
 * The API keys clients present to the gateway. Each row binds one key to an
 * egress realm. The list is saved as a whole, exactly as the hub expects, with
 * the ids the operator removed named separately so no other key is retired.
 */
export function ApiKeysSection(props: { settings: HubSettings }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draftRows, setDraftRows] = useState<HubApiKey[] | null>(null)
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [revealing, setRevealing] = useState<HubApiKey | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string>>({})

  const rows = draftRows ?? props.settings.api_keys
  const dirty = draftRows !== null || deletedIds.length > 0

  function editRows(next: HubApiKey[]): void {
    setDraftRows(next.map((row) => ({ ...row })))
  }

  function patchRow(index: number, patch: Partial<HubApiKey>): void {
    const next = rows.map((row) => ({ ...row }))
    next[index] = { ...next[index], ...patch }
    setDraftRows(next)
  }

  const reveal = useMutation({
    mutationFn: async (row: HubApiKey) => {
      const response = await hubGet<{ key?: string }>('settings.reveal', {
        id: row.id,
      })
      if (!response.success) {
        throw new Error(response.message || t('Unable to reveal this key.'))
      }
      return { id: row.id ?? '', key: response.data?.key ?? '' }
    },
    onSuccess: (result) => {
      setRevealing(null)
      if (!result.id) return
      setRevealed({ ...revealed, [result.id]: result.key })
      toast.success(t('Key revealed. It stays on screen until you reload.'))
    },
    onError: (error: Error) => {
      setRevealing(null)
      toast.error(error.message)
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const payload = rows
        .filter((row) => !row.id || !deletedIds.includes(row.id))
        .map((row) => ({
          id: row.id || '',
          name: row.name || '',
          realm: row.realm || '',
          models: row.models || [],
          accounts: row.accounts || [],
          concurrency_limit: Number(row.concurrency_limit ?? 0) || 0,
          enabled: row.enabled !== false,
          key: (row.key || '').trim(),
        }))
      const response = await hubPost<{ ok?: boolean }>('settings.save', {
        api_keys: payload,
        deleted_api_key_ids: deletedIds,
      })
      if (!response.success) {
        throw new Error(response.message || t('Unable to save the API keys.'))
      }
      return payload.length
    },
    onSuccess: async (count) => {
      setDraftRows(null)
      setDeletedIds([])
      setRevealed({})
      toast.success(t('Saved {{count}} API keys.', { count }))
      await queryClient.invalidateQueries({
        queryKey: ['workbuddy', 'settings'],
      })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const deletedKeys = props.settings.deleted_api_keys

  return (
    <TitledCard
      icon={<KeySquare />}
      title={t('API keys')}
      description={t(
        'Keys clients use to reach the gateway. Each one can be pinned to a single egress realm.'
      )}
      action={
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() =>
            editRows([
              ...rows,
              {
                id: '',
                name: '',
                realm: '',
                enabled: true,
                key: generateKey(),
              },
            ])
          }
        >
          <Plus className='mr-1 size-4' />
          {t('Add key')}
        </Button>
      }
    >
      <div className='space-y-3'>
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <span className='text-muted-foreground'>
            {t('Key the gateway accepts today')}
          </span>
          <code className='bg-muted rounded px-2 py-0.5 font-mono text-xs'>
            {props.settings.api_key_masked || t('Not set')}
          </code>
          <Badge
            variant={props.settings.auth_required ? 'secondary' : 'warning'}
          >
            {props.settings.auth_required
              ? t('Authentication required')
              : t('Open to anyone')}
          </Badge>
        </div>

        {rows.length === 0 && (
          <p className='text-muted-foreground text-sm'>
            {t('No per-key bindings yet. Clients use the key above.')}
          </p>
        )}

        {rows.map((row, index) => (
          <ApiKeyRow
            key={row.id || `new-${index}`}
            row={row}
            revealed={row.id ? revealed[row.id] : undefined}
            onPatch={(patch) => patchRow(index, patch)}
            onReveal={() => setRevealing(row)}
            onDelete={() => setDeleting(index)}
          />
        ))}

        <div className='flex flex-wrap items-center justify-between gap-2'>
          <p className='text-muted-foreground text-xs'>
            {dirty
              ? t('Unsaved key changes.')
              : t('Keys are saved with their model and account allow-lists.')}
          </p>
          <Button
            type='button'
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
          >
            <Save className='mr-1 size-4' />
            {t('Save API keys')}
          </Button>
        </div>

        {deletedKeys.length > 0 && (
          <div className='text-muted-foreground space-y-1 text-xs'>
            <p className='font-medium'>{t('Deleted keys')}</p>
            {deletedKeys.map((key) => (
              <p key={key.id}>
                {key.name || t('Unnamed')} · {key.deleted_at || ''} ·{' '}
                <code className='font-mono'>{key.id}</code>
              </p>
            ))}
            <p>
              {t(
                'Deleted keys keep their name so historical usage still resolves.'
              )}
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={revealing !== null}
        onOpenChange={(open) => {
          if (!open) setRevealing(null)
        }}
        title={t('Reveal this API key?')}
        desc={t(
          'The plaintext key will be shown on screen. Anyone who can see this page can then use it.'
        )}
        confirmText={t('Reveal')}
        isLoading={reveal.isPending}
        handleConfirm={() => {
          if (revealing) reveal.mutate(revealing)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('Delete this API key?')}
        desc={t(
          'The key value is erased and cannot be recovered. Its historical usage keeps the name.'
        )}
        destructive
        confirmText={t('Delete')}
        handleConfirm={() => {
          if (deleting === null) return
          const row = rows[deleting]
          if (row.id) setDeletedIds([...deletedIds, row.id])
          editRows(rows.filter((_, index) => index !== deleting))
          setDeleting(null)
        }}
      />
    </TitledCard>
  )
}
