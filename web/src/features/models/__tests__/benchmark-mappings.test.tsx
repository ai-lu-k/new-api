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
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import type { BenchmarkMappings } from '../benchmark-api'
import { BenchmarkMappingsDialog } from '../components/dialogs/benchmark-mappings-dialog'

const registry: BenchmarkMappings = {
  revision: 'original',
  sources: ['claude-sonnet-5-5'],
  models: [
    {
      id: 'claude-sonnet-5-5',
      aliases: ['claude-sonnet-5-5-x0.1'],
      highest_tier: 'high',
      tiers: [{ id: 'high', source_name: 'claude-sonnet-5-5', scores: {} }],
    },
  ],
}

function renderMappings(modelName?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(['benchmark'], { models: [] })
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <BenchmarkMappingsDialog modelName={modelName} onClose={onClose} />
    </QueryClientProvider>
  )
  return { client, onClose }
}

describe('benchmark mapping management', () => {
  it('saves exact aliases with the loaded revision and refreshes public scores', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: registry },
    })
    let finish: ((value: unknown) => void) | undefined
    const put = vi.spyOn(api, 'put').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const { client } = renderMappings('claude-sonnet-5-5-x0.1')
    expect(
      screen.getByText(
        'Associate exact model names with benchmark evaluations. Changes apply immediately; scores update automatically.'
      )
    ).toBeVisible()
    const user = userEvent.setup()
    const aliases = await screen.findByRole('textbox', {
      name: 'Model aliases',
    })
    await user.clear(aliases)
    await user.type(aliases, 'claude-sonnet-5-5-x0.1\nclaude-sonnet-5-5-x0.2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/api/models/benchmark', {
        revision: 'original',
        model: {
          ...registry.models[0],
          aliases: ['claude-sonnet-5-5-x0.1', 'claude-sonnet-5-5-x0.2'],
        },
      })
    )
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    await act(async () =>
      finish?.({
        data: {
          success: true,
          data: {
            ...registry,
            revision: 'saved',
            models: [
              {
                ...registry.models[0],
                aliases: ['claude-sonnet-5-5-x0.1', 'claude-sonnet-5-5-x0.2'],
              },
            ],
          },
        },
      })
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    )
    expect(client.getQueryState(['benchmark'])?.isInvalidated).toBe(true)
    expect(screen.getByRole('textbox', { name: 'Model aliases' })).toHaveValue(
      'claude-sonnet-5-5-x0.1\nclaude-sonnet-5-5-x0.2'
    )
  })

  it('rejects duplicate aliases without submitting a mapping', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: registry },
    })
    const put = vi.spyOn(api, 'put')
    renderMappings()
    const user = userEvent.setup()
    const aliases = await screen.findByRole('textbox', {
      name: 'Model aliases',
    })
    await user.clear(aliases)
    await user.type(aliases, 'same-name\nsame-name')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(
      await screen.findByText(
        'Model aliases must be unique, with one name per line.'
      )
    ).toBeVisible()
    expect(aliases).toHaveAttribute('aria-invalid', 'true')
    expect(put).not.toHaveBeenCalled()
  })

  it('edits a source with the keyboard and keeps the highest tier valid when removing a tier', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: registry },
    })
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true, data: registry } })
    renderMappings()
    const user = userEvent.setup()
    const source = await screen.findByRole('combobox', {
      name: 'Benchmark model for high',
    })
    await user.clear(source)
    await user.type(source, 'unpublished-model')
    await user.keyboard('{Enter}')
    expect(
      screen.getByText('No published score for this source yet.')
    ).toBeVisible()
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Add evaluation tier' }),
      'max'
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Highest evaluation tier' }),
      'max'
    )
    await user.click(screen.getByRole('button', { name: 'Remove max tier' }))
    expect(
      screen.getByRole('combobox', { name: 'Highest evaluation tier' })
    ).toHaveValue('high')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/api/models/benchmark', {
        revision: 'original',
        model: {
          ...registry.models[0],
          tiers: [{ id: 'high', source_name: 'unpublished-model', scores: {} }],
        },
      })
    )
  })

  it('opens an unmapped model as a new mapping and preserves input after a failed save', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: registry },
    })
    vi.spyOn(api, 'put').mockRejectedValue(
      new Error('benchmark mappings changed; reload before saving')
    )
    renderMappings('new-discount-model')
    const user = userEvent.setup()
    const aliases = await screen.findByRole('textbox', {
      name: 'Model aliases',
    })
    expect(aliases).toHaveValue('new-discount-model')
    const id = screen.getByRole('textbox', { name: 'Benchmark model' })
    expect(id).toHaveValue('')
    await user.type(id, 'new-model')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    )
    expect(id).toHaveValue('new-model')
    expect(aliases).toHaveValue('new-discount-model')
  })

  it('confirms deletions and supports an empty registry after saving', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: registry },
    })
    const put = vi.spyOn(api, 'put').mockResolvedValue({
      data: {
        success: true,
        data: { ...registry, revision: 'deleted', models: [] },
      },
    })
    renderMappings()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Delete mapping' })
    )
    const confirm = await screen.findByRole('alertdialog')
    expect(
      within(confirm).getByText(
        'Models using this mapping will no longer show benchmark scores.'
      )
    ).toBeVisible()
    await user.click(within(confirm).getByRole('button', { name: 'Continue' }))
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/api/models/benchmark', {
        revision: 'original',
        delete_id: 'claude-sonnet-5-5',
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    )
    expect(
      screen.getByRole('textbox', { name: 'Benchmark model' })
    ).toHaveValue('')
    expect(
      screen.queryByRole('button', { name: 'Delete mapping' })
    ).not.toBeInTheDocument()
  })

  it('shows a retry action after loading fails and loads an empty registry on retry', async () => {
    vi.spyOn(api, 'get')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({
        data: { success: true, data: { ...registry, models: [] } },
      })
    renderMappings()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByRole('textbox', { name: 'Model aliases' })
    ).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Add mapping' })).toBeEnabled()
  })
})
