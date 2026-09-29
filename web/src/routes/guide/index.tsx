/*
 * LUK 快速开始 —— 路由
 *
 * 可被 HeaderNavModules 的 guide 开关控制，可要求登录。
 */
import { createFileRoute, redirect } from '@tanstack/react-router'

import { Guide } from '@/features/guide'
import { getModuleAccessForGuard } from '@/lib/nav-modules'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/guide/')({
  beforeLoad: async ({ context, location }) => {
    const access = await getModuleAccessForGuard(context.queryClient, 'guide')
    if (!access.enabled) {
      throw redirect({ to: '/' })
    }
    if (access.requireAuth) {
      const { auth } = useAuthStore.getState()
      if (!auth.user) {
        throw redirect({
          to: '/sign-in',
          search: { redirect: location.href },
        })
      }
    }
  },
  component: Guide,
})
