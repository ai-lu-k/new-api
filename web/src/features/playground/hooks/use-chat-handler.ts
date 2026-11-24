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
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { handleServerError } from '@/lib/handle-server-error'

import { sendChatCompletion, sendImageGeneration } from '../api'
import { ERROR_MESSAGES } from '../constants'
import {
  applyChatCompletionResponse,
  applyChatImageResponse,
  applyImageGenerationResponse,
  applyStreamingChunk,
  buildChatCompletionPayload,
  buildImageGenerationRequest,
  completeAssistantMessage,
  getImageGenerationImages,
  getImageGenerationPrompt,
  hasChatCompletionChoice,
  isAssistantMessageFinal,
  isAssistantMessagePending,
  parseRequestErrorDetails,
  updateAssistantMessageWithError,
  updateLastAssistantMessage,
  type PlaygroundModelMode,
} from '../lib'
import type { Message, PlaygroundConfig, ParameterEnabled } from '../types'
import { useStreamRequest } from './use-stream-request'

type MessageUpdater = (message: Message) => Message

interface UseChatHandlerOptions {
  config: PlaygroundConfig
  mode: PlaygroundModelMode
  parameterEnabled: ParameterEnabled
  onMessageUpdate: (updater: (prev: Message[]) => Message[]) => void
}

const KNOWN_ERROR_MESSAGES = new Set<string>(Object.values(ERROR_MESSAGES))
const STREAM_UPDATE_FLUSH_MS = 50

type PendingStreamChunks = {
  generation: number
  content: string
  reasoning: string
}

function mergePendingStreamChunk(
  currentChunk: string,
  nextChunk: string
): string {
  if (!currentChunk || !nextChunk.startsWith(currentChunk)) {
    return currentChunk + nextChunk
  }

  return nextChunk
}

/**
 * Hook for handling chat message sending and receiving
 */
export function useChatHandler({
  config,
  mode,
  parameterEnabled,
  onMessageUpdate,
}: UseChatHandlerOptions) {
  const { t } = useTranslation()
  const { sendStreamRequest, stopStream, isStreaming } = useStreamRequest()
  const [isRequesting, setIsRequesting] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestGenerationRef = useRef(0)
  const pendingStreamChunksRef = useRef<PendingStreamChunks>({
    generation: 0,
    content: '',
    reasoning: '',
  })
  const streamFlushTimerRef = useRef<number | null>(null)

  const discardPendingStreamUpdates = useCallback((generation: number) => {
    if (streamFlushTimerRef.current !== null) {
      window.clearTimeout(streamFlushTimerRef.current)
      streamFlushTimerRef.current = null
    }
    pendingStreamChunksRef.current = {
      generation,
      content: '',
      reasoning: '',
    }
  }, [])

  const flushStreamUpdates = useCallback(
    (generation: number) => {
      if (generation !== requestGenerationRef.current) return
      if (streamFlushTimerRef.current !== null) {
        window.clearTimeout(streamFlushTimerRef.current)
        streamFlushTimerRef.current = null
      }

      const pendingChunks = pendingStreamChunksRef.current
      if (pendingChunks.generation !== generation) return
      if (!pendingChunks.reasoning && !pendingChunks.content) {
        return
      }

      pendingStreamChunksRef.current = {
        generation,
        content: '',
        reasoning: '',
      }
      onMessageUpdate((prev) => {
        if (generation !== requestGenerationRef.current) return prev
        return updateLastAssistantMessage(prev, (message) => {
          let updatedMessage = message

          if (pendingChunks.reasoning) {
            updatedMessage = applyStreamingChunk(
              updatedMessage,
              'reasoning',
              pendingChunks.reasoning
            )
          }

          if (pendingChunks.content) {
            updatedMessage = applyStreamingChunk(
              updatedMessage,
              'content',
              pendingChunks.content
            )
          }

          return updatedMessage
        })
      })
    },
    [onMessageUpdate]
  )

  const scheduleStreamFlush = useCallback(
    (generation: number) => {
      if (generation !== requestGenerationRef.current) return
      if (streamFlushTimerRef.current !== null) {
        return
      }

      streamFlushTimerRef.current = window.setTimeout(() => {
        flushStreamUpdates(generation)
      }, STREAM_UPDATE_FLUSH_MS)
    },
    [flushStreamUpdates]
  )

  useEffect(
    () => () => {
      requestGenerationRef.current += 1
      if (streamFlushTimerRef.current !== null) {
        window.clearTimeout(streamFlushTimerRef.current)
      }
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
    },
    []
  )

  const getDisplayError = useCallback(
    (error: string) => {
      if (KNOWN_ERROR_MESSAGES.has(error)) {
        return t(error)
      }

      const connectionClosedSuffix = `: ${ERROR_MESSAGES.CONNECTION_CLOSED}`
      if (error.endsWith(connectionClosedSuffix)) {
        return `${error.slice(0, -ERROR_MESSAGES.CONNECTION_CLOSED.length)}${t(
          ERROR_MESSAGES.CONNECTION_CLOSED
        )}`
      }

      return error
    },
    [t]
  )

  // Handle stream update
  const handleStreamUpdate = useCallback(
    (generation: number, type: 'reasoning' | 'content', chunk: string) => {
      if (generation !== requestGenerationRef.current) return
      if (pendingStreamChunksRef.current.generation !== generation) return
      pendingStreamChunksRef.current[type] = mergePendingStreamChunk(
        pendingStreamChunksRef.current[type],
        chunk
      )
      scheduleStreamFlush(generation)
    },
    [scheduleStreamFlush]
  )

  // Handle stream complete
  const handleStreamComplete = useCallback(
    (generation: number) => {
      if (generation !== requestGenerationRef.current) return
      flushStreamUpdates(generation)
      setIsRequesting(false)
      onMessageUpdate((prev) => {
        if (generation !== requestGenerationRef.current) return prev
        return updateLastAssistantMessage(prev, (message) =>
          isAssistantMessageFinal(message)
            ? message
            : completeAssistantMessage(message)
        )
      })
    },
    [flushStreamUpdates, onMessageUpdate]
  )

  // Handle stream error
  const handleStreamError = useCallback(
    (generation: number, error: string, errorCode?: string) => {
      if (generation !== requestGenerationRef.current) return
      flushStreamUpdates(generation)
      setIsRequesting(false)
      const displayError = getDisplayError(error)
      handleServerError(new Error(displayError))
      const errorTitle = t(ERROR_MESSAGES.API_REQUEST_ERROR)
      onMessageUpdate((prev) => {
        if (generation !== requestGenerationRef.current) return prev
        return updateAssistantMessageWithError(
          prev,
          displayError,
          errorCode,
          errorTitle
        )
      })
    },
    [flushStreamUpdates, getDisplayError, onMessageUpdate, t]
  )

  // Send streaming chat request
  const sendStreamingChat = useCallback(
    (messages: Message[]) => {
      const generation = requestGenerationRef.current + 1
      requestGenerationRef.current = generation
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      discardPendingStreamUpdates(generation)
      setIsRequesting(true)
      const payload = buildChatCompletionPayload(
        messages,
        config,
        parameterEnabled,
        mode
      )
      void sendStreamRequest(
        payload,
        (type, chunk) => handleStreamUpdate(generation, type, chunk),
        () => handleStreamComplete(generation),
        (error, errorCode) => handleStreamError(generation, error, errorCode)
      )
    },
    [
      config,
      mode,
      parameterEnabled,
      sendStreamRequest,
      discardPendingStreamUpdates,
      handleStreamUpdate,
      handleStreamComplete,
      handleStreamError,
    ]
  )

  // Run one non-streaming request and apply its result to the pending message.
  // Both chat completions and image generation share this generation counter,
  // abort controller and error handling.
  const runNonStreamingRequest = useCallback(
    async (
      request: (signal: AbortSignal) => Promise<MessageUpdater | null>
    ) => {
      const generation = requestGenerationRef.current + 1
      const abortController = new AbortController()

      requestGenerationRef.current = generation
      stopStream()
      discardPendingStreamUpdates(generation)
      abortControllerRef.current?.abort()
      abortControllerRef.current = abortController

      try {
        setIsRequesting(true)
        const applyResponse = await request(abortController.signal)
        if (
          abortController.signal.aborted ||
          requestGenerationRef.current !== generation
        ) {
          return
        }

        if (!applyResponse) {
          handleStreamError(generation, ERROR_MESSAGES.API_REQUEST_ERROR)
          return
        }

        onMessageUpdate((prev) => {
          if (requestGenerationRef.current !== generation) return prev
          return updateLastAssistantMessage(prev, applyResponse)
        })
      } catch (error: unknown) {
        if (
          abortController.signal.aborted ||
          requestGenerationRef.current !== generation
        ) {
          return
        }

        const { errorCode, errorMessage } = parseRequestErrorDetails(error)
        handleStreamError(generation, errorMessage, errorCode)
      } finally {
        if (requestGenerationRef.current === generation) {
          abortControllerRef.current = null
          setIsRequesting(false)
        }
      }
    },
    [
      stopStream,
      discardPendingStreamUpdates,
      onMessageUpdate,
      handleStreamError,
    ]
  )

  // Send non-streaming chat request
  const sendNonStreamingChat = useCallback(
    (messages: Message[]) =>
      runNonStreamingRequest(async (signal) => {
        const response = await sendChatCompletion(
          buildChatCompletionPayload(messages, config, parameterEnabled, mode),
          signal
        )

        if (!hasChatCompletionChoice(response)) {
          return null
        }

        // A chat-image model answers with a markdown image whose source is a
        // megabyte of base64. Lift those out into the image list so the message
        // shows a picture instead of raw markdown the renderer refuses to parse.
        if (mode === 'chat-image') {
          const content = response.choices[0]?.message?.content ?? ''

          return (message) =>
            applyChatImageResponse(message, content) ??
            applyChatCompletionResponse(message, response) ??
            message
        }

        return (message) =>
          applyChatCompletionResponse(message, response) ?? message
      }),
    [config, mode, parameterEnabled, runNonStreamingRequest]
  )

  // Send image generation request. Only the latest user turn is used as the
  // prompt, and the endpoint never streams.
  const sendImageGenerationRequest = useCallback(
    (messages: Message[]) =>
      runNonStreamingRequest(async (signal) => {
        const response = await sendImageGeneration(
          buildImageGenerationRequest(
            getImageGenerationPrompt(messages),
            config
          ),
          signal
        )
        const images = getImageGenerationImages(response)

        if (images.length === 0) {
          return null
        }

        return (message) => applyImageGenerationResponse(message, images)
      }),
    [config, runNonStreamingRequest]
  )

  // Send request. Direct image generation bypasses chat completions entirely;
  // chat-image models keep the chat flow but never stream.
  const sendChat = useCallback(
    (messages: Message[]) => {
      if (mode === 'image') {
        sendImageGenerationRequest(messages)
        return
      }

      if (mode === 'text' && config.stream) {
        sendStreamingChat(messages)
        return
      }

      sendNonStreamingChat(messages)
    },
    [
      mode,
      config.stream,
      sendImageGenerationRequest,
      sendStreamingChat,
      sendNonStreamingChat,
    ]
  )

  // Stop generation
  const stopGeneration = useCallback(() => {
    const stoppedGeneration = requestGenerationRef.current
    flushStreamUpdates(stoppedGeneration)
    const idleGeneration = stoppedGeneration + 1
    requestGenerationRef.current = idleGeneration
    discardPendingStreamUpdates(idleGeneration)
    stopStream()
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsRequesting(false)
    onMessageUpdate((prev) => {
      if (requestGenerationRef.current !== idleGeneration) return prev
      return updateLastAssistantMessage(prev, (message) =>
        isAssistantMessagePending(message)
          ? completeAssistantMessage(message)
          : message
      )
    })
  }, [
    stopStream,
    flushStreamUpdates,
    discardPendingStreamUpdates,
    onMessageUpdate,
  ])

  return {
    sendChat,
    stopGeneration,
    isGenerating: isStreaming || isRequesting,
  }
}
