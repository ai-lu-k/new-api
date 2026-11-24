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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import { useAddAccount } from './use-add-account'

type AddAccountDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const REALMS = [
  { value: 'cn', label: 'China' },
  { value: 'intl', label: 'International' },
]

/**
 * Two ways into the pool. Import takes the JSON document the hub itself exports
 * (one account or an array), and the sign-in hand-off runs the hub's own OAuth
 * flow: the operator opens the link, finishes it in a browser, and the dialog
 * polls until the credential lands.
 */
export function AddAccountDialog(props: AddAccountDialogProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('import')
  const [realm, setRealm] = useState('cn')
  const [text, setText] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [parseError, setParseError] = useState('')
  const add = useAddAccount()

  const parse = (): unknown => {
    try {
      const doc = JSON.parse(text)
      setParseError('')
      return doc
    } catch {
      setParseError(t('This is not valid JSON'))
      return null
    }
  }

  const handleImport = (): void => {
    const doc = parse()
    if (doc === null) return
    add.commit.mutate({ data: doc, overwrite })
  }

  const handleClose = (open: boolean): void => {
    if (!open) {
      add.reset()
      setText('')
      setParseError('')
    }
    props.onOpenChange(open)
  }

  return (
    <Dialog open={props.open} onOpenChange={handleClose}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Add a WorkBuddy account')}</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value='import'>{t('Import credentials')}</TabsTrigger>
            <TabsTrigger value='signin'>{t('Sign in')}</TabsTrigger>
          </TabsList>
          <TabsContent value='import' className='space-y-3'>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Paste an account document exported from this pool, or a single credential object. Importing an account that already exists updates it.'
              )}
            </p>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder='{"accounts": [ … ]}'
              className='min-h-56 font-mono text-xs'
              aria-label={t('Account JSON')}
            />
            {parseError && (
              <p className='text-destructive text-xs'>{parseError}</p>
            )}
            <Label className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                checked={overwrite}
                onChange={(event) => setOverwrite(event.target.checked)}
                className='size-4'
              />
              {t('Overwrite accounts that already exist')}
            </Label>
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={text.trim() === '' || add.preview.isPending}
                onClick={() => {
                  const doc = parse()
                  if (doc !== null) add.preview.mutate(doc)
                }}
              >
                {add.preview.isPending && <Loader2 className='animate-spin' />}
                {t('Preview')}
              </Button>
              <Button
                size='sm'
                disabled={text.trim() === '' || add.commit.isPending}
                onClick={handleImport}
              >
                {add.commit.isPending && <Loader2 className='animate-spin' />}
                {t('Import')}
              </Button>
            </div>
            {add.preview.data?.result && (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Preview: {{added}} new, {{updated}} updated, {{skipped}} skipped, {{invalid}} invalid',
                  {
                    added: add.preview.data.result.added?.length ?? 0,
                    updated: add.preview.data.result.updated?.length ?? 0,
                    skipped: add.preview.data.result.skipped?.length ?? 0,
                    invalid: add.preview.data.result.invalid?.length ?? 0,
                  }
                )}
              </p>
            )}
          </TabsContent>
          <TabsContent value='signin' className='space-y-3'>
            <p className='text-muted-foreground text-sm'>
              {t(
                'The gateway opens the upstream sign-in page. Finish it in your browser; this dialog picks the account up as soon as the gateway has the credential.'
              )}
            </p>
            <div className='flex flex-wrap items-center gap-2'>
              {REALMS.map((option) => (
                <Button
                  key={option.value}
                  size='sm'
                  variant={realm === option.value ? 'default' : 'outline'}
                  aria-pressed={realm === option.value}
                  disabled={add.start.isPending || add.loginState !== null}
                  onClick={() => setRealm(option.value)}
                >
                  {t(option.label)}
                </Button>
              ))}
            </div>
            {add.start.data?.authUrl && (
              <a
                href={add.start.data.authUrl}
                target='_blank'
                rel='noreferrer'
                className='text-primary block truncate text-xs underline-offset-2 hover:underline'
              >
                {add.start.data.authUrl}
              </a>
            )}
            {add.loginState && (
              <p className='text-muted-foreground text-xs'>
                {add.signedIn
                  ? t('Signed in as {{nickname}}', { nickname: add.signedIn })
                  : t('Waiting for the sign-in to finish…')}
              </p>
            )}
            <div className='flex justify-end gap-2'>
              {add.loginState && (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => add.cancel.mutate(add.loginState ?? '')}
                >
                  {t('Cancel')}
                </Button>
              )}
              <Button
                size='sm'
                disabled={add.start.isPending || add.loginState !== null}
                onClick={() => add.start.mutate(realm)}
              >
                {add.start.isPending && <Loader2 className='animate-spin' />}
                {t('Start sign-in')}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button
            variant='outline'
            size='sm'
            onClick={() => handleClose(false)}
          >
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
