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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { UsageLevelCard } from '../components/usage-level-card'

let client: QueryClient
let fresh: AuthUser

beforeEach(async () => {
  await i18next.changeLanguage('en')
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...useSystemConfigStore.getState().config.currency,
      quotaDisplayType: 'CNY',
      usdExchangeRate: 1,
    },
  })
  fresh = {
    id: 1,
    username: 'gift-user',
    role: 1,
    quota: 50_000_000,
    used_quota: 11_800_000,
    request_count: 10,
    usage_level: {
      level: 2,
      next_level_quota: 25_000_000,
      remaining_quota: 13_200_000,
      progress: 34,
    },
  }
  useAuthStore.getState().auth.setUser(fresh)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/self') {
      return { data: { success: true, data: fresh } }
    }
    if (url === '/api/status') {
      return {
        data: {
          success: true,
          data: {
            usage_level_thresholds: [
              0, 1, 5_000_000, 25_000_000, 100_000_000, 500_000_000,
              2_500_000_000,
            ],
          },
        },
      }
    }
    throw new Error('Unexpected API request')
  })
})

afterEach(async () => {
  client.clear()
  useAuthStore.getState().auth.reset()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  vi.restoreAllMocks()
  await i18next.changeLanguage('en')
})

describe('consumption level card', () => {
  it('shows gifted consumption, the next milestone and accessible stage progress', async () => {
    render(
      <QueryClientProvider client={client}>
        <UsageLevelCard />
      </QueryClientProvider>
    )
    expect(screen.getByText('¥23.6')).toBeVisible()
    expect(screen.getByText('Consume ¥26.4 more to reach LV3')).toBeVisible()
    expect(
      screen.getByRole('progressbar', { name: 'Level progress' })
    ).toHaveAttribute('aria-valuenow', '34')
    await waitFor(() =>
      expect(
        screen.getByRole('list', { name: 'Level thresholds' })
      ).toBeVisible()
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByText('First consumption')).toBeVisible()
  })

  it('keeps an unused gifted balance at LV0 and explains the first-use milestone', () => {
    useAuthStore.getState().auth.setUser({
      ...fresh,
      used_quota: 0,
      usage_level: {
        level: 0,
        next_level_quota: 1,
        remaining_quota: 1,
        progress: 0,
      },
    })
    render(
      <QueryClientProvider client={client}>
        <UsageLevelCard />
      </QueryClientProvider>
    )
    expect(
      screen.getByText('Your first consumption unlocks LV1.')
    ).toBeVisible()
    expect(
      screen.getByRole('progressbar', { name: 'Level progress' })
    ).toHaveAttribute('aria-valuenow', '0')
  })

  it('shows the highest level without an unreachable next milestone', () => {
    fresh = {
      ...fresh,
      used_quota: 2_500_000_000,
      usage_level: {
        level: 6,
        next_level_quota: null,
        remaining_quota: 0,
        progress: 100,
      },
    }
    useAuthStore.getState().auth.setUser(fresh)
    render(
      <QueryClientProvider client={client}>
        <UsageLevelCard />
      </QueryClientProvider>
    )
    expect(screen.getByText('Highest level reached')).toBeVisible()
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '100'
    )
    expect(screen.queryByText(/more to reach/)).not.toBeInTheDocument()
  })

  it('notifies an observed upgrade once and applies refunds without an upgrade toast', async () => {
    const notify = vi.spyOn(toast, 'success')
    fresh = {
      ...fresh,
      used_quota: 4_500_000,
      usage_level: {
        level: 1,
        next_level_quota: 5_000_000,
        remaining_quota: 500_000,
        progress: 90,
      },
    }
    useAuthStore.getState().auth.setUser(fresh)
    render(
      <QueryClientProvider client={client}>
        <UsageLevelCard />
      </QueryClientProvider>
    )
    await waitFor(() =>
      expect(client.getQueryState(['usage-level', 1])?.status).toBe('success')
    )
    fresh = {
      ...fresh,
      used_quota: 5_000_000,
      usage_level: {
        level: 2,
        next_level_quota: 25_000_000,
        remaining_quota: 20_000_000,
        progress: 0,
      },
    }
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['usage-level', 1] })
    })
    await waitFor(() => expect(notify).toHaveBeenCalledWith('You reached LV2'))
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['usage-level', 1] })
    })
    expect(notify).toHaveBeenCalledTimes(1)
    fresh = {
      ...fresh,
      used_quota: 4_500_000,
      usage_level: {
        level: 1,
        next_level_quota: 5_000_000,
        remaining_quota: 500_000,
        progress: 90,
      },
    }
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['usage-level', 1] })
    })
    await waitFor(() =>
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '90'
      )
    )
    expect(useAuthStore.getState().auth.user?.usage_level?.level).toBe(1)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('does not apply a delayed response to a different signed-in account', async () => {
    let resolve!: (value: unknown) => void
    const delayed = new Promise((done) => {
      resolve = done
    })
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/user/self') {
        return (await delayed) as Awaited<ReturnType<typeof api.get>>
      }
      return { data: { success: true, data: {} } }
    })
    render(
      <QueryClientProvider client={client}>
        <UsageLevelCard />
      </QueryClientProvider>
    )
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/user/self'))
    act(() => {
      useAuthStore
        .getState()
        .auth.setUser({ id: 2, username: 'other-user', role: 1, used_quota: 0 })
    })
    await act(async () => {
      resolve({ data: { success: true, data: fresh } })
      await delayed
    })
    expect(useAuthStore.getState().auth.user?.id).toBe(2)
    expect(useAuthStore.getState().auth.user?.used_quota).toBe(0)
    expect(
      screen.queryByRole('heading', { name: 'Usage level' })
    ).not.toBeInTheDocument()
  })

  it('updates translated labels and valid locale formatting when switching Chinese variants', async () => {
    i18next.addResourceBundle('zhCN', 'translation', zh.translation, true, true)
    i18next.addResourceBundle(
      'zhTW',
      'translation',
      zhTW.translation,
      true,
      true
    )
    render(
      <QueryClientProvider client={client}>
        <UsageLevelCard />
      </QueryClientProvider>
    )
    await act(async () => {
      await i18next.changeLanguage('zhCN')
    })
    expect(screen.getByRole('heading', { name: '使用等级' })).toBeVisible()
    await act(async () => {
      await i18next.changeLanguage('zhTW')
    })
    expect(screen.getByRole('heading', { name: '使用等級' })).toBeVisible()
    expect(
      screen.getByRole('progressbar', { name: '升級進度' })
    ).toHaveAttribute('aria-valuenow', '34')
  })
})
