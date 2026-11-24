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
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ModelCard } from '../components/model-card'
import { SelectedModelContext } from '../hooks/use-selected-model'
import { modelSharedName } from '../lib/model-shared-name'
import type { PricingModel } from '../types'

vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))

const MODEL: PricingModel = {
  id: 1,
  model_name: 'example-model',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 3,
  enable_groups: ['default'],
  group_ratio: { default: 1 },
}

function renderCard(selectedModelName: string | null) {
  return render(
    <SelectedModelContext value={selectedModelName}>
      <ModelCard model={MODEL} onClick={() => undefined} />
    </SelectedModelContext>
  )
}

describe('modelSharedName', () => {
  it('turns the slashes and dots of a model name into a valid transition name', () => {
    expect(modelSharedName('gpt-4.1/mini')).toBe('model-gpt-4-1-mini')
  })
})

describe('ModelCard shared name', () => {
  it('names the card title so the details drawer can morph into it', () => {
    renderCard(null)

    const title = within(
      screen.getByRole('heading', { name: 'example-model' })
    ).getByText('example-model')
    expect(title.style.getPropertyValue('view-transition-name')).toBe(
      'model-example-model'
    )
  })

  it('leaves the name to the drawer while this model is open', () => {
    renderCard('example-model')

    const title = within(
      screen.getByRole('heading', { name: 'example-model' })
    ).getByText('example-model')
    expect(title).not.toHaveAttribute('data-vt-name')
  })
})
