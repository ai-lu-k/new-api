/*
 * 快速开始已并入教程：旧地址保留为重定向，书签和外部链接不会 404。
 */
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/guide/')({
  beforeLoad: () => {
    throw redirect({ to: '/tutorial', hash: 'step-clients' })
  },
})
