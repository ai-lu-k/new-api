import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { GatewayRealmCards } from '../components/gateway/realm-cards'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children: React.ReactNode }) => <a>{props.children}</a>,
}))

it('reads the per-realm credit totals from the account list', async () => {
  const calls: string[] = []
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    calls.push(url)
    if (url === '/api/workbuddy/call/health') {
      return {
        data: {
          success: true,
          data: {
            ok: true,
            realm: 'cn',
            accounts: 1,
            accounts_ready: 1,
            accounts_by_realm: { cn: 1 },
            accounts_ready_by_realm: { cn: 1 },
          },
        },
      }
    }
    if (url === '/api/workbuddy/call/realm') {
      return {
        data: {
          success: true,
          data: { current: 'cn', options: ['intl', 'cn'] },
        },
      }
    }
    if (url === '/api/workbuddy/call/accounts') {
      return {
        data: {
          success: true,
          data: {
            accounts: [
              {
                uid: 'a',
                realm: 'cn',
                enabled: true,
                credits: { remain: 1234.5 },
              },
            ],
          },
        },
      }
    }
    return { data: { success: true, data: {} } }
  })
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <GatewayRealmCards />
    </QueryClientProvider>
  )
  await screen.findByText(/1,234\.5 total credits/)
  expect(calls).toContain('/api/workbuddy/call/accounts')
})
