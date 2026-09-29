/*
 * LUK 角色酒馆 —— 对局面板
 *
 * 规则：每局 persona.rounds 轮，打满即「游戏失败」，可再来一局。
 * 回复里的 reasoning_content 按 agent 站的习惯收进「深度思考」折叠块，默认收起。
 */
import { ChevronRight, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'

import type { TavernPersona } from '../personas'

type TavernMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  thinking?: boolean
  failed?: boolean
}

let messageSeq = 0

function MessageBubble({ message }: { message: TavernMessage }) {
  const [open, setOpen] = useState(false)

  if (message.role === 'user') {
    return (
      <div className='flex justify-end'>
        <div className='bg-primary text-primary-foreground max-w-[82%] rounded-xl rounded-br-sm px-3 py-2 text-sm whitespace-pre-wrap'>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className='flex justify-start'>
      <div className='bg-muted text-foreground max-w-[85%] rounded-xl rounded-bl-sm px-3 py-2 text-sm'>
        {message.thinking ? (
          <span className='inline-flex items-center gap-1.5 opacity-70'>
            <Loader2 className='h-3 w-3 animate-spin' />
            深度思考中
          </span>
        ) : (
          <>
            {message.reasoning ? (
              <Collapsible open={open} onOpenChange={setOpen} className='mb-2'>
                <CollapsibleTrigger className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs'>
                  <Sparkles className='h-3 w-3' />
                  <span>深度思考</span>
                  <span className='opacity-60'>已完成</span>
                  <ChevronRight
                    className={
                      open
                        ? 'h-3 w-3 rotate-90 transition-transform'
                        : 'h-3 w-3 transition-transform'
                    }
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className='bg-background/60 text-muted-foreground mt-2 rounded-lg border p-2 text-xs whitespace-pre-wrap'>
                  {message.reasoning}
                </CollapsibleContent>
              </Collapsible>
            ) : null}
            <div className='whitespace-pre-wrap'>{message.content}</div>
          </>
        )}
      </div>
    </div>
  )
}

export function TavernArena({ persona }: { persona: TavernPersona }) {
  const [messages, setMessages] = useState<TavernMessage[]>([])
  const [draft, setDraft] = useState('')
  const [used, setUsed] = useState(0)
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const left = persona.rounds - used
  const finished = used >= persona.rounds && !busy

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const reset = useCallback(() => {
    setMessages([])
    setDraft('')
    setUsed(0)
    setBusy(false)
    setMessages([])
  }, [])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || busy || used >= persona.rounds) return

    const history = messages
      .filter((m) => !m.thinking && !m.failed && m.content)
      .map((m) => ({ role: m.role, content: m.content }))

    const userMessage: TavernMessage = {
      id: ++messageSeq,
      role: 'user',
      content: text,
    }
    const placeholder: TavernMessage = {
      id: ++messageSeq,
      role: 'assistant',
      content: '',
      thinking: true,
    }

    setMessages((prev) => [...prev, userMessage, placeholder])
    setDraft('')
    setUsed((n) => n + 1)
    setBusy(true)

    try {
      const res = await fetch(persona.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: persona.model,
          messages: [...history, { role: 'user', content: text }],
        }),
      })
      const data = await res.json().catch(() => null)
      const message = data?.choices?.[0]?.message
      if (!res.ok || !message) {
        throw new Error(data?.error?.message || `HTTP ${res.status}`)
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholder.id
            ? {
                ...m,
                thinking: false,
                content: message.content || '（它什么也没说）',
                reasoning: message.reasoning_content || undefined,
              }
            : m
        )
      )
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholder.id
            ? {
                ...m,
                thinking: false,
                failed: true,
                content: `（上游开小差了：${
                  error instanceof Error ? error.message : String(error)
                }。这一轮不算，再发一次）`,
              }
            : m
        )
      )
      // 上游异常时把这轮退回去，不让用户白掉一次机会
      setUsed((n) => Math.max(0, n - 1))
    } finally {
      setBusy(false)
    }
  }, [busy, draft, messages, persona, used])

  return (
    <Card className='overflow-hidden py-0'>
      <CardHeader className='flex flex-row items-center justify-between gap-3 space-y-0 border-b py-4'>
        <CardTitle className='text-base'>
          {persona.emoji} {persona.title}
        </CardTitle>
        <Badge variant='outline' className='shrink-0'>
          {left > 0 ? `剩余 ${left} / ${persona.rounds} 轮` : '机会已用完'}
        </Badge>
      </CardHeader>

      <CardContent className='p-0'>
        <div
          ref={logRef}
          className='flex h-[380px] flex-col gap-3 overflow-y-auto p-4'
        >
          {messages.length === 0 ? (
            <div className='text-muted-foreground flex flex-1 items-center justify-center gap-2 text-xl'>
              😏 🤡 🍉 🐶 💀 😅
            </div>
          ) : null}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>

        {finished ? (
          <div className='border-t p-6 text-center'>
            <p className='text-destructive text-lg font-bold'>🤡 游戏失败</p>
            <p className='text-muted-foreground mt-1 text-sm'>
              {persona.rounds} 轮用完了，它的人格一点没破。
            </p>
            <Button className='mt-4' onClick={reset}>
              <RotateCcw />
              再来一局
            </Button>
          </div>
        ) : (
          <form
            className='flex gap-2 border-t p-4'
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <Input
              value={draft}
              maxLength={500}
              disabled={busy}
              placeholder='来，和贴吧老哥对线…'
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type='submit' disabled={busy || draft.trim().length === 0}>
              {busy ? <Loader2 className='animate-spin' /> : '发送'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
