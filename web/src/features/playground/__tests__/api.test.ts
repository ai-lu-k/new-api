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
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { getUserModels, sendChatCompletion, sendImageGeneration } from '../api'

const post = vi.fn()
const get = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}))

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

describe('getUserModels', () => {
  test('groups chat-image models as image models while keeping them off the image endpoint', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: ['gpt-4o', 'gpt-image-2.5-flare-x0.5', 'gemini-3.1-flash-image'],
        image_generation_models: ['gpt-image-2.5-flare-x0.5'],
        image_output_models: [
          'gpt-image-2.5-flare-x0.5',
          'gemini-3.1-flash-image',
        ],
      },
    })

    const models = await getUserModels('default')

    expect(models).toEqual([
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
      {
        label: 'gemini-3.1-flash-image',
        value: 'gemini-3.1-flash-image',
        category: 'Image',
        isImageGeneration: false,
        isImageOutput: true,
      },
    ])
  })

  test('treats every model as a text model when the fields are missing', async () => {
    get.mockResolvedValue({
      data: { success: true, data: ['gpt-4o'] },
    })

    await expect(getUserModels('default')).resolves.toEqual([
      {
        label: 'gpt-4o',
        value: 'gpt-4o',
        category: 'Text',
        isImageGeneration: false,
        isImageOutput: false,
      },
    ])
  })
})

describe('sendChatCompletion', () => {
  test('posts a chat-image request to the playground chat endpoint', async () => {
    post.mockResolvedValue({
      data: {
        id: 'chat-image-1',
        object: 'chat.completion',
        created: 1,
        model: 'gemini-3.1-flash-image',
        choices: [],
      },
    })

    await sendChatCompletion({
      model: 'gemini-3.1-flash-image',
      messages: [{ role: 'user', content: 'a cat' }],
      stream: false,
    })

    expect(post).toHaveBeenCalledWith(
      '/pg/chat/completions',
      {
        model: 'gemini-3.1-flash-image',
        messages: [{ role: 'user', content: 'a cat' }],
        stream: false,
      },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })
})

describe('sendImageGeneration', () => {
  test('posts the image body to the playground image endpoint', async () => {
    post.mockResolvedValue({
      data: { created: 1, data: [{ url: 'https://example.com/a.png' }] },
    })

    await sendImageGeneration({
      model: 'gpt-image-2.5-flare-x0.5',
      prompt: 'a cat',
      n: 1,
    })

    expect(post).toHaveBeenCalledWith(
      '/pg/images/generations',
      { model: 'gpt-image-2.5-flare-x0.5', prompt: 'a cat', n: 1 },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })
})
