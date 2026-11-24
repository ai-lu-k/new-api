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
import { describe, expect, test } from 'vitest'

import { DEFAULT_CONFIG } from '../../../constants'
import type { Message, ModelOption, PlaygroundConfig } from '../../../types'
import {
  buildImageGenerationRequest,
  clampImageCount,
  getImageGenerationImages,
  getImageGenerationPrompt,
  getPlaygroundModelMode,
} from '../model-mode'

const models: ModelOption[] = [
  {
    label: 'gpt-4o',
    value: 'gpt-4o',
    category: 'Text',
    isImageGeneration: false,
    isImageOutput: false,
  },
  {
    label: 'gpt-image-2.5-flare-x0.5',
    value: 'gpt-image-2.5-flare-x0.5',
    category: 'Image',
    isImageGeneration: true,
    isImageOutput: true,
  },
  // Image-output model served through chat completions: listed in
  // `image_output_models` only, so it must switch to chat-image mode.
  {
    label: 'gemini-3.1-flash-image',
    value: 'gemini-3.1-flash-image',
    category: 'Image',
    isImageGeneration: false,
    isImageOutput: true,
  },
]

function configWith(overrides: Partial<PlaygroundConfig>): PlaygroundConfig {
  return { ...DEFAULT_CONFIG, ...overrides }
}

function userMessage(content: string): Message {
  return {
    key: `user-${content}`,
    from: 'user',
    versions: [{ id: 'v1', content }],
  }
}

describe('getPlaygroundModelMode', () => {
  test('treats a model listed as image generation as image mode', () => {
    expect(getPlaygroundModelMode(models, 'gpt-image-2.5-flare-x0.5')).toBe(
      'image'
    )
  })

  test('treats an image-output model that is only served through chat as chat-image mode', () => {
    expect(getPlaygroundModelMode(models, 'gemini-3.1-flash-image')).toBe(
      'chat-image'
    )
  })

  test('keeps a text model in text mode', () => {
    expect(getPlaygroundModelMode(models, 'gpt-4o')).toBe('text')
  })

  test('falls back to text mode for a model without any modality metadata', () => {
    expect(getPlaygroundModelMode(models, 'unknown-model')).toBe('text')
  })

  test('falls back to text mode when the model list is empty', () => {
    expect(getPlaygroundModelMode([], 'gpt-image-2.5-flare-x0.5')).toBe('text')
  })

  test('prefers image mode when a model is both a direct and a chat image model', () => {
    const both: ModelOption[] = [
      {
        label: 'dual-image',
        value: 'dual-image',
        category: 'Image',
        isImageGeneration: true,
        isImageOutput: true,
      },
    ]

    expect(getPlaygroundModelMode(both, 'dual-image')).toBe('image')
  })
})

describe('buildImageGenerationRequest', () => {
  test('omits size and quality when they are blank', () => {
    const request = buildImageGenerationRequest(
      'a cat',
      configWith({
        model: 'gpt-image-2.5-flare-x0.5',
        group: 'default',
        image_size: '',
        image_quality: '',
        image_n: 2,
      })
    )

    expect(request).toEqual({
      model: 'gpt-image-2.5-flare-x0.5',
      group: 'default',
      prompt: 'a cat',
      n: 2,
    })
    expect('size' in request).toBe(false)
    expect('quality' in request).toBe(false)
  })

  test('carries size and quality when the user picked them', () => {
    const request = buildImageGenerationRequest(
      'a dog',
      configWith({
        model: 'gpt-image-2.5-flare-x0.5',
        image_size: '1536x1024',
        image_quality: 'high',
        image_n: 3,
      })
    )

    expect(request.size).toBe('1536x1024')
    expect(request.quality).toBe('high')
    expect(request.n).toBe(3)
  })

  test('omits the group when none is selected', () => {
    const request = buildImageGenerationRequest(
      'a bird',
      configWith({ group: '', image_n: 1 })
    )

    expect('group' in request).toBe(false)
    expect(request.n).toBe(1)
  })
})

describe('clampImageCount', () => {
  test('clamps counts into the supported range', () => {
    expect(clampImageCount(0)).toBe(1)
    expect(clampImageCount(99)).toBe(10)
    expect(clampImageCount(Number.NaN)).toBe(1)
  })
})

describe('getImageGenerationImages', () => {
  test('keeps urls and converts base64 payloads into data urls', () => {
    const images = getImageGenerationImages({
      created: 1,
      data: [
        { url: 'https://example.com/a.png' },
        { b64_json: 'QUJD' },
        { revised_prompt: 'ignored' },
      ],
    })

    expect(images).toEqual([
      'https://example.com/a.png',
      'data:image/png;base64,QUJD',
    ])
  })

  test('returns no images when the response carries none', () => {
    expect(getImageGenerationImages({ created: 1, data: [] })).toEqual([])
  })
})

describe('getImageGenerationPrompt', () => {
  test('uses only the latest user turn as the prompt', () => {
    const messages: Message[] = [
      userMessage('first prompt'),
      {
        key: 'assistant-1',
        from: 'assistant',
        versions: [{ id: 'v1', content: 'Generated 1 image' }],
      },
      userMessage('second prompt'),
      {
        key: 'assistant-2',
        from: 'assistant',
        versions: [{ id: 'v1', content: '' }],
        status: 'loading',
      },
    ]

    expect(getImageGenerationPrompt(messages)).toBe('second prompt')
  })

  test('returns an empty prompt when the conversation has no user turn', () => {
    expect(getImageGenerationPrompt([])).toBe('')
  })
})
