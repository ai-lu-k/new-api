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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'

import { CampaignLeaderboard } from '../components/campaign-leaderboard'
import { CampaignProfile } from '../components/campaign-profile'
import { CampaignRules } from '../components/campaign-rules'
import { ChallengeBoard } from '../components/challenge-board'
import { ChallengeDialog } from '../components/challenge-dialog'
import { splitCountdown } from '../hooks/use-countdown'
import { CampaignPage } from '../index'
import { shiftText } from '../lib/caesar'
import { formatShanghai } from '../lib/format-event'
import type {
  CampaignChallenge,
  CampaignStatus,
  CampaignSubmitResult,
} from '../types'

const warmUp: CampaignChallenge = {
  id: 'c1',
  tier: 'beginner',
  points: 10,
  title: 'Warm-up',
  prompt: 'How many bits are in a kilobyte?',
  files: [{ name: 'c1.txt', url: '/api/campaign/files/c1.txt' }],
  widget: '',
  widget_data: '',
  hints: [],
  reward_quota: 6849,
  reward_yuan: 0.1,
  solved_count: 3,
  solved: false,
  awarded_quota: 0,
  awarded_yuan: 0,
}

const status: CampaignStatus = {
  slug: 'demo',
  title: 'Demo campaign',
  enabled: true,
  state: 'active',
  server_time: 1792800000,
  starts_at: 1792713600,
  ends_at: 1793404799,
  claim_deadline: 1794009599,
  reward_slots: 100,
  slots_left: 98,
  total_points: 300,
  share_yuan: 0.2,
  ranking_yuan: [10, 7, 5],
  reward_pool_yuan: 342,
  participants: 2,
  solve_count: 3,
  ranking_settled_at: 0,
  challenges: [warmUp, { ...warmUp, id: 'c2', title: 'Ring buffer' }],
  me: {
    guest: false,
    bound: true,
    points: 10,
    rank: 4,
    solved_count: 1,
    eligible: true,
    reward_slot: 7,
    solve_quota: 6849,
    share_quota: 0,
    rank_quota: 0,
    total_quota: 6849,
    solve_yuan: 0.1,
    share_yuan: 0,
    rank_yuan: 0,
    total_yuan: 0.1,
    share_claimed: false,
    share_ready: false,
    can_share: false,
    final_rank: 0,
  },
  leaderboard: [],
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('campaign helpers', () => {
  it('splits a countdown into days, hours, minutes and seconds', () => {
    expect(splitCountdown(90_000)).toEqual({
      days: 0,
      hours: 0,
      minutes: 1,
      seconds: 30,
      totalSeconds: 90,
    })
    expect(splitCountdown(-5).totalSeconds).toBe(0)
  })

  it('shifts only letters so the wheel keeps digits and punctuation', () => {
    expect(shiftText('aol huzdly pz 2026!', -7)).toBe('the answer is 2026!')
    expect(shiftText('The Answer', 26)).toBe('The Answer')
  })

  it('publishes the schedule in Asia/Shanghai regardless of the browser zone', () => {
    expect(formatShanghai(Date.UTC(2026, 9, 24, 4, 0) / 1000)).toBe(
      '2026-10-24 12:00'
    )
    expect(formatShanghai(0)).toBe('—')
  })
})

describe('challenge numbering', () => {
  it('numbers the reordered board while submissions retain stable challenge IDs', async () => {
    const ids = ['c2', 'c3', 'c4', 'c6', 'c5', 'c7', 'c8', 'c9']
    const challenges = ids.map((id, index) => ({
      ...warmUp,
      id,
      title: `Puzzle ${index + 1}`,
    }))
    const onSelect = vi.fn()
    render(
      <ChallengeBoard
        challenges={challenges}
        state='active'
        onSelect={onSelect}
      />
    )
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#8')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Puzzle 1, 10 points' })
    )
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'c2' })
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Puzzle 8, 10 points' })
    )
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'c9' })
    )
  })

  it('uses the displayed position in the final puzzle dialog', () => {
    render(
      <ChallengeDialog
        challenge={{ ...warmUp, id: 'c9', title: 'Folded signatures' }}
        number={8}
        open
        submitting={false}
        error={null}
        result={null}
        guest={false}
        onSubmit={() => {}}
        onOpenChange={() => {}}
      />
    )
    expect(
      screen.getByRole('heading', { name: '#8 · Folded signatures' })
    ).toBeInTheDocument()
  })
})

describe('challenge dialog', () => {
  it.each([null, undefined])(
    'opens a puzzle with %s hints and allows submitting an answer',
    async (hints) => {
      const onSubmit = vi.fn()
      render(
        <ChallengeDialog
          challenge={{ ...warmUp, hints }}
          open
          submitting={false}
          error={null}
          result={null}
          guest={false}
          onSubmit={onSubmit}
          onOpenChange={() => {}}
        />
      )
      expect(screen.getByText(warmUp.prompt)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /c1\.txt/ })).toBeInTheDocument()
      expect(screen.queryByText('Hints')).toBeNull()
      await userEvent.type(screen.getByLabelText('Your answer'), '400')
      await userEvent.click(
        screen.getByRole('button', { name: 'Submit answer' })
      )
      expect(onSubmit).toHaveBeenCalledWith('400')
    }
  )

  it('submits the typed answer and clears the form for the same puzzle', async () => {
    const onSubmit = vi.fn()
    render(
      <ChallengeDialog
        challenge={warmUp}
        open
        submitting={false}
        error={null}
        result={null}
        guest={false}
        onSubmit={onSubmit}
        onOpenChange={() => {}}
      />
    )
    await userEvent.type(screen.getByLabelText('Your answer'), '400')
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect(onSubmit).toHaveBeenCalledWith('400')
  })

  it('offers the puzzle attachment as a download', () => {
    render(
      <ChallengeDialog
        challenge={warmUp}
        open
        submitting={false}
        error={null}
        result={null}
        guest={false}
        onSubmit={() => {}}
        onOpenChange={() => {}}
      />
    )
    const link = screen.getByRole('link', { name: /c1\.txt/ })
    expect(link).toHaveAttribute('href', '/api/campaign/files/c1.txt')
  })

  it('shows the Caesar wheel so the visitor can try shifts on the page', () => {
    render(
      <ChallengeDialog
        challenge={{ ...warmUp, widget: 'caesar', widget_data: 'aol' }}
        open
        submitting={false}
        error={null}
        result={null}
        guest={false}
        onSubmit={() => {}}
        onOpenChange={() => {}}
      />
    )
    expect(screen.getByText('Shift')).toBeInTheDocument()
    expect(screen.getByText('aol')).toBeInTheDocument()
  })

  it('reveals the layered hints one at a time', async () => {
    render(
      <ChallengeDialog
        challenge={{ ...warmUp, hints: ['first hint', 'second hint'] }}
        open
        submitting={false}
        error={null}
        result={null}
        guest={false}
        onSubmit={() => {}}
        onOpenChange={() => {}}
      />
    )
    expect(screen.queryByText('first hint')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Show hint 1/2' }))
    expect(screen.getByText('first hint')).toBeInTheDocument()
    expect(screen.queryByText('second hint')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Show hint 2/2' }))
    expect(screen.getByText('second hint')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'All hints shown' })
    ).toBeDisabled()
  })

  it('keeps the form and shows a wrong answer inline', () => {
    render(
      <ChallengeDialog
        challenge={warmUp}
        open
        submitting={false}
        error='答案不对，再试试'
        result={null}
        guest={false}
        onSubmit={() => {}}
        onOpenChange={() => {}}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('答案不对，再试试')
    expect(screen.getByLabelText('Your answer')).toBeInTheDocument()
  })

  it('replaces the form with the settled result after a correct answer', () => {
    const result: CampaignSubmitResult = {
      correct: true,
      already_solved: false,
      challenge_id: 'c1',
      points: 10,
      awarded_quota: 6849,
      awarded_yuan: 0.1,
      total_points: 20,
      solved_count: 2,
      reward_slot: 7,
      eligible: true,
      guest: false,
    }
    render(
      <ChallengeDialog
        challenge={warmUp}
        open
        submitting={false}
        error={null}
        result={result}
        guest={false}
        onSubmit={() => {}}
        onOpenChange={() => {}}
      />
    )
    expect(screen.queryByLabelText('Your answer')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Correct! +10 points')
  })
})

describe('event profile', () => {
  it('keeps the result card locked until both warm-ups are solved', () => {
    render(
      <CampaignProfile status={status} sharing={false} onShare={() => {}} />
    )
    expect(
      screen.getByRole('button', { name: 'Download result card' })
    ).toBeDisabled()
    expect(
      screen.getByText(
        'Solve the first two challenges to unlock the result card.'
      )
    ).toBeInTheDocument()
  })

  it('unlocks the result card and reports the claimed slot', async () => {
    const onShare = vi.fn()
    render(
      <CampaignProfile
        status={{
          ...status,
          me: {
            ...status.me,
            solved_count: 2,
            share_ready: true,
            can_share: true,
          },
        }}
        sharing={false}
        onShare={onShare}
      />
    )
    expect(screen.getByText('Reward slot #7')).toBeInTheDocument()
    const share = screen.getByRole('button', { name: 'Download result card' })
    expect(share).toBeEnabled()
    await userEvent.click(share)
    expect(onShare).toHaveBeenCalledTimes(1)
  })
})

describe('event reward rules', () => {
  it('separates the original reward points from bonus ranking points', async () => {
    const i18n = createInstance()
    await i18n.init({ lng: 'zh', fallbackLng: 'en', resources: { en, zh } })
    const standard = [10, 10, 20, 30, 30, 40, 60, 100].map((points, index) => ({
      ...warmUp,
      id: `standard-${index}`,
      points,
    }))
    const bonuses = [200, 100].map((points, index) => ({
      ...warmUp,
      id: `bonus-${index}`,
      bonus: true,
      points,
      reward_yuan: 0,
      reward_quota: 0,
    }))
    render(
      <I18nextProvider i18n={i18n}>
        <CampaignRules
          status={{
            ...status,
            total_points: 600,
            challenges: [...standard, ...bonuses],
          }}
        />
      </I18nextProvider>
    )
    expect(screen.getByText(/8 道常规题/)).toHaveTextContent('共 300 分')
    expect(screen.getByText(/2 道附加题/)).toHaveTextContent('共 300 分')
    expect(screen.getByText(/2 道附加题/)).toHaveTextContent(
      '附加分影响最终排名奖'
    )
  })

  it('shows the fixed 100-point conversion rather than the total event reward', () => {
    render(<CampaignRules status={status} />)
    expect(screen.getByText(/100 points redeem for/)).toHaveTextContent('¥1.00')
    expect(screen.getByText(/100 points redeem for/)).not.toHaveTextContent(
      '¥3.00'
    )
  })
})

describe('scoreboard solved count', () => {
  it('labels solved challenges as questions while puzzle cards count people', async () => {
    const i18n = createInstance()
    await i18n.init({ lng: 'zh', fallbackLng: 'en', resources: { en, zh } })
    render(
      <I18nextProvider i18n={i18n}>
        <CampaignLeaderboard
          rows={[
            {
              rank: 1,
              user_id: 42,
              name: 'pl***',
              points: 300,
              solved_count: 8,
              eligible: true,
              final_rank: 0,
            },
          ]}
        />
        <ChallengeBoard
          challenges={[{ ...warmUp, solved: true, solved_count: 8 }]}
          state='active'
          onSelect={() => {}}
        />
      </I18nextProvider>
    )
    expect(screen.getByText('已解出 8 题')).toBeInTheDocument()
    expect(screen.getByText('8 人解出')).toBeInTheDocument()
    expect(screen.getByText('pl***')).toBeInTheDocument()
  })
})

describe('scoreboard current user', () => {
  const rows = [
    {
      rank: 1,
      user_id: 42,
      name: 'al***',
      points: 300,
      solved_count: 8,
      eligible: true,
      final_rank: 0,
    },
    {
      rank: 2,
      user_id: 43,
      name: 'bo***',
      points: 50,
      solved_count: 3,
      eligible: true,
      final_rank: 0,
    },
  ]

  it('highlights only the current account and hides its full name after sign-out', () => {
    const { rerender } = render(
      <CampaignLeaderboard
        rows={rows}
        currentUser={{
          id: 42,
          username: 'alice',
          display_name: 'alice@example.com',
        }}
      />
    )
    const ownRow = screen.getByRole('listitem', { current: true })
    expect(within(ownRow).getByText('alice@example.com')).toBeInTheDocument()
    expect(ownRow).toHaveAttribute('aria-current', 'true')
    expect(ownRow).toHaveClass('ring-1', 'bg-[var(--campaign-chip)]')
    expect(within(ownRow).getByText('You')).toBeInTheDocument()
    expect(screen.getByText('bo***').closest('li')).not.toHaveAttribute(
      'aria-current'
    )
    expect(screen.queryByText('al***')).toBeNull()

    rerender(<CampaignLeaderboard rows={rows} />)
    expect(screen.queryByText('alice@example.com')).toBeNull()
    expect(screen.getByText('al***').closest('li')).not.toHaveAttribute(
      'aria-current'
    )
    expect(screen.queryByText('You')).toBeNull()
  })

  it('shows the current username when no display name is set', () => {
    render(
      <CampaignLeaderboard
        rows={rows}
        currentUser={{ id: 43, username: 'bob@example.com', display_name: ' ' }}
      />
    )
    expect(screen.getByText('bob@example.com').closest('li')).toHaveAttribute(
      'aria-current',
      'true'
    )
    expect(screen.getByText('al***')).toBeInTheDocument()
  })
})

describe('bonus challenges', () => {
  const bonus = {
    ...warmUp,
    id: 'b2',
    title: 'The tenth power',
    points: 100,
    bonus: true,
    image_url: '/api/campaign/files/b2.png',
    prompt: '',
    files: [{ name: 'b2.png', url: '/api/campaign/files/b2.png' }],
    reward_quota: 0,
    reward_yuan: 0,
  }
  it('labels bonus tiles as score only and keeps selection available', async () => {
    const onSelect = vi.fn()
    render(
      <ChallengeBoard challenges={[bonus]} state='active' onSelect={onSelect} />
    )
    expect(screen.getByText('Bonus · score only')).toBeInTheDocument()
    expect(screen.queryByText('¥0.00')).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'The tenth power, 100 points' })
    )
    expect(onSelect).toHaveBeenCalledWith(bonus)
  })
  it('shows the original puzzle image and focuses its title before the download', async () => {
    render(
      <ChallengeDialog
        challenge={bonus}
        open
        submitting={false}
        error={null}
        result={null}
        guest
        onSubmit={() => {}}
        onOpenChange={() => {}}
      />
    )
    expect(
      screen.getByRole('img', { name: 'The tenth power' })
    ).toHaveAttribute('src', '/api/campaign/files/b2.png')
    expect(screen.getByRole('link', { name: /b2.png/ })).toHaveAttribute(
      'download',
      'b2.png'
    )
    expect(screen.queryByText('Hints')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your answer')).toBeInTheDocument()
    expect(await screen.findByText('#b2 · The tenth power')).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('link', { name: /b2.png/ })).toHaveFocus()
  })
  it('does not promise a cash claim or report full slots after a bonus solve', () => {
    const result: CampaignSubmitResult = {
      correct: true,
      already_solved: false,
      challenge_id: 'b2',
      points: 100,
      awarded_quota: 0,
      awarded_yuan: 0,
      total_points: 100,
      solved_count: 1,
      reward_slot: 0,
      eligible: false,
      guest: true,
    }
    const view = render(
      <ChallengeDialog
        challenge={bonus}
        open
        submitting={false}
        error={null}
        result={result}
        guest
        onSubmit={() => {}}
        onOpenChange={() => {}}
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'This bonus adds ranking points without a solve reward.'
    )
    expect(
      screen.queryByText('Sign in to link this progress and claim the reward.')
    ).not.toBeInTheDocument()
    view.rerender(
      <ChallengeDialog
        challenge={bonus}
        open
        submitting={false}
        error={null}
        result={{ ...result, guest: false }}
        guest={false}
        onSubmit={() => {}}
        onOpenChange={() => {}}
      />
    )
    expect(
      screen.queryByText('The reward slots are full. Your score still counts.')
    ).not.toBeInTheDocument()
  })
})

describe('archived campaign', () => {
  it('renders the not-found state instead of an error when no campaign is published', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/campaign') {
        throw Object.assign(new Error('Not Found'), {
          response: {
            status: 404,
            data: { success: false, message: 'No active campaign' },
          },
        })
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const root = createRootRoute()
    const campaign = createRoute({
      getParentRoute: () => root,
      path: '/campaign',
      component: CampaignPage,
    })
    const home = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => null,
    })
    const signIn = createRoute({
      getParentRoute: () => root,
      path: '/sign-in',
      component: () => null,
    })
    const router = createRouter({
      routeTree: root.addChildren([campaign, home, signIn]),
      history: createMemoryHistory({ initialEntries: ['/campaign'] }),
    })
    await router.load()
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )

    expect(
      await screen.findByText('No campaign is running')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })
})
