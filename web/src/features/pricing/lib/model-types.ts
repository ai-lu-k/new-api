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
import type { PricingModel } from '../types'
import { parseTags } from './filters'

// ----------------------------------------------------------------------------
// What a model produces, for the type bar above the model list
// ----------------------------------------------------------------------------

/**
 * The kinds of work the catalogue can offer, in the order the type bar lists
 * them: the kinds most visitors come for first, the specialist ones after.
 */
export const MODEL_TYPES = [
  'text',
  'image',
  'audio',
  'decision',
  'video',
  'embeddings',
  'rerank',
] as const

export type ModelType = (typeof MODEL_TYPES)[number]

/** The labels of the kinds of work a model can do. */
export const MODEL_TYPE_LABELS: Record<ModelType, string> = {
  text: 'Text',
  image: 'Image',
  decision: 'Decision models',
  video: 'Video',
  audio: 'Audio',
  embeddings: 'Embeddings',
  rerank: 'Rerank',
}

/** Endpoints that say what a model produces, whatever its output list says. */
const ENDPOINT_TYPES: Partial<Record<string, ModelType>> = {
  'image-generation': 'image',
  'openai-video': 'video',
  embeddings: 'embeddings',
  'jina-rerank': 'rerank',
}

/** Endpoints that serve a conversation, so the model writes text. */
const CHAT_ENDPOINTS = new Set([
  'openai',
  'openai-response',
  'openai-response-compact',
  'openai-alpha-search',
  'anthropic',
  'gemini',
])

/** Types that produce a medium of their own rather than an answer. */
const MEDIA_TYPES: ModelType[] = ['image', 'video', 'audio']

/**
 * Tags that put a model on the decision board, such as the synchronous
 * "jev" evaluation model. A tag contains one of these words.
 */
const DECISION_TAGS = ['decision', '决策']

/**
 * Whether the catalogue marks this model as a decision model by tag, such as
 * the synchronous "jev" evaluation model.
 */
function tagsContainDecisionTag(model: PricingModel): boolean {
  return parseTags(model.tags).some((tag) =>
    DECISION_TAGS.some((word) => tag.toLowerCase().includes(word))
  )
}

/**
 * The types one model belongs to, read from what the catalogue states about
 * it. The output modalities are authoritative when they are entered; the
 * endpoints decide the rest. A model that only serves chat writes text, but a
 * model that draws or speaks is listed under that medium even when it also
 * answers in text: accepting a picture does not make a model draw one, and
 * drawing one does not make it a chat model.
 * A decision model is marked by tag: the tag adds the decision family
 * alongside the types the model reads its own from, because the same model
 * still answers in text.
 */
export function modelTypes(model: PricingModel): ModelType[] {
  const types = new Set<ModelType>()
  for (const modality of model.output_modalities ?? []) {
    if (MODEL_TYPES.includes(modality as ModelType)) {
      types.add(modality as ModelType)
    }
  }
  const endpoints = model.supported_endpoint_types ?? []
  for (const endpoint of endpoints) {
    const type = ENDPOINT_TYPES[endpoint]
    if (type) types.add(type)
  }
  if (MEDIA_TYPES.some((type) => types.has(type))) {
    types.delete('text')
  }
  if (
    types.size === 0 &&
    endpoints.some((endpoint) => CHAT_ENDPOINTS.has(endpoint))
  ) {
    types.add('text')
  }
  // A decision model answers in text, so the tag adds a family rather than
  // replacing one: it is listed under Decision models and under Text.
  if (tagsContainDecisionTag(model)) types.add('decision')
  return MODEL_TYPES.filter((type) => types.has(type))
}

/** The types this catalogue actually has models for, in listing order. */
export function availableModelTypes(models: PricingModel[]): ModelType[] {
  const present = new Set<ModelType>()
  for (const model of models) {
    for (const type of modelTypes(model)) present.add(type)
  }
  return MODEL_TYPES.filter((type) => present.has(type))
}
