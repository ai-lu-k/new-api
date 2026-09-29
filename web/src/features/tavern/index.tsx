/*
 * LUK 角色酒馆 —— 页面
 *
 * 走 newapi 公共页规范：PublicLayout + PageTransition，这样顶部菜单栏会保留，
 * 和「模型广场」是同一套壳子。
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

import { TavernArena } from './components/tavern-arena'
import { TAVERN_PERSONAS, type TavernPersona } from './personas'

function PersonaCard({
  persona,
  active,
  onStart,
}: {
  persona: TavernPersona
  active: boolean
  onStart: () => void
}) {
  return (
    <Card className='py-0'>
      <CardContent className='flex flex-wrap items-center gap-4 p-4'>
        <span className='text-3xl leading-none' aria-hidden='true'>
          {persona.emoji}
        </span>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-semibold'>{persona.name}</span>
            <span className='bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[11px] font-medium'>
              {persona.title}
            </span>
          </div>
          <p className='text-muted-foreground mt-1 text-sm'>{persona.desc}</p>
        </div>
        <Button variant='outline' disabled={active} onClick={onStart}>
          {active ? '对话进行中' : '开始对话'}
        </Button>
      </CardContent>
    </Card>
  )
}

export function Tavern() {
  const { t } = useTranslation()
  // 目前只有一个人格，直接开局；以后多了就让人自己点
  const [activeId, setActiveId] = useState<string | null>(
    TAVERN_PERSONAS.length === 1 ? TAVERN_PERSONAS[0].id : null
  )

  const active = useMemo(
    () => TAVERN_PERSONAS.find((p) => p.id === activeId) ?? null,
    [activeId]
  )

  return (
    <PublicLayout>
      <PageTransition>
        <div className='mx-auto w-full max-w-4xl px-4 py-8 md:py-12'>
          <header className='mb-6'>
            <h1 className='text-2xl font-bold tracking-tight'>
              🍺 {t('Role Tavern')}
            </h1>
            <p className='text-muted-foreground mt-2 text-sm'>
              {t('Pick a persona and have a go at it.')}
            </p>
          </header>

          <div className='space-y-3'>
            {TAVERN_PERSONAS.map((persona) => (
              <PersonaCard
                key={persona.id}
                persona={persona}
                active={persona.id === activeId}
                onStart={() => setActiveId(persona.id)}
              />
            ))}
          </div>

          {active ? (
            <div className='mt-4'>
              <TavernArena key={active.id} persona={active} />
            </div>
          ) : null}
        </div>
      </PageTransition>
    </PublicLayout>
  )
}
