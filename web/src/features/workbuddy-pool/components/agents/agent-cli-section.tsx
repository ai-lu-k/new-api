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
import { Download, TerminalSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'

import { hubGet } from '../../api'

/** The hub answers this one with the script itself, not JSON. */
type CliReply = { text?: string }

/**
 * The standalone configurator. The panel can only rewrite clients installed on
 * the gateway host, so the hub also serves the same script for machines that
 * run the clients elsewhere.
 */
export function AgentCliSection() {
  const { t } = useTranslation()

  const download = useMutation({
    mutationFn: async () => {
      const response = await hubGet<CliReply>('agents.cli')
      if (!response.success) {
        throw new Error(response.message || t('Unable to fetch the CLI.'))
      }
      const text = response.data?.text
      if (!text) {
        throw new Error(t('The hub returned no script.'))
      }
      return text
    },
    onSuccess: (text) => {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'wb_agents.py'
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(t('Downloaded wb_agents.py.'))
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  return (
    <TitledCard
      icon={<TerminalSquare />}
      title={t('Standalone configurator')}
      description={t(
        'Run this script on the machine that has the AI clients installed, then point it at this gateway. It is the same code the one-click setup runs here.'
      )}
    >
      <div className='space-y-3'>
        <div className='bg-muted rounded-lg p-3 font-mono text-xs leading-relaxed'>
          <p>python wb_agents.py list</p>
          <p>
            python wb_agents.py apply --client codex --base-url
            http://gateway:8788/v1 --key sk-...
          </p>
          <p>python wb_agents.py restore --client codex</p>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={download.isPending}
          onClick={() => download.mutate()}
        >
          <Download className='mr-1 size-4' />
          {t('Download wb_agents.py')}
        </Button>
      </div>
    </TitledCard>
  )
}
