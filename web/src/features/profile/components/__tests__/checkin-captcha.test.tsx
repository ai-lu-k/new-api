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
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { CheckinCalendarCard } from '../checkin-calendar-card'

const verify = vi.hoisted(() => vi.fn())

vi.mock('@/features/auth/hooks/use-geetest', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/auth/hooks/use-geetest')>()
  return { ...actual, useGeetest: () => ({ verify }) }
})

const solution = {
  lot_number: 'lot-1',
  captcha_output: 'output',
  pass_token: 'pass-token',
  gen_time: '1700000000',
}

let client: QueryClient

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        enabled: true,
        min_quota: 1000,
        max_quota: 10000,
        stats: { checked_in_today: false, total_checkins: 0, total_quota: 0 },
      },
    },
  } as never)
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: { quota_awarded: 1000 } },
  } as never)
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

function renderCard(geetestCaptchaId?: string) {
  return render(
    <QueryClientProvider client={client}>
      <CheckinCalendarCard
        checkinEnabled
        turnstileEnabled={false}
        turnstileSiteKey=''
        geetestCaptchaId={geetestCaptchaId}
      />
    </QueryClientProvider>
  )
}

describe('check-in human verification', () => {
  it('sends the solved challenge with the check-in request', async () => {
    verify.mockResolvedValue(solution)
    const user = userEvent.setup()
    renderCard('captcha-id')

    await user.click(
      await screen.findByRole('button', { name: 'Check in now' })
    )

    expect(verify).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/api/user/checkin', {
      captcha: solution,
    })
  })

  it('does not check in when the visitor cancels the challenge', async () => {
    verify.mockRejectedValue(new Error('Human verification expired or failed'))
    const user = userEvent.setup()
    renderCard('captcha-id')

    await user.click(
      await screen.findByRole('button', { name: 'Check in now' })
    )

    expect(api.post).not.toHaveBeenCalled()
    expect(
      await screen.findByRole('button', { name: 'Check in now' })
    ).toBeEnabled()
  })

  it('lets the server decide when the provider cannot be loaded', async () => {
    const unavailable = new Error('Unable to load the security check')
    unavailable.name = 'geetest-unavailable'
    verify.mockRejectedValue(unavailable)
    const user = userEvent.setup()
    renderCard('captcha-id')

    await user.click(
      await screen.findByRole('button', { name: 'Check in now' })
    )

    expect(api.post).toHaveBeenCalledWith('/api/user/checkin')
  })

  it('checks in without a challenge when no provider is configured', async () => {
    const user = userEvent.setup()
    renderCard('')

    await user.click(
      await screen.findByRole('button', { name: 'Check in now' })
    )

    expect(verify).not.toHaveBeenCalled()
    expect(api.post).toHaveBeenCalledWith('/api/user/checkin')
  })
})
