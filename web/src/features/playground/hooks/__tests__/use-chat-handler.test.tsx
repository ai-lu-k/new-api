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
import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { sendChatCompletion, sendImageGeneration } from '../../api'
import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../constants'
import type { Message, PlaygroundConfig } from '../../types'
import { useChatHandler } from '../use-chat-handler'

const sendStreamRequest = vi.fn()
const stopStream = vi.fn()

vi.mock('../../api', () => ({
  sendChatCompletion: vi.fn(),
  sendImageGeneration: vi.fn(),
}))

vi.mock('../use-stream-request', () => ({
  useStreamRequest: () => ({
    sendStreamRequest,
    stopStream,
    isStreaming: false,
  }),
}))

const pendingMessages: Message[] = [
  { key: 'user-1', from: 'user', versions: [{ id: 'v1', content: 'a cat' }] },
  {
    key: 'assistant-1',
    from: 'assistant',
    versions: [{ id: 'v1', content: '' }],
    status: 'loading',
  },
]

function renderChatHandler(options: {
  config?: Partial<PlaygroundConfig>
  mode: 'text' | 'image' | 'chat-image'
}) {
  const config: PlaygroundConfig = { ...DEFAULT_CONFIG, ...options.config }

  return renderHook(() => {
    const [messages, setMessages] = useState<Message[]>(pendingMessages)
    const handler = useChatHandler({
      config,
      mode: options.mode,
      parameterEnabled: DEFAULT_PARAMETER_ENABLED,
      onMessageUpdate: setMessages,
    })

    return { messages, sendChat: handler.sendChat }
  })
}

beforeEach(() => {
  vi.mocked(sendChatCompletion).mockReset()
  vi.mocked(sendImageGeneration).mockReset()
  sendStreamRequest.mockReset()
  stopStream.mockReset()
})

describe('useChatHandler text mode', () => {
  test('keeps sending streaming chat completions for a text model', async () => {
    const { result } = renderChatHandler({ mode: 'text' })

    act(() => {
      result.current.sendChat(pendingMessages)
    })

    expect(sendStreamRequest).toHaveBeenCalledTimes(1)
    expect(sendStreamRequest.mock.calls[0][0]).toMatchObject({
      model: DEFAULT_CONFIG.model,
      stream: true,
      messages: [{ role: 'user', content: 'a cat' }],
    })
    expect(sendImageGeneration).not.toHaveBeenCalled()
  })

  test('keeps sending non-streaming chat completions when streaming is off', async () => {
    vi.mocked(sendChatCompletion).mockResolvedValue({
      id: 'chat-1',
      object: 'chat.completion',
      created: 1,
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'meow' },
          finish_reason: 'stop',
        },
      ],
    })

    const { result } = renderChatHandler({
      config: { stream: false },
      mode: 'text',
    })

    act(() => {
      result.current.sendChat(pendingMessages)
    })

    await waitFor(() => {
      expect(sendChatCompletion).toHaveBeenCalledTimes(1)
    })

    expect(vi.mocked(sendChatCompletion).mock.calls[0][0]).toMatchObject({
      model: DEFAULT_CONFIG.model,
      stream: false,
      messages: [{ role: 'user', content: 'a cat' }],
    })
    expect(sendImageGeneration).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(result.current.messages.at(-1)?.versions[0].content).toBe('meow')
    })
  })
})

describe('useChatHandler chat-image mode', () => {
  test('sends a non-streaming chat request for a chat-image model', async () => {
    vi.mocked(sendChatCompletion).mockResolvedValue({
      id: 'chat-image-1',
      object: 'chat.completion',
      created: 1,
      model: 'gemini-3.1-flash-image',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: '![image](data:image/jpeg;base64,QUJD)',
          },
          finish_reason: 'stop',
        },
      ],
    })

    const { result } = renderChatHandler({
      config: { model: 'gemini-3.1-flash-image', stream: true },
      mode: 'chat-image',
    })

    act(() => {
      result.current.sendChat(pendingMessages)
    })

    await waitFor(() => {
      expect(sendChatCompletion).toHaveBeenCalledTimes(1)
    })

    expect(vi.mocked(sendChatCompletion).mock.calls[0][0]).toMatchObject({
      model: 'gemini-3.1-flash-image',
      stream: false,
      messages: [{ role: 'user', content: 'a cat' }],
    })
    expect(sendImageGeneration).not.toHaveBeenCalled()
    expect(sendStreamRequest).not.toHaveBeenCalled()
  })

  test('shows the inline answer as an image instead of raw markdown', async () => {
    vi.mocked(sendChatCompletion).mockResolvedValue({
      id: 'chat-image-2',
      object: 'chat.completion',
      created: 1,
      model: 'gemini-3.1-flash-image',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Here you go\n![image](data:image/jpeg;base64,QUJD)',
          },
          finish_reason: 'stop',
        },
      ],
    })

    const { result } = renderChatHandler({
      config: { model: 'gemini-3.1-flash-image' },
      mode: 'chat-image',
    })

    act(() => {
      result.current.sendChat(pendingMessages)
    })

    await waitFor(() => {
      expect(result.current.messages.at(-1)?.images).toEqual([
        'data:image/jpeg;base64,QUJD',
      ])
    })

    const answer = result.current.messages.at(-1)
    expect(answer?.versions[0].content).toBe('Here you go')
    expect(answer?.versions[0].content).not.toContain('base64')
  })
})

describe('useChatHandler image mode', () => {
  test('requests image generation instead of chat completions', async () => {
    vi.mocked(sendImageGeneration).mockResolvedValue({
      created: 1,
      data: [{ url: 'https://example.com/cat.png' }],
    })

    const { result } = renderChatHandler({
      config: { model: 'gpt-image-2.5-flare-x0.5', image_n: 2 },
      mode: 'image',
    })

    act(() => {
      result.current.sendChat(pendingMessages)
    })

    await waitFor(() => {
      expect(sendImageGeneration).toHaveBeenCalledTimes(1)
    })

    expect(vi.mocked(sendImageGeneration).mock.calls[0][0]).toEqual({
      model: 'gpt-image-2.5-flare-x0.5',
      group: DEFAULT_CONFIG.group,
      prompt: 'a cat',
      n: 2,
    })
    expect(sendChatCompletion).not.toHaveBeenCalled()
    expect(sendStreamRequest).not.toHaveBeenCalled()
  })

  test('stores generated images and a summary on the assistant message', async () => {
    vi.mocked(sendImageGeneration).mockResolvedValue({
      created: 1,
      data: [{ url: 'https://example.com/cat.png' }, { b64_json: 'QUJD' }],
    })

    const { result } = renderChatHandler({ mode: 'image' })

    act(() => {
      result.current.sendChat(pendingMessages)
    })

    await waitFor(() => {
      expect(result.current.messages.at(-1)?.images).toEqual([
        'https://example.com/cat.png',
        'data:image/png;base64,QUJD',
      ])
    })

    expect(result.current.messages.at(-1)?.versions[0].content).toBe(
      'Generated 2 images'
    )
    expect(result.current.messages.at(-1)?.status).toBe('complete')
  })

  test('marks the message as failed when the response carries no image', async () => {
    vi.mocked(sendImageGeneration).mockResolvedValue({ created: 1, data: [] })

    const { result } = renderChatHandler({ mode: 'image' })

    act(() => {
      result.current.sendChat(pendingMessages)
    })

    await waitFor(() => {
      expect(result.current.messages.at(-1)?.status).toBe('error')
    })

    expect(result.current.messages.at(-1)?.images).toBeUndefined()
  })
})
