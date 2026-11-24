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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { IconCrossfade } from '@/components/motion/icon-crossfade'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

/** How long the tick stays before the copy glyph fades back (L4). */
const COPIED_HOLD_MS = 1200

interface CopyButtonProps {
  value: string
  disabled?: boolean
  hideIcon?: boolean
  copiedLabel?: ReactNode
  onCopy?: (success: boolean) => void
  children?: ReactNode
  className?: string
  iconClassName?: string
  variant?: 'ghost' | 'outline' | 'default' | 'secondary' | 'destructive'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  tooltip?: string
  successTooltip?: string
  'aria-label'?: string
}

export function CopyButton({
  value,
  disabled,
  hideIcon,
  copiedLabel,
  onCopy,
  children,
  className,
  iconClassName,
  variant = 'ghost',
  size = 'icon',
  tooltip,
  successTooltip,
  'aria-label': ariaLabel,
}: CopyButtonProps) {
  const { t } = useTranslation()
  // The tick holds for 1.2s: long enough to read, short enough that the button
  // is a copy button again by the time the reader wants it.
  const { copiedText, copyToClipboard } = useCopyToClipboard({
    notify: false,
    resetAfterMs: COPIED_HOLD_MS,
  })
  const isCopied = copiedText === value
  const resolvedTooltip = tooltip ?? t('Copy to clipboard')
  const resolvedSuccessTooltip = successTooltip ?? t('Copied!')
  const resolvedAriaLabel = ariaLabel ?? resolvedTooltip
  const copiedAriaLabel = t('Copied')

  const button = (
    <Button
      variant={variant}
      size={size}
      className={cn('shrink-0', className)}
      disabled={disabled}
      onClick={async () => {
        const success = await copyToClipboard(value)
        onCopy?.(success)
      }}
      aria-label={isCopied ? copiedAriaLabel : resolvedAriaLabel}
    >
      {!hideIcon && (
        // 140ms confirmation: the tick cross-fades with the copy glyph in one
        // fixed cell, so the button never changes width (L4).
        <IconCrossfade
          state={isCopied ? 'copied' : 'copy'}
          glyphs={[
            { key: 'copy', glyph: <Copy className={cn(iconClassName)} /> },
            {
              key: 'copied',
              glyph: <Check className={cn('text-success', iconClassName)} />,
            },
          ]}
        />
      )}
      {isCopied && copiedLabel ? copiedLabel : children}
    </Button>
  )

  if (tooltip || successTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent>
          <p>{isCopied ? resolvedSuccessTooltip : resolvedTooltip}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return button
}
