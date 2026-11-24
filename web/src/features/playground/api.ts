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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { API_ENDPOINTS } from './constants'
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ModelOption,
  GroupOption,
} from './types'

/**
 * Send chat completion request (non-streaming)
 */
export async function sendChatCompletion(
  payload: ChatCompletionRequest,
  signal?: AbortSignal
): Promise<ChatCompletionResponse> {
  const res = await api.post(API_ENDPOINTS.CHAT_COMPLETIONS, payload, {
    signal,
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return res.data
}

/**
 * Send image generation request (never streaming)
 */
export async function sendImageGeneration(
  payload: ImageGenerationRequest,
  signal?: AbortSignal
): Promise<ImageGenerationResponse> {
  const res = await api.post(API_ENDPOINTS.IMAGE_GENERATIONS, payload, {
    signal,
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return res.data
}

function toStringSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) {
    return new Set<string>()
  }

  return new Set<string>(
    value.filter((item): item is string => typeof item === 'string')
  )
}

/**
 * Get user available models
 */
export async function getUserModels(group: string): Promise<ModelOption[]> {
  const res = await api.get(API_ENDPOINTS.USER_MODELS, {
    params: { group },
  })
  const { data } = res
  requireServerSuccess(data)

  if (!data.success || !Array.isArray(data.data)) {
    return []
  }

  // `image_generation_models` lists models that can serve
  // /pg/images/generations directly. `image_output_models` is the wider list:
  // it also contains models that answer with an inline `data:` image through
  // chat completions, so it drives the dropdown group.
  const imageGenerationModels = toStringSet(data.image_generation_models)
  const imageOutputModels = toStringSet(data.image_output_models)

  return data.data.map((model: string) => {
    const isImageGeneration = imageGenerationModels.has(model)
    // A direct image-generation model always outputs an image, even if an older
    // backend response does not list it in `image_output_models` yet.
    const isImageOutput = isImageGeneration || imageOutputModels.has(model)

    return {
      label: model,
      value: model,
      category: isImageOutput ? 'Image' : 'Text',
      isImageGeneration,
      isImageOutput,
    }
  })
}

/**
 * Get user groups
 */
export async function getUserGroups(): Promise<GroupOption[]> {
  const res = await api.get(API_ENDPOINTS.USER_GROUPS)
  const { data } = res
  requireServerSuccess(data)

  if (!data.success || !data.data) {
    return []
  }

  const groupData = data.data as Record<string, { desc: string; ratio: number }>

  // label is for button display (name only); desc is for dropdown content
  return Object.entries(groupData).map(([group, info]) => ({
    label: group,
    value: group,
    ratio: info.ratio,
    desc: info.desc,
  }))
}
