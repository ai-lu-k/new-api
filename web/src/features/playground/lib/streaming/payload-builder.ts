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
import type {
  ChatCompletionRequest,
  Message,
  PlaygroundConfig,
  ParameterEnabled,
} from '../../types'
import {
  formatMessageForAPI,
  isValidMessage,
  redactInlineImageData,
} from '../message/message-utils'
import type { PlaygroundModelMode } from '../model/model-mode'

/**
 * Build API request payload from messages and config
 */
export function buildChatCompletionPayload(
  messages: Message[],
  config: PlaygroundConfig,
  parameterEnabled: ParameterEnabled,
  mode: PlaygroundModelMode = 'text'
): ChatCompletionRequest {
  // Filter and format valid messages. Inline base64 images from an earlier
  // chat-image turn are replaced with a short placeholder: re-sending them
  // would push ~1 MB back upstream on every follow-up request.
  const processedMessages = messages.filter(isValidMessage).map((message) => {
    const formatted = formatMessageForAPI(message)

    return typeof formatted.content === 'string'
      ? { ...formatted, content: redactInlineImageData(formatted.content) }
      : formatted
  })

  const payload: ChatCompletionRequest = {
    model: config.model,
    group: config.group,
    messages: processedMessages,
    // A chat-image answer is one markdown image built from a single base64
    // payload, so streaming it has no benefit.
    stream: mode === 'chat-image' ? false : config.stream,
  }

  if (parameterEnabled.temperature) {
    payload.temperature = config.temperature
  }

  if (parameterEnabled.top_p) {
    payload.top_p = config.top_p
  }

  if (parameterEnabled.max_tokens) {
    payload.max_tokens = config.max_tokens
  }

  if (parameterEnabled.frequency_penalty) {
    payload.frequency_penalty = config.frequency_penalty
  }

  if (parameterEnabled.presence_penalty) {
    payload.presence_penalty = config.presence_penalty
  }

  if (parameterEnabled.seed && config.seed !== null) {
    payload.seed = config.seed
  }

  return payload
}
