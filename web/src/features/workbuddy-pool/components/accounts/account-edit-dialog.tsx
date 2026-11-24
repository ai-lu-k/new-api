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
import { Loader2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import type { AccountPatch, HubAccount } from './types'
import type { AccountActions } from './use-account-actions'

type AccountEditDialogProps = {
  account: HubAccount | null
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: AccountActions
}

/** An empty box clears the limit; the hub reads null as "no limit". */
function parseLimit(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

function limitText(value?: number | null): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * Everything about one account the hub lets an operator change. The hub applies
 * one field per call, so only the fields that actually changed are sent.
 */
export function AccountEditDialog(props: AccountEditDialogProps) {
  const { t } = useTranslation()
  const account = props.account
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Edit account')}
      description={account?.nickname ?? ''}
      contentClassName='sm:max-w-lg'
    >
      {account && (
        <EditForm
          key={account.uid}
          account={account}
          actions={props.actions}
          onClose={() => props.onOpenChange(false)}
        />
      )}
    </Dialog>
  )
}

function EditForm(props: {
  account: HubAccount
  actions: AccountActions
  onClose: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const account = props.account
  const [note, setNote] = useState(account.note ?? '')
  const [weight, setWeight] = useState(String(account.weight ?? 1))
  const [tasksEnabled, setTasksEnabled] = useState(
    account.tasksEnabled !== false
  )
  const [models, setModels] = useState(
    (account.disabledModels ?? []).join(', ')
  )
  const [proxySlot, setProxySlot] = useState(account.proxySlot ?? '')
  const [tokenLimit, setTokenLimit] = useState(
    limitText(account.dailyTokenLimit)
  )
  const [creditLimit, setCreditLimit] = useState(
    limitText(account.dailyCreditLimit)
  )
  const [reserve, setReserve] = useState(limitText(account.reserveCredits))
  const [saving, setSaving] = useState(false)

  const patch: AccountPatch = {}
  if (note.trim() !== (account.note ?? '')) patch.note = note.trim()
  const weightValue = Number(weight)
  if (Number.isFinite(weightValue) && weightValue !== (account.weight ?? 1)) {
    patch.weight = weightValue
  }
  if (tasksEnabled !== (account.tasksEnabled !== false)) {
    patch.tasksEnabled = tasksEnabled
  }
  const modelList = models
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
  if (modelList.join(',') !== (account.disabledModels ?? []).join(',')) {
    patch.disabledModels = modelList
  }
  if (proxySlot.trim() !== (account.proxySlot ?? '')) {
    patch.proxySlot = proxySlot.trim()
  }
  if (parseLimit(tokenLimit) !== (account.dailyTokenLimit ?? null)) {
    patch.dailyTokenLimit = parseLimit(tokenLimit)
  }
  if (parseLimit(creditLimit) !== (account.dailyCreditLimit ?? null)) {
    patch.dailyCreditLimit = parseLimit(creditLimit)
  }
  if (parseLimit(reserve) !== (account.reserveCredits ?? null)) {
    patch.reserveCredits = parseLimit(reserve)
  }

  const save = async (): Promise<void> => {
    if (Object.keys(patch).length === 0) {
      props.onClose()
      return
    }
    setSaving(true)
    try {
      await props.actions.setAccount.mutateAsync({
        uid: account.uid,
        patch,
      })
      props.onClose()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <Label htmlFor={`${id}-note`}>{t('Note')}</Label>
        <Input
          id={`${id}-note`}
          value={note}
          maxLength={120}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='space-y-1.5'>
          <Label htmlFor={`${id}-weight`}>{t('Weight')}</Label>
          <Input
            id={`${id}-weight`}
            type='number'
            min={1}
            max={100}
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'A heavier account takes new sessions first. 1 leaves routing alone.'
            )}
          </p>
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor={`${id}-proxy`}>{t('Proxy slot')}</Label>
          <Input
            id={`${id}-proxy`}
            value={proxySlot}
            onChange={(event) => setProxySlot(event.target.value)}
          />
          <p className='text-muted-foreground text-xs'>
            {t('Leave empty to use the default egress.')}
          </p>
        </div>
      </div>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <Label htmlFor={`${id}-tasks`}>{t('Join tasks and check-in')}</Label>
          <p className='text-muted-foreground text-xs'>
            {t('Task traffic is separate from API traffic.')}
          </p>
        </div>
        <Switch
          id={`${id}-tasks`}
          checked={tasksEnabled}
          onCheckedChange={setTasksEnabled}
        />
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor={`${id}-models`}>{t('Disabled models')}</Label>
        <Textarea
          id={`${id}-models`}
          rows={2}
          value={models}
          onChange={(event) => setModels(event.target.value)}
        />
        <p className='text-muted-foreground text-xs'>
          {t(
            'Comma separated. A listed model is never routed to this account.'
          )}
        </p>
      </div>
      <div className='grid gap-4 sm:grid-cols-3'>
        <div className='space-y-1.5'>
          <Label htmlFor={`${id}-tokens`}>{t('Daily token limit')}</Label>
          <Input
            id={`${id}-tokens`}
            inputMode='numeric'
            value={tokenLimit}
            onChange={(event) => setTokenLimit(event.target.value)}
          />
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor={`${id}-credits`}>{t('Daily credit limit')}</Label>
          <Input
            id={`${id}-credits`}
            inputMode='decimal'
            value={creditLimit}
            onChange={(event) => setCreditLimit(event.target.value)}
          />
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor={`${id}-reserve`}>{t('Reserved credits')}</Label>
          <Input
            id={`${id}-reserve`}
            inputMode='decimal'
            value={reserve}
            onChange={(event) => setReserve(event.target.value)}
          />
        </div>
      </div>
      <p className='text-muted-foreground text-xs'>
        {t('An empty limit means no limit.')}
      </p>
      <div className='flex justify-end gap-2'>
        <Button variant='outline' disabled={saving} onClick={props.onClose}>
          {t('Cancel')}
        </Button>
        <Button disabled={saving} onClick={() => void save()}>
          {saving && <Loader2 className='animate-spin' />}
          {saving ? t('Saving...') : t('Save changes')}
        </Button>
      </div>
    </div>
  )
}
