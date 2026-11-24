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
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'
import { useStatus } from '@/hooks/use-status'
import { getServerErrorMessage } from '@/lib/server-error-message'
import { openAuthDialog } from '@/stores/auth-dialog-store'
import { useAuthStore } from '@/stores/auth-store'

import { useSetupCode } from '../hooks/use-setup-code'
import type { AgentClient } from '../lib/agents'
import { buildClaudeSetupCommands } from '../lib/dsh-setup'
import { CommandLine } from './command-line'

/** The file the script writes; also what the card names in its description. */
const CLAUDE_SETTINGS_FILE = '~/.claude/settings.json'

/**
 * Setting up Claude Code with one command. The gateway hands out a short-lived
 * code and the script trades it for the key, so the API key never passes
 * through a chat: it is merged into the file the hand-written configuration
 * already uses, and the rest of that file is left alone.
 *
 * There is a script for each shell, so this card offers one command for macOS
 * and Linux and one for Windows.
 */
export function ClaudeQuickSetup(props: { client: AgentClient }) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const here = useLocation({ select: (location) => location.href })
  const offered = Boolean(status?.dsh_setup_enabled)
  const signedIn = userId !== undefined
  const code = useSetupCode(userId, offered && signedIn)
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
      {t('Preparing the command…')}
    </p>
  )
  if (!signedIn) {
    body = (
      <div className='flex flex-wrap items-center gap-3'>
        <p className='text-muted-foreground min-w-0 flex-1 text-sm'>
          {t('Sign in first: the command appears here as soon as you do.')}
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
    const commands = buildClaudeSetupCommands(serverAddress, code.setup.code)
    // A copied command counts as used, so the next code is lined up at once.
    const renew = () => void code.renew()

    body = (
      <div className='space-y-3'>
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
        <p className='text-muted-foreground text-xs'>
          {t(
            'The command works once and stays valid for 10 minutes. A fresh one takes its place after each copy and before it runs out.'
          )}
        </p>
      </div>
    )
  }

  return (
    <TitledCard
      title={t('Set up {{client}} with one command', {
        client: props.client.name,
      })}
      description={t(
        'Run the command in a terminal: it writes the {{site}} base URL, your API key and a model into {{file}} and leaves everything else in that file as it is. Restart {{client}} afterwards.',
        { site, file: CLAUDE_SETTINGS_FILE, client: props.client.name }
      )}
      disableHoverEffect
    >
      {body}
    </TitledCard>
  )
}
