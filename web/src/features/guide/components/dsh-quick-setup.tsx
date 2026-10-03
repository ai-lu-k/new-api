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
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { Check, Copy, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'
import {
  createServerError,
  getServerErrorMessage,
} from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { createDshSetupCode, getSetupCatalog } from '../api'
import {
  buildDshSetupCommands,
  buildDshSetupPrompt,
  dshModelGuideUrl,
} from '../lib/dsh-setup'

// A code on screen is replaced this long before it runs out, so that a prompt
// copied at the last moment still has time to be used.
const RENEW_EARLY_MS = 60 * 1000

/**
 * The account's current setup code. One is asked for as soon as the page is
 * shown and replaced before it expires, so a usable one is always on screen
 * without the user asking.
 */
function useSetupCode(
  userId: number | undefined,
  enabled: boolean,
  tokenId?: number
) {
  const { t } = useTranslation()
  const failure = t('Failed to prepare the setup prompt')
  const query = useQuery({
    queryKey: ['dsh-setup-code', userId ?? null, tokenId ?? null],
    queryFn: async () => {
      const response = await createDshSetupCode(tokenId)
      if (!response.success || !response.data) {
        throw createServerError(response, failure)
      }
      return response.data
    },
    enabled,
    // When to ask again is decided below, not by the cache.
    staleTime: Infinity,
    retry: false,
    refetchOnReconnect: false,
    meta: { errorToast: false },
  })
  const { data, refetch } = query
  // A code found past its lifetime stays hidden until its successor arrives.
  const [deadCode, setDeadCode] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    const expiresAt = data.expires_at * 1000
    let timer: number | undefined
    const renew = () => {
      // Nobody copies from a hidden page; it catches up when shown again.
      if (document.visibilityState !== 'visible') return
      if (Date.now() >= expiresAt) setDeadCode(data.code)
      void refetch()
    }
    const arm = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(
        renew,
        Math.max(expiresAt - RENEW_EARLY_MS - Date.now(), 0)
      )
    }
    arm()
    document.addEventListener('visibilitychange', arm)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', arm)
    }
  }, [data, refetch])

  return {
    setup: data && data.code !== deadCode ? data : undefined,
    error: query.isError ? query.error : null,
    isFetching: query.isFetching,
    renew: refetch,
  }
}

/** One command to run by hand, with a button that copies it. */
function CommandLine(props: {
  system: string
  command: string
  onCopied: () => void
}) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })
  const copy = async () => {
    if (await copyToClipboard(props.command)) props.onCopied()
  }

  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{props.system}</p>
      <div className='flex items-start gap-2'>
        <pre
          onCopy={props.onCopied}
          className='bg-muted/60 border-border min-w-0 flex-1 rounded-md border p-3 text-xs leading-relaxed'
        >
          <code className='font-mono break-words whitespace-pre-wrap'>
            {props.command}
          </code>
        </pre>
        <Button
          variant='outline'
          size='icon'
          className='shrink-0'
          onClick={copy}
          aria-label={t('Copy the command for {{system}}', {
            system: props.system,
          })}
        >
          {copiedText === null ? (
            <Copy aria-hidden='true' />
          ) : (
            <Check className='text-success' aria-hidden='true' />
          )}
        </Button>
      </div>
    </div>
  )
}

/**
 * Setting up the DSH client. The gateway hands out a short-lived code and a
 * script trades it for the configuration, so the API key never passes through
 * a chat. The script is run either by DSH itself, told to by a prompt that
 * also has it ask which model to use and match that model to the official
 * one, or by the user in a terminal.
 *
 * Given `tokenId`, the script writes that key of the account instead of the
 * one the site keeps for DSH.
 */
export function DshQuickSetup(props: { tokenId?: number }) {
  const { t, i18n } = useTranslation()
  const { status } = useStatus()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const here = useLocation({ select: (location) => location.href })
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })
  const offered = Boolean(status?.dsh_setup_enabled)
  const signedIn = userId !== undefined
  const code = useSetupCode(userId, offered && signedIn, props.tokenId)
  // The prompt names the models to choose from. It is still usable without
  // them, so a failed listing only leaves the choices out.
  const catalog = useQuery({
    queryKey: ['dsh-setup-models', userId ?? null],
    queryFn: async () => {
      const response = await getSetupCatalog()
      if (!response.success || !response.data) {
        throw createServerError(response, t('Failed to load models'))
      }
      return response.data
    },
    enabled: offered && signedIn,
    staleTime: 5 * 60 * 1000,
    meta: { errorToast: false },
  })

  if (!offered) return null

  const site =
    typeof status?.system_name === 'string' ? status.system_name : 'LUK'
  const serverAddress =
    typeof status?.server_address === 'string' && status.server_address
      ? status.server_address
      : window.location.origin

  let body = (
    <p className='text-muted-foreground flex items-center gap-2 text-sm'>
      <Loader2 className='size-4 animate-spin' aria-hidden='true' />
      {t('Preparing your prompt…')}
    </p>
  )
  let manual = null

  if (!signedIn) {
    body = (
      <div className='flex flex-wrap items-center gap-3'>
        <p className='text-muted-foreground min-w-0 flex-1 text-sm'>
          {t('Sign in first: your prompt appears here as soon as you do.')}
        </p>
        <Button render={<Link to='/sign-in' search={{ redirect: here }} />}>
          {t('Sign in')}
        </Button>
      </div>
    )
  } else if (code.error) {
    body = (
      <div className='flex flex-wrap items-center gap-3'>
        <p role='alert' className='text-destructive min-w-0 flex-1 text-sm'>
          {getServerErrorMessage(
            code.error,
            t('Failed to prepare the setup prompt')
          )}
        </p>
        <Button
          variant='outline'
          onClick={() => code.renew()}
          disabled={code.isFetching}
        >
          {code.isFetching && (
            <Loader2 className='animate-spin' aria-hidden='true' />
          )}
          {t('Retry')}
        </Button>
      </div>
    )
  } else if (code.setup && !catalog.isPending) {
    const commands = buildDshSetupCommands(serverAddress, code.setup.code)
    const prompt = buildDshSetupPrompt(
      {
        intro: t(
          'Please connect the {{site}} models to DSH for me. Do these steps in order.',
          { site }
        ),
        ask: t(
          'Step 1. Ask me which model I want to use. If you have the ask_user_question tool, use it and offer the models below as the choices; otherwise ask me in plain text and wait for my answer.'
        ),
        run: t(
          'Step 2. Run one of the two commands below in a terminal, the one for the system you are running on. It writes the {{site}} provider, every model and my API key into settings.yaml and .credentials.yaml in the DSH home directory (~/.dsh), which is outside the workspace, so it needs permission to write there. If the first attempt is refused for that reason, ask me for that permission and then run exactly the same command again: a refused attempt does not use up the setup code.',
          { site }
        ),
        align: t(
          "Step 3. When the command has succeeded, edit ~/.dsh/settings.yaml, after making a copy of it. Change only these two things, and do not read or print .credentials.yaml. First, set the top-level agent-default-model to the model I chose: provider is the id of the entry under llm-pi-ai.providers that lists this model and whose displayName starts with {{site}}, and model is the model id. Second, bring that model's entry in line with the official model. A model added by hand starts out in DSH as text-only and without reasoning levels, so look up its official specifications yourself (context window, maximum output, whether it accepts images, which reasoning levels it has) and write them into the entry as contextWindow, maxTokens, input and reasoningEfforts, adding compat where the guide calls for it, with only the switches that the entry's api takes. Take the exact fields from DSH's model configuration guide: {{guide}} If you wrote reasoning levels, also set reasoningEffort in agent-default-model to the model's official default level, so that it reasons from the first message. Leave out anything you cannot confirm.",
          { site, guide: dshModelGuideUrl(i18n.language) }
        ),
        report: t(
          'Step 4. Tell me what the command printed, which model is now the default, and which specifications you wrote and where you found them. Then have me check that the {{site}} models still show in the DSH model list: if they are gone, the entry is not valid, so put the copy back or correct the entry with the troubleshooting section of the same guide. Do the same if requests to this model fail.',
          { site }
        ),
      },
      catalog.data?.models ?? [],
      commands
    )
    // Whatever has been copied is as good as used, so the next code is lined
    // up at once; the copied one stays valid.
    const renew = () => void code.renew()
    const copy = async () => {
      if (await copyToClipboard(prompt)) renew()
    }
    const copied = copiedText !== null

    body = (
      <div className='space-y-3'>
        <pre
          onCopy={renew}
          className='bg-muted/60 border-border max-h-80 overflow-auto rounded-md border p-3 text-xs leading-relaxed'
        >
          <code className='font-mono break-words whitespace-pre-wrap'>
            {prompt}
          </code>
        </pre>
        <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
          <Button onClick={copy}>
            {copied ? (
              <Check aria-hidden='true' />
            ) : (
              <Copy aria-hidden='true' />
            )}
            {copied ? t('Copied') : t('Copy prompt')}
          </Button>
          <p className='text-muted-foreground min-w-0 flex-1 text-xs'>
            {t(
              'The prompt works once and stays valid for 10 minutes. A fresh one takes its place after each copy and before it runs out.'
            )}
          </p>
        </div>
      </div>
    )
    manual = (
      <TitledCard
        title={t('Set it up by hand')}
        description={t(
          'Run the command yourself in a terminal: it writes the same provider, models and API key. Afterwards pick a {{site}} model in the DSH model list.',
          { site }
        )}
        disableHoverEffect
      >
        <div className='space-y-4'>
          <CommandLine
            system='macOS / Linux'
            command={commands.shell}
            onCopied={renew}
          />
          <CommandLine
            system='Windows (PowerShell)'
            command={commands.powershell}
            onCopied={renew}
          />
        </div>
      </TitledCard>
    )
  }

  return (
    <div className='space-y-6'>
      <TitledCard
        title={t('Set up DSH with one prompt')}
        description={t(
          'Send DSH the prompt below. It asks which model you want, sets up the provider, every model and your API key, and matches the model you chose to its official limits. There is no group or key to pick.'
        )}
        disableHoverEffect
      >
        {body}
      </TitledCard>
      {manual}
    </div>
  )
}
