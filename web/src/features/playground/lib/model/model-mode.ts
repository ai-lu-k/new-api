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
import { t } from 'i18next'

import {
  IMAGE_COUNT_MAX,
  IMAGE_COUNT_MIN,
  MESSAGE_ROLES,
  MESSAGE_STATUS,
} from '../../constants'
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  Message,
  ModelOption,
  PlaygroundConfig,
} from '../../types'
import { completeAssistantTiming } from '../message/message-timing-utils'
import {
  getMessageContent,
  updateCurrentVersionContent,
} from '../message/message-utils'

export type PlaygroundModelMode = 'text' | 'image' | 'chat-image'

/**
 * Resolve how the playground must call a model:
 *
 * - `image`: listed in `image_generation_models`, served by
 *   `/pg/images/generations` with the image parameter panel.
 * - `chat-image`: can output an image (listed in `image_output_models`) but is
 *   only reachable through chat completions, where the image arrives as an
 *   inline `data:` markdown image. Chat parameters stay, streaming is forced
 *   off.
 * - `text`: everything else, including models without any modality metadata.
 */
export function getPlaygroundModelMode(
  models: ModelOption[],
  modelName: string
): PlaygroundModelMode {
  const model = models.find((item) => item.value === modelName)

  if (model?.isImageGeneration) {
    return 'image'
  }

  return model?.isImageOutput ? 'chat-image' : 'text'
}

/**
 * Prompt for image generation: only the latest user turn participates, so a
 * multi-turn chat history never leaks into the image request.
 */
export function getImageGenerationPrompt(messages: Message[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.from !== MESSAGE_ROLES.USER) continue

    const content = getMessageContent(message).trim()
    if (content) {
      return content
    }
  }

  return ''
}

export function clampImageCount(count: number): number {
  if (!Number.isFinite(count)) {
    return IMAGE_COUNT_MIN
  }

  return Math.min(IMAGE_COUNT_MAX, Math.max(IMAGE_COUNT_MIN, Math.round(count)))
}

/**
 * Build the image generation body. Blank size/quality mean "upstream default"
 * and stay out of the request.
 */
export function buildImageGenerationRequest(
  prompt: string,
  config: PlaygroundConfig
): ImageGenerationRequest {
  const request: ImageGenerationRequest = {
    model: config.model,
    prompt,
    n: clampImageCount(config.image_n),
  }

  if (config.group) {
    request.group = config.group
  }

  if (config.image_size) {
    request.size = config.image_size
  }

  if (config.image_quality) {
    request.quality = config.image_quality
  }

  return request
}

/**
 * Collect displayable image sources, turning inline base64 payloads into data
 * URLs so they render without a second request.
 */
export function getImageGenerationImages(
  response: ImageGenerationResponse
): string[] {
  const images: string[] = []

  for (const item of response.data ?? []) {
    if (item?.url) {
      images.push(item.url)
      continue
    }

    if (item?.b64_json) {
      images.push(`data:image/png;base64,${item.b64_json}`)
    }
  }

  return images
}

const MARKDOWN_DATA_IMAGE_PATTERN =
  /!\[[^\]]*\]\(\s*(data:image\/[^)\s]+)\s*\)/gi

/**
 * Pull inline `data:` images out of a chat answer. A chat-image model replies
 * with markdown whose `src` is roughly a megabyte of base64, which the markdown
 * renderer refuses to parse (it stops at 20k characters) and which must not be
 * re-sent upstream. Splitting it out leaves ordinary text plus a list of
 * sources the existing image component can show.
 */
export function splitInlineImages(content: string): {
  text: string
  images: string[]
} {
  if (!content.includes('data:image/')) {
    return { text: content, images: [] }
  }

  const images: string[] = []
  const text = content.replace(
    MARKDOWN_DATA_IMAGE_PATTERN,
    (_match: string, src: string) => {
      images.push(src)
      return ''
    }
  )

  return { text: text.trim(), images }
}

/**
 * Apply a chat-image answer. Returns null when the answer carries no inline
 * image, so the caller keeps the ordinary chat handling.
 */
export function applyChatImageResponse(
  message: Message,
  content: string
): Message | null {
  const { text, images } = splitInlineImages(content)

  if (images.length === 0) {
    return null
  }

  return completeAssistantTiming({
    ...updateCurrentVersionContent(
      message,
      text || getImageGenerationSummary(images.length)
    ),
    images,
    isReasoningStreaming: false,
    status: MESSAGE_STATUS.COMPLETE,
  })
}

export function getImageGenerationSummary(count: number): string {
  return count === 1
    ? t('Generated 1 image')
    : t('Generated {{count}} images', { count })
}

/**
 * Apply an image generation result to the pending assistant message. The
 * summary is what survives a reload, because images are not persisted.
 */
export function applyImageGenerationResponse(
  message: Message,
  images: string[]
): Message {
  return completeAssistantTiming({
    ...updateCurrentVersionContent(
      message,
      getImageGenerationSummary(images.length)
    ),
    images,
    isReasoningStreaming: false,
    status: MESSAGE_STATUS.COMPLETE,
  })
}
