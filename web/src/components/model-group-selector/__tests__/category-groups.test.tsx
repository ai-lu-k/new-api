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
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { beforeAll, describe, expect, test, vi } from 'vitest'

import type { ModelOption } from '@/features/playground/types'

import { ModelGroupSelector } from '../../model-group-selector'

const models: ModelOption[] = [
  { label: 'gpt-4o', value: 'gpt-4o', category: 'Text' },
  {
    label: 'gpt-image-2.5-flare-x0.5',
    value: 'gpt-image-2.5-flare-x0.5',
    category: 'Image',
  },
]

const groups = [{ label: 'default', value: 'default', ratio: 1 }]

beforeAll(() => {
  i18next.addResourceBundle('en', 'translation', {
    Text: 'Text',
    Image: 'Image',
    Model: 'Model',
    Group: 'Group',
    'Model Group': 'Model Group',
    'Search models...': 'Search models...',
    'No model found.': 'No model found.',
    'Select Model': 'Select Model',
  })
})

function renderSelector() {
  return render(
    <ModelGroupSelector
      selectedGroup='default'
      selectedModel='gpt-4o'
      groups={groups}
      models={models}
      onGroupChange={() => undefined}
      onModelChange={vi.fn()}
    />
  )
}

describe('ModelGroupSelector model categories', () => {
  test('separates text models from image models in the dropdown', async () => {
    const user = userEvent.setup()

    renderSelector()
    await user.click(screen.getByRole('combobox'))

    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByText('Text')).toBeInTheDocument()
    expect(within(listbox).getByText('Image')).toBeInTheDocument()
    expect(within(listbox).getByText('gpt-4o')).toBeInTheDocument()
    expect(
      within(listbox).getByText('gpt-image-2.5-flare-x0.5')
    ).toBeInTheDocument()
  })
})
