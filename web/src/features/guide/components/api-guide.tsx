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
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TitledCard } from '@/components/ui/titled-card'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { getSetupCatalog } from '../api'
import { ensureAgentKey, KEY_PLACEHOLDER, maskKey } from '../lib/agent-key'
import {
  API_LANGUAGES,
  apiBaseUrl,
  apiStyleOf,
  buildApiExample,
  callableModels,
} from '../lib/api-examples'
import { Snippet } from './snippet'

// The key prepared here is named apart from the ones prepared for the agents,
// so its owner can tell in the console where each came from.
const KEY_NAME = 'Quick Start'

/**
 * Calling the gateway from one's own code: get a key, pick a model, and send
 * a request in the language at hand. The examples follow the model: the
 * OpenAI-compatible format where the gateway serves the model on it, the
 * Anthropic one otherwise.
 */
export function ApiGuide() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const here = useLocation({ select: (location) => location.href })
  const { copyToClipboard } = useCopyToClipboard()
  const modelFieldId = useId()
  const [chosenModel, setChosenModel] = useState('')
  const [apiKey, setApiKey] = useState('')

  const catalog = useQuery({
    queryKey: ['dsh-setup-models', userId ?? null],
    queryFn: async () => requireServerSuccess(await getSetupCatalog()).data,
    staleTime: 5 * 60 * 1000,
  })

  const prepareKey = useMutation({
    mutationFn: () => ensureAgentKey(KEY_NAME),
    onSuccess: setApiKey,
    onError: (error) =>
      handleServerError(error, t('Failed to prepare the API key')),
  })

  if (catalog.isPending) {
    return <p className='text-muted-foreground text-sm'>{t('Loading...')}</p>
  }

  const models = callableModels(catalog.data?.models ?? [])
  if (models.length === 0) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t('This site has no model to call yet.')}
      </p>
    )
  }

  const address =
    typeof status?.server_address === 'string' && status.server_address
      ? status.server_address
      : window.location.origin
  const model =
    models.find((item) => item.id === chosenModel) ??
    models.find((item) => item.id === catalog.data?.default_model) ??
    models[0]
  const style = apiStyleOf(model)
  const baseUrl = apiBaseUrl(style, address)
  const signedIn = userId !== undefined
  const canPrepareKey = signedIn && Boolean(catalog.data?.auto_group)

  const copyKey = async () => {
    // A failed attempt has already been reported by the mutation's onError.
    const key = apiKey || (await prepareKey.mutateAsync().catch(() => ''))
    if (key) await copyToClipboard(key)
  }

  const exampleFor = (language: (typeof API_LANGUAGES)[number]['id']) => {
    const build = (key: string) =>
      buildApiExample({
        language,
        style,
        address,
        apiKey: key,
        model: model.id,
      })
    return {
      shown: build(apiKey ? maskKey(apiKey) : KEY_PLACEHOLDER),
      copied: build(apiKey || KEY_PLACEHOLDER),
    }
  }

  let keyStep = (
    <div className='flex flex-wrap items-center gap-3'>
      <p className='min-w-0 flex-1'>
        {t(
          'Sign in to create an API key; until then the examples show a placeholder.'
        )}
      </p>
      <Button render={<Link to='/sign-in' search={{ redirect: here }} />}>
        {t('Sign in')}
      </Button>
    </div>
  )
  if (signedIn && !canPrepareKey) {
    keyStep = (
      <div className='flex flex-wrap items-center gap-3'>
        <p className='min-w-0 flex-1'>
          {t(
            'In the console, open API Keys, choose Create API Key, pick the group that carries the model you want to call, then put the key into the examples below.'
          )}
        </p>
        <Button variant='outline' render={<Link to='/keys' />}>
          {t('API Keys')}
        </Button>
      </div>
    )
  }
  if (canPrepareKey) {
    keyStep = (
      <div className='space-y-2'>
        <p>
          {t(
            'Create an API key. It is listed under API Keys in the console, where you can disable or delete it at any time.'
          )}
        </p>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={copyKey}
            disabled={prepareKey.isPending}
          >
            {prepareKey.isPending && (
              <Loader2 className='animate-spin' aria-hidden='true' />
            )}
            {t('Create and copy API key')}
          </Button>
          {apiKey && (
            <p className='min-w-0 flex-1'>
              {t(
                'Your key {{key}} is on the clipboard, and the examples below now carry it.',
                { key: maskKey(apiKey) }
              )}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <TitledCard
      title={t('Call the API directly')}
      description={t(
        'The gateway speaks the OpenAI and Anthropic API formats, so anything that can send an HTTP request can call it.'
      )}
      disableHoverEffect
    >
      <ol className='text-muted-foreground list-decimal space-y-5 pl-5 text-sm'>
        <li>{keyStep}</li>
        <li className='space-y-2'>
          <label htmlFor={modelFieldId}>{t('Pick the model to call:')}</label>
          <NativeSelect
            id={modelFieldId}
            value={model.id}
            onChange={(event) => setChosenModel(event.target.value)}
          >
            {models.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name ? `${item.name} (${item.id})` : item.id}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
            <p>
              {style === 'openai'
                ? t(
                    'This model is called through the OpenAI-compatible API. Base URL:'
                  )
                : t(
                    'This model is called through the Anthropic Messages API. Base URL:'
                  )}
            </p>
            <code className='bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs'>
              {baseUrl}
            </code>
            <CopyButton value={baseUrl} />
          </div>
        </li>
        <li className='space-y-2'>
          <p>{t('Send a request in the language you use:')}</p>
          <Tabs defaultValue={API_LANGUAGES[0].id}>
            <TabsList>
              {API_LANGUAGES.map((language) => (
                <TabsTrigger key={language.id} value={language.id}>
                  {language.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {API_LANGUAGES.map((language) => {
              const example = exampleFor(language.id)
              return (
                <TabsContent key={language.id} value={language.id}>
                  <Snippet code={example.shown} copy={example.copied} />
                </TabsContent>
              )
            })}
          </Tabs>
        </li>
      </ol>
    </TitledCard>
  )
}
