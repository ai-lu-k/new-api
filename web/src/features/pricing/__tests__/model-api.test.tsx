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
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { STATUS_QUERY_KEY } from '@/lib/status-query'

import { ModelDetailsApi } from '../components/model-details-api'
import type { PricingModel } from '../types'

const model: PricingModel = {
  id: 81,
  model_name: 'gemini-nano-banana-2.1',
  quota_type: 0,
  model_ratio: 0,
  completion_ratio: 0,
  enable_groups: [],
  output_modalities: ['text', 'image'],
  supported_endpoint_types: ['gemini', 'openai'],
}
const endpointMap = {
  gemini: { path: '/v1beta/models/{model}:generateContent' },
  openai: { path: '/v1/chat/completions' },
}
let client: QueryClient

function renderApi(value = model) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(STATUS_QUERY_KEY, {
    server_address: 'https://api.example.com',
  })
  return render(
    <QueryClientProvider client={client}>
      <ModelDetailsApi model={value} endpointMap={endpointMap} />
    </QueryClientProvider>
  )
}

function parameterTable() {
  const table = screen
    .getByRole('columnheader', { name: 'Parameter' })
    .closest('table')
  if (!table) throw new Error('Parameter table is missing')
  return table
}

afterEach(() => client?.clear())

describe('Nano Banana API instructions', () => {
  it('switches the parameter table with the selected endpoint', () => {
    renderApi()
    let table = parameterTable()
    expect(
      within(table).getByText('generationConfig.imageConfig.imageSize')
    ).toBeInTheDocument()
    expect(within(table).getByText('1K / 2K / 4K')).toBeInTheDocument()
    expect(
      within(table).getByText('contents[].parts[].inlineData')
    ).toBeInTheDocument()
    expect(within(table).queryByText('temperature')).not.toBeInTheDocument()
    expect(within(table).queryByText('n')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'openai' }))
    table = parameterTable()
    expect(
      within(table).getByText('extra_body.google.image_config.image_size')
    ).toBeInTheDocument()
    expect(
      within(table).getByText('messages[].content[].image_url')
    ).toBeInTheDocument()
    expect(
      within(table).queryByText('generationConfig.imageConfig.imageSize')
    ).not.toBeInTheDocument()
  })

  it.each(['cURL', 'Python', 'TypeScript', 'JavaScript'])(
    'shows image generation in the %s examples for both endpoints',
    (language) => {
      renderApi()
      fireEvent.click(screen.getByRole('tab', { name: language }))
      let sample =
        screen.getByRole('textbox', {
          name: /^(bash|python|typescript|javascript)$/,
        }).textContent ?? ''
      expect(sample).toContain(
        'https://api.example.com/v1beta/models/gemini-nano-banana-2.1:generateContent'
      )
      expect(sample).toContain('responseModalities')
      expect(sample).toContain('imageSize')
      expect(sample).toContain('1K')
      expect(sample).toContain('Generate an image')
      expect(sample).not.toContain('quantum entanglement')

      fireEvent.click(screen.getByRole('tab', { name: 'openai' }))
      sample =
        screen.getByRole('textbox', {
          name: /^(bash|python|typescript|javascript)$/,
        }).textContent ?? ''
      expect(sample).toContain('https://api.example.com/v1/chat/completions')
      expect(sample).toContain('extra_body')
      expect(sample).toContain('image_size')
      expect(sample).toContain('Generate an image')
      expect(sample).not.toContain('temperature')
    }
  )

  it('keeps ordinary Gemini text models on the chat instructions', () => {
    renderApi({
      ...model,
      model_name: 'gemini-2.5-flash',
      output_modalities: ['text'],
    })
    expect(
      screen.getByRole('textbox', {
        name: /^(bash|python|typescript|javascript)$/,
      }).textContent
    ).toContain('quantum entanglement')
    expect(screen.getByText('temperature')).toBeInTheDocument()
    expect(
      screen.queryByText('generationConfig.imageConfig.imageSize')
    ).not.toBeInTheDocument()
  })
})
