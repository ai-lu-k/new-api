/*
 * 新手教程 —— 路由
 *
 * 访问控制与 /guide 完全一致：这个站的文档入口就是 guide 模块开关，
 * 教程和客户端配置页是同一份读者、同一个权限口径。
 */
import { createFileRoute, redirect } from '@tanstack/react-router'

import { Tutorial } from '@/features/tutorial'
import { getModuleAccessForGuard } from '@/lib/nav-modules'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/tutorial/')({
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
  component: Tutorial,
})
