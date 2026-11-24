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
import { Check, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconCrossfade } from '@/components/motion/icon-crossfade'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

/** One command to run by hand, with the system to run it on and a copy button. */
export function CommandLine(props: {
  system: string
  command: string
  onCopied: () => void
}) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({
    notify: false,
    resetAfterMs: 1200,
  })
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
          <IconCrossfade
            state={copiedText === null ? 'copy' : 'copied'}
            glyphs={[
              { key: 'copy', glyph: <Copy aria-hidden='true' /> },
              {
                key: 'copied',
                glyph: <Check className='text-success' aria-hidden='true' />,
              },
            ]}
          />
        </Button>
      </div>
    </div>
  )
}
