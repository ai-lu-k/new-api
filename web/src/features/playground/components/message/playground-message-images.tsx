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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { cn } from '@/lib/utils'

type PlaygroundMessageImagesProps = {
  images: string[]
  className?: string
}

/**
 * Generated images for one message.
 *
 * The shared image components were checked first: `ai-elements/image` only
 * accepts the AI SDK's generated-image shape (`base64` + `mediaType`) and has
 * no preview or fallback, and `ai-elements/response-renderer-image` renders a
 * markdown `ImageNode` without an "open original" affordance. Neither can show
 * a plain URL or `data:` list, so this composes the shared `Dialog` and
 * `CopyButton` around a native `<img>` and states the gap here.
 */
export function PlaygroundMessageImages(props: PlaygroundMessageImagesProps) {
  const { t } = useTranslation()
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const previewSrc =
    previewIndex === null ? null : (props.images[previewIndex] ?? null)
  // Keys come from the image payload, not the array position, so React keeps
  // the same element when a later message reuses an identical result.
  const keyedImages = useMemo(() => {
    const seen = new Map<string, number>()

    return props.images.map((image) => {
      const duplicateCount = seen.get(image) ?? 0
      seen.set(image, duplicateCount + 1)

      return {
        image,
        key: `${duplicateCount}-${image.length}-${image.slice(0, 48)}`,
      }
    })
  }, [props.images])

  return (
    <>
      <div
        className={cn('flex flex-wrap gap-2', props.className)}
        data-testid='playground-message-images'
      >
        {keyedImages.map(({ image, key }, index) => (
          <button
            aria-label={t('Open image {{index}}', { index: index + 1 })}
            className='border-border/70 bg-muted/40 hover:border-primary/45 focus-visible:ring-ring/50 overflow-hidden rounded-lg border transition-colors focus-visible:ring-3 focus-visible:outline-none'
            key={key}
            onClick={() => setPreviewIndex(index)}
            type='button'
          >
            <img
              alt={t('Generated image {{index}}', { index: index + 1 })}
              className='block h-auto max-h-72 w-auto max-w-full object-contain'
              loading='lazy'
              src={image}
            />
          </button>
        ))}
      </div>

      <Dialog
        contentClassName='sm:max-w-3xl'
        description={t('View the generated image')}
        onOpenChange={(open) => {
          if (!open) setPreviewIndex(null)
        }}
        open={previewSrc !== null}
        title={t('Image Preview')}
      >
        {previewSrc && (
          <div className='space-y-3'>
            <div className='bg-muted/50 flex min-h-[240px] items-center justify-center rounded-lg border'>
              <img
                alt={t('Generated image')}
                className='max-h-[60vh] w-auto max-w-full rounded-lg object-contain'
                src={previewSrc}
              />
            </div>
            {!previewSrc.startsWith('data:') && (
              <div className='flex items-center gap-2'>
                <p className='text-muted-foreground min-w-0 flex-1 font-mono text-xs break-all'>
                  {previewSrc}
                </p>
                <CopyButton
                  aria-label={t('Copy image link')}
                  tooltip={t('Copy image link')}
                  value={previewSrc}
                />
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  )
}
