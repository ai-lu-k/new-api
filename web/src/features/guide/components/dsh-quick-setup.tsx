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
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TitledCard } from '@/components/ui/titled-card'
import { useStatus } from '@/hooks/use-status'
import { handleServerError } from '@/lib/handle-server-error'
import {
  createServerError,
  getServerErrorMessage,
} from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { createDshSetupCode, type DshSetupCode } from '../api'
import { buildDshSetupCommands } from '../lib/dsh-setup'

function SetupCommand(props: { command: string; hint: string; site: string }) {
  const { t } = useTranslation()
  const prompt = t(
    'Please run the command below in a terminal to set up the {{site}} models for me. It edits settings.yaml and .credentials.yaml in the DSH home directory (~/.dsh), which is outside the workspace, so it needs permission to write there. If the first attempt is refused for that reason, ask me for that permission and then run exactly the same command again: a refused attempt does not use up the setup code. When it finishes, tell me what it printed.',
    { site: props.site }
  )

  return (
    <div className='space-y-3'>
      <p className='text-muted-foreground text-sm'>{props.hint}</p>
      <div className='flex items-start gap-2'>
        <pre className='bg-muted/60 border-border min-w-0 flex-1 rounded-md border p-3 text-xs leading-relaxed'>
          <code className='font-mono break-all whitespace-pre-wrap'>
            {props.command}
          </code>
        </pre>
        <CopyButton
          value={props.command}
          variant='outline'
          tooltip={t('Copy command')}
          aria-label={t('Copy command')}
        />
      </div>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3'>
        <p className='text-muted-foreground min-w-0 flex-1 text-sm'>
          {t(
            'Already using DSH? You can send it this prompt instead and let it run the command for you.'
          )}
        </p>
        <CopyButton
          value={`${prompt}\n\n${props.command}`}
          variant='outline'
          size='sm'
          className='self-start sm:self-auto'
          aria-label={t('Copy prompt for DSH')}
        >
          {t('Copy prompt for DSH')}
        </CopyButton>
      </div>
    </div>
  )
}

/**
 * One-command setup of the DSH client. The gateway prepares a key that reaches
 * every model and hands out a short-lived code; a script on the user's machine
 * trades the code for the configuration, so nothing is picked or typed by hand.
 */
export function DshQuickSetup() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  const [setup, setSetup] = useState<DshSetupCode | null>(null)
  const [expired, setExpired] = useState(false)

  const generate = useMutation({
    mutationFn: async () => {
      const response = await createDshSetupCode()
      if (!response.success || !response.data) {
        throw createServerError(
          response,
          t('Failed to generate the setup command')
        )
      }
      return response.data
    },
    onSuccess: (data) => {
      setExpired(false)
      setSetup(data)
    },
    onError: (error) => {
      setSetup(null)
      handleServerError(error, t('Failed to generate the setup command'))
    },
  })

  useEffect(() => {
    if (!setup) return
    const remaining = setup.expires_at * 1000 - Date.now()
    const timer = window.setTimeout(
      () => {
        setSetup(null)
        setExpired(true)
      },
      Math.max(remaining, 0)
    )
    return () => window.clearTimeout(timer)
  }, [setup])

  if (!status?.dsh_setup_enabled) return null

  const site =
    typeof status.system_name === 'string' ? status.system_name : 'LUK'
  const serverAddress =
    typeof status.server_address === 'string' && status.server_address
      ? status.server_address
      : window.location.origin

  let body = (
    <div className='flex flex-wrap items-center gap-3'>
      <p className='text-muted-foreground min-w-0 flex-1 text-sm'>
        {t('Sign in to get your command.')}
      </p>
      <Button render={<Link to='/sign-in' search={{ redirect: '/guide' }} />}>
        {t('Sign in')}
      </Button>
    </div>
  )

  if (signedIn && !setup) {
    body = (
      <div className='space-y-3'>
        {expired && (
          <p className='text-muted-foreground text-sm'>
            {t('This command has expired.')}
          </p>
        )}
        {generate.isError && (
          <p role='alert' className='text-destructive text-sm'>
            {getServerErrorMessage(
              generate.error,
              t('Failed to generate the setup command')
            )}
          </p>
        )}
        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
          {generate.isPending && (
            <Loader2 className='animate-spin' aria-hidden='true' />
          )}
          {t('Generate setup command')}
        </Button>
      </div>
    )
  }

  if (signedIn && setup) {
    const commands = buildDshSetupCommands(serverAddress, setup.code)
    const onWindows = /Windows/i.test(navigator.userAgent)
    body = (
      <div className='space-y-4'>
        <Tabs defaultValue={onWindows ? 'powershell' : 'shell'}>
          <TabsList>
            <TabsTrigger value='shell'>macOS / Linux</TabsTrigger>
            <TabsTrigger value='powershell'>Windows</TabsTrigger>
          </TabsList>
          <TabsContent value='shell'>
            <SetupCommand
              command={commands.shell}
              hint={t('Paste this into a terminal and run it:')}
              site={site}
            />
          </TabsContent>
          <TabsContent value='powershell'>
            <SetupCommand
              command={commands.powershell}
              hint={t('Paste this into PowerShell and run it:')}
              site={site}
            />
          </TabsContent>
        </Tabs>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
          <p className='text-muted-foreground min-w-0 flex-1 text-xs'>
            {t(
              'The command works once and expires 10 minutes after it is generated.'
            )}
          </p>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {t('Generate a new command')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <TitledCard
      title={t('Set up DSH with one command')}
      description={t(
        'Run one command in a terminal and DSH is ready to use: the provider, every model and your API key are written for you. There is no model, group or key to pick.'
      )}
      disableHoverEffect
      className='mt-8'
    >
      {body}
    </TitledCard>
  )
}
