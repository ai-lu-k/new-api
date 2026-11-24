import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import type { ModelDailyBudgets } from '../../api'
import { ModelDailyBudgetPanel } from '../budget-panel'

let client: QueryClient
const snapshot: ModelDailyBudgets = {
  models: [
    {
      model: 'deepseek-v4.1-flash-x0.1',
      limit: 200000000,
      used: 50000000,
      remaining: 150000000,
      unlimited: false,
      resets_at: 1792339200,
    },
  ],
  updated_at: 1792300000,
  resets_at: 1792339200,
  timezone: 'Asia/Shanghai',
}
function renderPanel() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ModelDailyBudgetPanel />
    </QueryClientProvider>
  )
}
beforeEach(() => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'ordinary', role: 1 })
})
afterEach(async () => {
  client?.clear()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
  await i18next.changeLanguage('en')
})

it('shows compact physical token balances, full-value titles and the Beijing reset time', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { success: true, data: snapshot } })
  renderPanel()
  expect(await screen.findByText('150M')).toBeVisible()
  expect(screen.getByText('25%')).toBeVisible()
  expect(
    screen.getByRole('progressbar', {
      name: 'Daily token usage for deepseek-v4.1-flash-x0.1',
    })
  ).toHaveAttribute('aria-valuenow', '25')
  expect(screen.getByText('150M')).toHaveAttribute('title', '150,000,000')
  expect(
    screen.getByText(
      'Remaining tokens today · Resets daily at 00:00 · Beijing time'
    )
  ).toBeVisible()
  expect(screen.queryByText(/Updated at/)).not.toBeInTheDocument()
  expect(get).toHaveBeenCalledWith('/api/user/self/model-daily-tokens')
  expect(screen.queryByText('Performance health')).not.toBeInTheDocument()
})

it('explains the purpose and reset rules on hover without adding permanent small print', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: snapshot },
  })
  const user = userEvent.setup()
  renderPanel()
  await screen.findByRole('heading', { name: 'Model usage limits' })
  expect(
    screen.queryByText(/To share resources fairly/)
  ).not.toBeInTheDocument()
  await user.hover(
    screen.getByRole('button', {
      name: 'Why does this model have a daily limit?',
    })
  )
  expect(await screen.findByText(/To share resources fairly/)).toBeVisible()
  expect(screen.getByText(/00:00 Beijing time/)).toBeVisible()
})

it('opens the limit explanation with the keyboard and restores focus after Escape', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: snapshot },
  })
  const user = userEvent.setup()
  renderPanel()
  await screen.findByText('150M')
  const help = screen.getByRole('button', {
    name: 'Why does this model have a daily limit?',
  })
  await user.tab()
  expect(help).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(await screen.findByText(/To share resources fairly/)).toBeVisible()
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(
      screen.queryByText(/To share resources fairly/)
    ).not.toBeInTheDocument()
  )
  expect(help).toHaveFocus()
})

it('refreshes balances explicitly and leaves unlimited models out of the list', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValueOnce({ data: { success: true, data: snapshot } })
    .mockResolvedValue({
      data: {
        success: true,
        data: {
          ...snapshot,
          updated_at: snapshot.updated_at + 60,
          models: [
            { ...snapshot.models[0], used: 200000000, remaining: 0 },
            {
              model: 'another-model-with-a-long-name',
              limit: -1,
              used: 10,
              remaining: 0,
              unlimited: true,
              resets_at: snapshot.resets_at,
            },
          ],
        },
      },
    })
  renderPanel()
  await screen.findByText('150M')
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh model token usage' })
  )
  expect(await screen.findByText('0')).toBeVisible()
  expect(screen.getByText('deepseek-v4.1-flash-x0.1')).toBeVisible()
  expect(
    screen.queryByText('another-model-with-a-long-name')
  ).not.toBeInTheDocument()
  expect(screen.queryByText('Unlimited')).not.toBeInTheDocument()
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
})

it('shows an error instead of inventing an available balance and can retry', async () => {
  vi.spyOn(api, 'get')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ data: { success: true, data: snapshot } })
  renderPanel()
  expect(
    await screen.findByText('Unable to load model token usage')
  ).toBeVisible()
  expect(screen.queryByText('150M')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('150M')).toBeVisible()
})

it('shows an empty state when no models are limited', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { ...snapshot, models: [] } },
  })
  renderPanel()
  expect(
    await screen.findByText('No model daily token limits configured')
  ).toBeVisible()
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
})

it.each(['zhCN', 'zhTW', 'en', 'fr', 'ja', 'ru', 'vi', 'invalid-language'])(
  'formats balances and times safely after switching to %s',
  async (language) => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: snapshot },
    })
    renderPanel()
    await screen.findByText('deepseek-v4.1-flash-x0.1')
    await i18next.changeLanguage(language)
    await waitFor(() =>
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '25'
      )
    )
  }
)

it('keeps many models in a bounded scroll region with the reset time outside it', async () => {
  const models = Array.from({ length: 20 }, (_, i) => ({
    ...snapshot.models[0],
    model: `model-${i}`,
  }))
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { ...snapshot, models } },
  })
  renderPanel()
  await screen.findByText('model-19')
  const region = screen.getByRole('region', { name: 'Models' })
  expect(region).toHaveClass(
    '[&_[data-slot=scroll-area-viewport]]:max-h-[96px]'
  )
  expect(region).not.toContainElement(
    screen.getByText(
      'Remaining tokens today · Resets daily at 00:00 · Beijing time'
    )
  )
})

it('reads the model name, then the remaining figure, then its usage', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: snapshot },
  })
  renderPanel()
  const remaining = await screen.findByText('150M')
  const model = screen.getByText(snapshot.models[0].model)
  const progress = screen.getByRole('progressbar')
  expect(
    model.compareDocumentPosition(remaining) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(
    remaining.compareDocumentPosition(progress) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  const block = screen
    .getByRole('heading', { name: 'Model usage limits' })
    .closest('section')
  if (!block) throw new Error('Missing model budget block')
  expect(block).toHaveClass('border-t-foreground', 'border-t')
  expect(
    within(block).getByText(
      'Remaining tokens today · Resets daily at 00:00 · Beijing time'
    )
  ).toBeVisible()
  expect(block.querySelector('footer')).toBeNull()
})

it.each([
  { used: 0, remaining: 200000000, status: 'Available', percent: 0 },
  {
    used: 190000000,
    remaining: 10000000,
    status: 'Almost used up',
    percent: 95,
  },
  { used: 200000000, remaining: 0, status: 'Exhausted', percent: 100 },
  { used: 250000000, remaining: 0, status: 'Exhausted', percent: 100 },
])(
  'shows $status for $remaining remaining tokens with used progress capped at 100',
  async (budget) => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: {
          ...snapshot,
          models: [
            {
              ...snapshot.models[0],
              used: budget.used,
              remaining: budget.remaining,
            },
          ],
        },
      },
    })
    renderPanel()
    expect(await screen.findByText(budget.status)).toBeVisible()
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      String(budget.percent)
    )
  }
)

it('shows the empty state instead of a row of unlimited models', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        ...snapshot,
        models: [
          { ...snapshot.models[0], limit: -1, remaining: 0, unlimited: true },
        ],
      },
    },
  })
  renderPanel()
  expect(
    await screen.findByText('No model daily token limits configured')
  ).toBeVisible()
  expect(screen.queryByText('deepseek-v4.1-flash-x0.1')).not.toBeInTheDocument()
  expect(screen.queryByText('Unlimited')).not.toBeInTheDocument()
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
})

it('truncates long model IDs with the full identifier available as a title', async () => {
  const model = `provider/${'long-model-name-'.repeat(8)}`
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: { ...snapshot, models: [{ ...snapshot.models[0], model }] },
    },
  })
  renderPanel()
  const label = await screen.findByText(model)
  expect(label).toHaveClass('truncate', 'min-w-0')
  expect(label).toHaveAttribute('title', model)
})

it('disables manual refresh during loading and shows a placeholder instead of a zero balance', async () => {
  let resolveRequest!: (response: {
    data: { success: boolean; data: ModelDailyBudgets }
  }) => void
  vi.spyOn(api, 'get').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRequest = resolve
      })
  )
  renderPanel()
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Refresh model token usage' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Refresh model token usage' })
  ).toHaveAttribute('aria-busy', 'true')
  expect(screen.queryByText('0')).not.toBeInTheDocument()
  resolveRequest({ data: { success: true, data: snapshot } })
  await screen.findByText('150M')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Refresh model token usage' })
    ).toBeEnabled()
  )
  expect(
    screen.getByRole('button', { name: 'Refresh model token usage' })
  ).toHaveAttribute('aria-busy', 'false')
})
