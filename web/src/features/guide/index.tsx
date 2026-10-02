/*
 * LUK 快速开始 —— 教程页
 *
 * 走 newapi 公共页规范：PublicLayout + PageTransition，和「模型广场」是同一套
 * 壳子，顶部菜单栏自然保留；导航项由 useTopNavLinks 生成。
 *
 * 内容和首页「快速开始」下面那一段是同一个组件：一排子导航，每个 agent 一栏。
 */
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'

import { QuickStart } from './components/quick-start'

export function Guide() {
  const { t } = useTranslation()
  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition>
        <h1 className='px-4 pt-24 pb-6 text-center text-2xl font-bold tracking-tight md:pt-28'>
          {t('Quick Start')}
        </h1>
        <QuickStart />
      </PageTransition>
    </PublicLayout>
  )
}
