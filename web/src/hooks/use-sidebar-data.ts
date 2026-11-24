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
import {
  Activity,
  Bot,
  Box,
  ChartColumn,
  ClipboardList,
  CreditCard,
  FileText,
  Filter,
  FlaskConical,
  Gift,
  Key,
  LayoutDashboard,
  MessageSquare,
  MessageSquareText,
  PlugZap,
  Radio,
  ServerCog,
  Settings,
  ShieldCheck,
  Terminal,
  Ticket,
  User,
  Users,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { SidebarData } from '@/components/layout/types'
import { ROLE } from '@/lib/roles'

/**
 * The sidebar groups that make up a signed-in reader's own workspace, in the
 * order the sidebar shows them. The bar's folded menu lists the same pages.
 */
export const WORKSPACE_GROUP_IDS = ['build', 'finance', 'account']

/**
 * Root navigation groups for the application sidebar.
 *
 * These are shown when the URL does not match any nested sidebar view
 * registered in `layout/lib/sidebar-view-registry.ts`.
 */
export function useSidebarData(): SidebarData {
  const { t } = useTranslation()

  return {
    navGroups: [
      {
        id: 'chat',
        title: t('Testing'),
        items: [
          {
            title: t('Model Test'),
            url: '/playground',
            icon: FlaskConical,
          },
          {
            title: t('Chat'),
            icon: MessageSquare,
            type: 'chat-presets',
          },
        ],
      },
      {
        id: 'build',
        title: t('Build & Use'),
        items: [
          {
            title: t('Overview'),
            url: '/dashboard/overview',
            icon: Activity,
          },
          {
            title: t('Dashboard'),
            url: '/dashboard/models',
            // The analysis workspace has sibling sections under the same row:
            // models, flow and the admin one. Any of them keeps the row lit.
            activeUrls: ['/dashboard/models', '/dashboard/flow'],
            icon: LayoutDashboard,
          },
          {
            title: t('API Keys'),
            url: '/keys',
            icon: Key,
          },
          {
            title: t('Usage Logs'),
            url: '/usage-logs/common',
            icon: FileText,
          },
          {
            title: t('Audit Logs'),
            url: '/usage-logs/audit',
            icon: ClipboardList,
          },
        ],
      },
      {
        id: 'finance',
        title: t('Finance'),
        items: [
          {
            title: t('Top-up'),
            url: '/wallet',
            icon: Wallet,
          },
          {
            title: t('Referral Program'),
            url: '/referral',
            icon: Gift,
          },
        ],
      },
      {
        id: 'account',
        title: t('Account & Security'),
        items: [
          {
            title: t('Feedback and tickets'),
            url: '/tickets',
            icon: MessageSquareText,
          },
          {
            title: t('Settings'),
            url: '/profile',
            icon: User,
          },
          {
            title: t('Security & Access'),
            url: '/security',
            icon: ShieldCheck,
          },
        ],
      },
      {
        id: 'admin',
        title: t('Admin'),
        items: [
          {
            title: t('Channels'),
            url: '/channels',
            icon: Radio,
          },
          {
            title: t('Models'),
            url: '/models/metadata',
            icon: Box,
          },
          {
            title: t('Users'),
            url: '/users',
            icon: Users,
          },
          {
            title: t('Ticket queue'),
            url: '/ticket-queue',
            icon: MessageSquareText,
          },
          {
            title: t('Token Plan'),
            url: '/token-plan',
            icon: ChartColumn,
          },
          {
            title: t('Redemption Codes'),
            url: '/redemption-codes',
            icon: Ticket,
          },
          {
            title: t('Subscriptions'),
            url: '/subscriptions',
            icon: CreditCard,
          },
          {
            title: t('System Info'),
            url: '/system-info',
            icon: ServerCog,
            requiredRole: ROLE.SUPER_ADMIN,
          },
          {
            title: t('Task Plugins'),
            url: '/task-plugins',
            icon: PlugZap,
            requiredRole: ROLE.SUPER_ADMIN,
          },
          {
            title: t('System Settings'),
            url: '/system-settings/site',
            activeUrls: ['/system-settings'],
            icon: Settings,
          },
          {
            title: t('Operations info'),
            url: '/finance',
            icon: ChartColumn,
            requiredRole: ROLE.SUPER_ADMIN,
          },
          {
            title: t('Request funnel'),
            url: '/relay-funnel',
            icon: Filter,
            requiredRole: ROLE.SUPER_ADMIN,
          },
          {
            title: t('WorkBuddy'),
            url: '/workbuddy',
            icon: Bot,
            requiredRole: ROLE.SUPER_ADMIN,
          },
          {
            title: t('CommandCode'),
            url: '/commandcode',
            icon: Terminal,
            requiredRole: ROLE.SUPER_ADMIN,
          },
        ],
      },
    ],
  }
}
