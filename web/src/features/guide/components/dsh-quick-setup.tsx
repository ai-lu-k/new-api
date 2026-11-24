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
import { useLocation } from '@tanstack/react-router'
import { Check, Copy, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconCrossfade } from '@/components/motion/icon-crossfade'
import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'
import { getServerErrorMessage } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { openAuthDialog } from '@/stores/auth-dialog-store'
import { useAuthStore } from '@/stores/auth-store'

import { useSetupCode } from '../hooks/use-setup-code'
import { buildDshSetupCommands, buildDshSetupPrompt } from '../lib/dsh-setup'
import { CommandLine } from './command-line'

/**
 * Setting up the DSH client. The gateway hands out a short-lived code and a
 * script trades it for the configuration, so the API key never passes through
 * a chat. The user runs the script in a terminal, or sends DSH a prompt that
 * has it run the same command. Either way DSH has to be restarted afterwards.
 *
 * Given `tokenId`, the script writes that key of the account instead of the
 * one the site keeps for DSH.
 */
export function DshQuickSetup(props: { tokenId?: number }) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const here = useLocation({ select: (location) => location.href })
  const { copiedText, copyToClipboard } = useCopyToClipboard({
    notify: false,
    resetAfterMs: 1200,
  })
  const offered = Boolean(status?.dsh_setup_enabled)
  const signedIn = userId !== undefined
  const code = useSetupCode(userId, offered && signedIn, props.tokenId)
  if (!offered) return null

  const site =
    typeof status?.system_name === 'string' ? status.system_name : 'New API'
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
        <Button onClick={() => openAuthDialog('sign-in', { redirectTo: here })}>
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
  } else if (code.setup) {
    const commands = buildDshSetupCommands(serverAddress, code.setup.code)
    const prompt = buildDshSetupPrompt(
      {
        intro: t(
          'Please connect the {{site}} models to DSH for me by running one command.',
          { site }
        ),
        run: t(
          'Run one of the two commands below in a terminal, the one for the system you are running on, exactly as written. It writes the {{site}} provider, every model and my API key into settings.yaml and .credentials.yaml in the DSH home directory (~/.dsh), which is outside the workspace, so it needs permission to write there. If the first attempt is refused for that reason, ask me for that permission and then run exactly the same command again: a refused attempt does not use up the setup code. Do not read or print .credentials.yaml, and do not edit either file yourself.',
          { site }
        ),
        report: t(
          'When the command has succeeded, show me what it printed and tell me to restart DSH: the {{site}} models only appear after a restart.',
          { site }
        ),
      },
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
            <IconCrossfade
              state={copied ? 'copied' : 'copy'}
              glyphs={[
                { key: 'copy', glyph: <Copy aria-hidden='true' /> },
                { key: 'copied', glyph: <Check aria-hidden='true' /> },
              ]}
            />
            {/* The label keeps its slot: the button is the same width before
                and after the copy. */}
            <span className='grid'>
              <span
                aria-hidden={copied}
                className={cn(
                  'col-start-1 row-start-1 transition-opacity duration-(--motion-fast) ease-(--ease-out)',
                  copied && 'opacity-0'
                )}
              >
                {t('Copy prompt')}
              </span>
              <span
                aria-hidden={!copied}
                className={cn(
                  'col-start-1 row-start-1 transition-opacity duration-(--motion-fast) ease-(--ease-out)',
                  !copied && 'opacity-0'
                )}
              >
                {t('Copied')}
              </span>
            </span>
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
          'Run the command yourself in a terminal: it writes the provider, every model and your API key. Then restart DSH and pick a {{site}} model in its model list.',
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
          'Not at home in a terminal? Send DSH the prompt below and it runs the setup command for you: the provider, every model and your API key are written in one go. Restart DSH afterwards.'
        )}
        disableHoverEffect
      >
        {body}
      </TitledCard>
      {manual}
    </div>
  )
}
