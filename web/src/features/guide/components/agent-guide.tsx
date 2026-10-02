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
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { TitledCard } from '@/components/ui/titled-card'
import { CCSwitchFields } from '@/features/keys/components/dialogs/cc-switch-dialog'
import { buildCCSwitchURL } from '@/features/keys/lib/cc-switch'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { getSetupCatalog } from '../api'
import {
  agentModels,
  buildAgentConfig,
  pickAgentModel,
} from '../lib/agent-configs'
import { ensureAgentKey } from '../lib/agent-key'
import type { AgentClient } from '../lib/agents'

const CC_SWITCH_DOWNLOAD = 'https://github.com/farion1231/cc-switch/releases'
const KEY_PLACEHOLDER = 'YOUR_API_KEY'
// The primary model is chosen once for the whole guide, above the form.
const CHOSEN_ABOVE = ['model'] as const

/** Enough of a key to recognise it by, never enough to use it. */
function maskKey(key: string): string {
  return `${key.slice(0, 5)}…${key.slice(-4)}`
}

function Snippet(props: { code: string; copy: string }) {
  return (
    <div className='flex items-start gap-2'>
      <pre className='bg-muted/60 border-border max-h-80 min-w-0 flex-1 overflow-auto rounded-md border p-3 text-xs leading-relaxed'>
        <code className='font-mono whitespace-pre'>{props.code}</code>
      </pre>
      <CopyButton value={props.copy} variant='outline' />
    </div>
  )
}

/**
 * Getting started with one coding agent. There are two ways in: the CC Switch
 * form hands the gateway over as a provider, or the user pastes the
 * configuration by hand. Both use a key the site prepares for this client.
 */
export function AgentGuide(props: { client: AgentClient }) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const here = useLocation({ select: (location) => location.href })
  const { copyToClipboard } = useCopyToClipboard()
  const modelFieldId = useId()
  const [chosenModel, setChosenModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  // What the user typed into the CC Switch form; null until they touch the name.
  const [providerName, setProviderName] = useState<string | null>(null)
  const [otherModels, setOtherModels] = useState<Record<string, string>>({})

  const catalog = useQuery({
    queryKey: ['dsh-setup-models', userId ?? null],
    queryFn: async () => requireServerSuccess(await getSetupCatalog()).data,
    staleTime: 5 * 60 * 1000,
  })

  const prepareKey = useMutation({
    mutationFn: () => ensureAgentKey(props.client.name),
    onSuccess: setApiKey,
    onError: (error) =>
      handleServerError(error, t('Failed to prepare the API key')),
  })

  const client = props.client
  const models = catalog.data?.models
  const offered = useMemo(
    () => agentModels(client, models ?? []),
    [client, models]
  )
  const offeredIds = useMemo(() => offered.map((item) => item.id), [offered])

  if (catalog.isPending) {
    return <p className='text-muted-foreground text-sm'>{t('Loading...')}</p>
  }

  if (offered.length === 0) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t('This site has no model that {{client}} can use yet.', {
          client: client.name,
        })}
      </p>
    )
  }

  const site = {
    name: typeof status?.system_name === 'string' ? status.system_name : 'LUK',
    address:
      typeof status?.server_address === 'string' && status.server_address
        ? status.server_address
        : window.location.origin,
  }
  const model =
    chosenModel ||
    pickAgentModel(client, offered, catalog.data?.default_model ?? '')
  const signedIn = userId !== undefined
  const canPrepareKey = signedIn && Boolean(catalog.data?.auto_group)

  // A failed attempt has already been reported by the mutation's onError.
  const getKey = async () =>
    apiKey || (await prepareKey.mutateAsync().catch(() => ''))

  const name = providerName ?? site.name
  const importToCcSwitch = async () => {
    const key = await getKey()
    if (!key) return
    window.open(
      buildCCSwitchURL(
        client.ccSwitchApp,
        name.trim() || site.name,
        { ...otherModels, model },
        key
      ),
      '_self'
    )
  }

  const copyKey = async () => {
    const key = await getKey()
    if (key) await copyToClipboard(key)
  }

  const configFor = (key: string) =>
    buildAgentConfig({ client, site, apiKey: key, model, models: offered })
  const shown = configFor(apiKey ? maskKey(apiKey) : KEY_PLACEHOLDER)
  const copied = configFor(apiKey || KEY_PLACEHOLDER)

  const spinner = prepareKey.isPending && (
    <Loader2 className='animate-spin' aria-hidden='true' />
  )

  let ccSwitchBody = (
    <div className='flex flex-wrap items-center gap-3'>
      <p className='text-muted-foreground min-w-0 flex-1 text-sm'>
        {t('Sign in to import with your own API key.')}
      </p>
      <Button render={<Link to='/sign-in' search={{ redirect: here }} />}>
        {t('Sign in')}
      </Button>
    </div>
  )
  if (signedIn && !canPrepareKey) {
    ccSwitchBody = (
      <div className='flex flex-wrap items-center gap-3'>
        <p className='text-muted-foreground min-w-0 flex-1 text-sm'>
          {t(
            'Create an API key in the console first. Its row there has a CC Switch button that does this import.'
          )}
        </p>
        <Button variant='outline' render={<Link to='/keys' />}>
          {t('API Keys')}
        </Button>
      </div>
    )
  }
  if (canPrepareKey) {
    ccSwitchBody = (
      <div className='space-y-4'>
        <div className='max-w-md space-y-4'>
          <CCSwitchFields
            app={client.ccSwitchApp}
            name={name}
            onNameChange={setProviderName}
            models={otherModels}
            onModelChange={(field, value) =>
              setOtherModels((previous) => ({ ...previous, [field]: value }))
            }
            modelOptions={offeredIds}
            omit={CHOSEN_ABOVE}
          />
        </div>
        <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
          <Button onClick={importToCcSwitch} disabled={prepareKey.isPending}>
            {spinner}
            {t('Open CC Switch')}
          </Button>
          <p className='text-muted-foreground text-sm'>
            {t('No CC Switch yet?')}{' '}
            <a
              href={CC_SWITCH_DOWNLOAD}
              target='_blank'
              rel='noopener noreferrer'
              className='text-foreground underline underline-offset-4'
            >
              {t('Download it')}
            </a>
          </p>
        </div>
      </div>
    )
  }

  let keyStep = (
    <p>
      {t(
        'Sign in to get an API key; until then the configuration shows a placeholder.'
      )}
    </p>
  )
  if (signedIn && !canPrepareKey) {
    keyStep = (
      <p>
        <Link
          to='/keys'
          className='text-foreground underline underline-offset-4'
        >
          {t('Create an API key in the console')}
        </Link>
      </p>
    )
  }
  if (canPrepareKey) {
    keyStep = (
      <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={copyKey}
          disabled={prepareKey.isPending}
        >
          {spinner}
          {t('Create and copy API key')}
        </Button>
        {apiKey && (
          <p className='min-w-0 flex-1'>
            {t(
              'Your key {{key}} is on the clipboard, and the configuration below now carries it.',
              { key: maskKey(apiKey) }
            )}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center gap-3'>
        <label htmlFor={modelFieldId} className='text-sm font-medium'>
          {t('Primary Model')}
        </label>
        <NativeSelect
          id={modelFieldId}
          value={model}
          onChange={(event) => setChosenModel(event.target.value)}
        >
          {offered.map((item) => (
            <NativeSelectOption key={item.id} value={item.id}>
              {item.name ? `${item.name} (${item.id})` : item.id}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <TitledCard
        title={t('Import with CC Switch')}
        description={t(
          'CC Switch adds {{site}} to {{client}} and switches to it. It shows what it is about to import and asks before changing anything.',
          { site: site.name, client: client.name }
        )}
        disableHoverEffect
      >
        {ccSwitchBody}
      </TitledCard>

      <TitledCard
        title={t('Set it up by hand')}
        description={t(
          'Copy your API key, paste the configuration, and you are ready.'
        )}
        disableHoverEffect
      >
        <ol className='text-muted-foreground list-decimal space-y-5 pl-5 text-sm'>
          <li>{keyStep}</li>
          {shown.map((block, index) => (
            <li key={block.file ?? 'terminal'} className='space-y-2'>
              <p>
                {block.file
                  ? t('Put this in {{file}}:', { file: block.file })
                  : t(
                      'Run this in a terminal, and add it to your shell profile to keep it:'
                    )}
              </p>
              <Snippet code={block.code} copy={copied[index].code} />
              {block.file && (
                <p className='text-xs'>
                  {t(
                    'If the file already has content, merge this into it rather than replacing it.'
                  )}
                </p>
              )}
            </li>
          ))}
          {client.command && (
            <li className='space-y-2'>
              <p>{t('Then start {{client}}:', { client: client.name })}</p>
              <Snippet code={client.command} copy={client.command} />
            </li>
          )}
        </ol>
      </TitledCard>
    </div>
  )
}
