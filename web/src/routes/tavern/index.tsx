/*
 * LUK 角色酒馆 —— 路由
 *
 * 和 /pricing 同一套写法：可被 HeaderNavModules 开关控制，可要求登录。
 */
import { createFileRoute, redirect } from '@tanstack/react-router'

import { Tavern } from '@/features/tavern'
import { getModuleAccessForGuard } from '@/lib/nav-modules'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/tavern/')({
  beforeLoad: async ({ context, location }) => {
    const access = await getModuleAccessForGuard(context.queryClient, 'tavern')
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
  component: Tavern,
})
