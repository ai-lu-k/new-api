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
import {
  AudioWave01Icon,
  BrainCircuitIcon,
  GridViewIcon,
  Image01Icon,
  SortDescendingIcon,
  TextFontIcon,
  VectorSquareIcon,
  Video01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { FILTER_ALL } from '../constants'
import { MODEL_TYPE_LABELS, type ModelType } from '../lib/model-types'

export interface ModelTypeBarProps {
  /** The kinds this catalogue has models for, in listing order. */
  types: ModelType[]
  /** The chosen kind, or FILTER_ALL. */
  value: string
  onChange: (value: string) => void
  className?: string
}

/** One icon per kind, so the row can be read before it is read word by word. */
const TYPE_ICONS: Record<ModelType, IconSvgElement> = {
  text: TextFontIcon,
  image: Image01Icon,
  decision: BrainCircuitIcon,
  video: Video01Icon,
  audio: AudioWave01Icon,
  embeddings: VectorSquareIcon,
  rerank: SortDescendingIcon,
}

/**
 * The kinds of model in the catalogue, as one compact row above the list:
 * "all" plus every kind that has models. Choosing one narrows the list; the
 * row narrows nothing by itself, so it is offered only where there is a choice
 * to make.
 */
export function ModelTypeBar(props: ModelTypeBarProps) {
  const { t } = useTranslation()

  if (props.types.length < 2) return null

  return (
    <Tabs
      value={props.value}
      onValueChange={(value) => props.onChange(String(value))}
      className={props.className}
    >
      {/* The scroll box keeps a little room below the row for the selected
          underline; the negative margins take that room back from the stack. */}
      <div className='-my-1.5 overflow-x-auto py-1'>
        <TabsList
          variant='line'
          aria-label={t('Model types')}
          className='h-7 w-max min-w-full justify-start gap-0.5'
        >
          <TabsTrigger value={FILTER_ALL} className='flex-none gap-1.5 px-2.5'>
            <HugeiconsIcon
              icon={GridViewIcon}
              size={14}
              strokeWidth={1.8}
              aria-hidden='true'
            />
            {t('All')}
          </TabsTrigger>
          {props.types.map((type) => (
            <TabsTrigger
              key={type}
              value={type}
              className='flex-none gap-1.5 px-2.5'
            >
              <HugeiconsIcon
                icon={TYPE_ICONS[type]}
                size={14}
                strokeWidth={1.8}
                aria-hidden='true'
              />
              {t(MODEL_TYPE_LABELS[type])}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  )
}
