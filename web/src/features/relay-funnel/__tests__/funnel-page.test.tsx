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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { createInstance } from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, expect, test, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import { api } from '@/lib/api'

import { RelayFunnel } from '..'
import { RequestObservationDetails } from '../components/request-observation'
import type {
  AttemptMetrics,
  FunnelReport,
  RequestMetrics,
  RequestObservation,
} from '../types'

vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))
vi.mock('@/lib/use-chart-theme', () => ({
  useChartTheme: () => ({ resolvedTheme: 'light', themeReady: true }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function show(content: ReactNode) {
  const i18n = createInstance()
  await i18n.init({
    lng: 'en',
    resources: { en },
    interpolation: { escapeValue: false },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const result = render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>{content}</QueryClientProvider>
    </I18nextProvider>
  )
  return { ...result, client, i18n }
}

const request: RequestObservation = {
  request_id: 'request',
  model: 'retail',
  outcome: 'success',
  duration_ms: 1000,
  first_reasoning_ms: null,
  first_content_ms: 100,
  downstream_bytes: 500,
  truncated: false,
  attempts: [
    {
      number: 1,
      channel_id: 29,
      upstream_model: 'upstream-shared',
      outcome: 'success',
      duration_ms: 900,
      first_reasoning_ms: null,
      first_content_ms: 100,
      output_tps: null,
      response_bytes: 500,
      usage: {
        input_tokens: null,
        output_tokens: null,
        cache_read_tokens: 0,
        cache_write_tokens: null,
      },
      cost: { status: 'unknown', amount: null, source: 'none' },
    },
  ],
  procurement_costs: null,
  unknown_cost_attempts: 1,
}

const metrics: AttemptMetrics = {
  attempts: 1,
  successful: 1,
  errors: 0,
  timeouts: 0,
  cancelled: 0,
  incomplete: 0,
  with_output: 1,
  response_bytes: 500,
  request_bytes: 0,
  request_bytes_known: 0,
  first_reasoning_ms: { samples: 0, value: null },
  first_content_ms: { samples: 1, value: 100 },
  output_tokens: 0,
  output_usage_known: 0,
  output_tps: null,
  tps_observed_attempts: 0,
  cache_observed_attempts: 1,
  cache_hit_attempts: 0,
  cache_request_hit_rate: 0,
  cache_read_tokens: 0,
  cache_input_tokens: 0,
  cache_token_hit_rate: 0,
  cache_paired_attempts: 0,
  unknown_cost_attempts: 1,
  costs: null,
}

const totals: RequestMetrics = {
  requests: 1,
  with_upstream: 1,
  with_output: 1,
  completed: 1,
  failed: 0,
  cancelled: 0,
  local_rejected: 0,
  routing_errors: 0,
  capacity_rejected: 0,
  delivery_errors: 0,
  incomplete: 0,
  failover_requests: 0,
  failover_saved: 0,
  capacity_skipped: 0,
  candidate_checks: 1,
  truncated_requests: 0,
  downstream_bytes: 500,
  first_reasoning_ms: { samples: 0, value: null },
  first_content_ms: { samples: 1, value: 100 },
  duration_ms: { samples: 1, value: 1000 },
  upstream: metrics,
}

const report: FunnelReport = {
  channel_names: {
    '22': 'ZeroCat DeepSeek',
    '15': 'Backup Relay',
    '29': 'ZeroCat Main',
  },
  schema_version: 1,
  scope: 'common_http_relay',
  traffic_kind: 'user',
  start: 100,
  end: 201,
  matched_requests: 1,
  scanned_requests: 1,
  scan_truncated: true,
  scan_limit: 10000,
  writes: { dropped: 2, failed: 1 },
  summary: {
    totals,
    by_channel: [
      { channel_id: 29, upstream_model: 'upstream-shared', metrics },
    ],
    by_model: [{ model: 'retail', metrics: totals }],
    chains: [
      {
        model: 'retail',
        requests: 100,
        completed: 88,
        failed: 12,
        channels: [
          {
            channel_id: 22,
            upstream_model: 'deepseek-v4.1-flash',
            priority: 10,
            weight: 50,
            reached: 100,
            attempted: 97,
            succeeded: 88,
            failed: 9,
            skipped: 3,
            rejected: 0,
            terminated: 12,
          },
          {
            channel_id: 15,
            upstream_model: 'deepseek-v4.1-flash-1017',
            priority: 0,
            weight: 10,
            reached: 12,
            attempted: 12,
            succeeded: 9,
            failed: 3,
            skipped: 0,
            rejected: 0,
            terminated: 0,
          },
        ],
      },
    ],
  },
}

test('disabled request detail does not fetch private chain data', async () => {
  const get = vi.spyOn(api, 'get')
  await show(<RequestObservationDetails enabled={false} requestId='request' />)
  expect(get).not.toHaveBeenCalled()
})

test('historical request without a chain shows an empty state', async () => {
  vi.spyOn(api, 'get').mockRejectedValue({ response: { status: 404 } })
  await show(<RequestObservationDetails enabled requestId='old-request' />)
  expect(await screen.findByText('No request chain recorded')).toBeVisible()
})

test('request detail failure supports retry and preserves unknown cost versus zero cache', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ data: { success: true, data: request } })
  await show(<RequestObservationDetails enabled requestId='request' />)
  const retry = await screen.findByRole('button', { name: /retry/i })
  fireEvent.click(retry)
  expect(await screen.findByText(/upstream-shared/)).toBeVisible()
  const cells = within(screen.getByRole('table')).getAllByRole('cell')
  expect(cells.at(-1)).toHaveTextContent('Unknown')
  expect(cells.at(-2)).toHaveTextContent('0')
  expect(get).toHaveBeenCalledTimes(2)
})

test('reported zero procurement cost stays visible as a reported amount', async () => {
  const zeroRequest = {
    ...request,
    attempts: [
      {
        ...request.attempts[0],
        cost: {
          status: 'reported',
          amount: '0',
          currency: 'USD',
          source: 'upstream_usage',
        },
      },
    ],
  }
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: zeroRequest },
  })
  await show(<RequestObservationDetails enabled requestId='request' />)
  expect(await screen.findByText(/0 USD/)).toHaveTextContent('Reported')
})

test('funnel page queries the requested range and warns about partial totals', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { success: true, data: report } })
  await show(<RelayFunnel initialStart={100000} initialEnd={200000} />)
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Observation data is incomplete'
  )
  expect(get).toHaveBeenCalledWith('/api/relay-observations', {
    params: { start: 100, end: 201, model: undefined, limit: 10000 },
  })
  expect(screen.getByText('upstream-shared', { exact: false })).toBeVisible()
  expect(screen.getByText('Cache token hit rate')).toBeVisible()
  expect(screen.getAllByText('Cache hit rate').length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(2)
  expect(screen.getByText('Unknown cost attempts')).toBeVisible()
  expect(screen.getByText('Channel performance')).toBeVisible()

  // One row per channel, in the configured order, with the traffic counted on
  // the channel that carried it rather than on an attempt position.
  const chain = screen.getByRole('article')
  expect(within(chain).getByText('Tier')).toBeVisible()
  expect(within(chain).getByText('Stopped here')).toBeVisible()
  const rows = within(chain).getAllByRole('row')
  expect(rows).toHaveLength(3)
  expect(rows[1]).toHaveTextContent('ZeroCat DeepSeek')
  expect(rows[2]).toHaveTextContent('Backup Relay')
  expect(chain).toHaveTextContent('Failover recoveries 9')
  expect(screen.getByText('Model routing chains')).toBeVisible()
  expect(screen.getByText('ZeroCat DeepSeek')).toBeVisible()
  expect(screen.getByText('Backup Relay')).toBeVisible()
})

test('funnel page applies the model filter after typing', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { success: true, data: report } })
  await show(<RelayFunnel initialStart={100000} initialEnd={200000} />)
  const input = screen.getByPlaceholderText('Model')
  fireEvent.change(input, { target: { value: 'retail' } })
  await waitFor(() =>
    expect(get).toHaveBeenLastCalledWith('/api/relay-observations', {
      params: { start: 100, end: 201, model: 'retail', limit: 10000 },
    })
  )
})

test('funnel business failure shows retry rather than empty totals', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValueOnce({
      data: { success: false, message: 'range rejected' },
    })
    .mockResolvedValueOnce({ data: { success: true, data: report } })
  await show(<RelayFunnel initialStart={100000} initialEnd={200000} />)
  expect(await screen.findByText('range rejected')).toBeVisible()
  expect(screen.queryAllByText(/Failover recoveries/)).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: /retry/i }))
  await waitFor(() =>
    expect(screen.getAllByText(/Failover recoveries/).length).toBeGreaterThan(0)
  )
  expect(get).toHaveBeenCalledTimes(2)
})
