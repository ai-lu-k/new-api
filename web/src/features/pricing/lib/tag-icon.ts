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
  BrainIcon,
  EyeIcon,
  FlashIcon,
  Image01Icon,
  Invoice01Icon,
  Layers01Icon,
  Pen01Icon,
  SparklesIcon,
  TextFontIcon,
  Video01Icon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'

/**
 * A small mark for a catalog tag, so a row of tags can be read by shape before
 * it is read word by word — the same reason the kinds row carries icons.
 *
 * Tags are the site's own free text, so this is a lookup by the words the
 * catalog happens to use; a tag it does not know keeps its words and goes
 * without a mark rather than borrowing an unrelated one.
 */
const TAG_ICONS: Record<string, IconSvgElement> = {
  生图: Image01Icon,
  图片编辑: Pen01Icon,
  画质优先: SparklesIcon,
  速度优先: FlashIcon,
  按次计费: Invoice01Icon,
  推理: BrainIcon,
  工具: Wrench01Icon,
  视觉: EyeIcon,
  多模态: Layers01Icon,
  文本: TextFontIcon,
  视频: Video01Icon,
  音频: AudioWave01Icon,
  决策模型: BrainCircuitIcon,
  embeddings: Layers01Icon,
  rerank: Layers01Icon,
  vision: EyeIcon,
  tools: Wrench01Icon,
  reasoning: BrainIcon,
  image: Image01Icon,
  video: Video01Icon,
  audio: AudioWave01Icon,
  text: TextFontIcon,
}

export function tagIcon(tag: string): IconSvgElement | null {
  return TAG_ICONS[tag.trim().toLowerCase()] ?? TAG_ICONS[tag.trim()] ?? null
}
