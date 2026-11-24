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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../../constants'
import { PlaygroundParameterPanel } from '../playground-parameter-panel'

function renderPanel(options: { isImageGeneration: boolean }) {
  const onConfigChange = vi.fn()

  render(
    <PlaygroundParameterPanel
      config={DEFAULT_CONFIG}
      isImageGeneration={options.isImageGeneration}
      onConfigChange={onConfigChange}
      onParameterEnabledChange={() => undefined}
      parameterEnabled={DEFAULT_PARAMETER_ENABLED}
    />
  )

  return { onConfigChange }
}

describe('PlaygroundParameterPanel in image mode', () => {
  test('replaces chat parameters with size, quality and count', async () => {
    const user = userEvent.setup()

    renderPanel({ isImageGeneration: true })
    await user.click(screen.getByRole('button', { name: 'Parameters' }))

    expect(await screen.findByLabelText('Image size')).toBeInTheDocument()
    expect(screen.getByLabelText('Image quality')).toBeInTheDocument()
    expect(screen.getByLabelText('Image count')).toBeInTheDocument()
    expect(screen.queryByLabelText('Temperature')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Top P')).not.toBeInTheDocument()
  })

  test('sends the chosen size and quality to the config', async () => {
    const user = userEvent.setup()

    const { onConfigChange } = renderPanel({ isImageGeneration: true })
    await user.click(screen.getByRole('button', { name: 'Parameters' }))
    await user.selectOptions(
      await screen.findByLabelText('Image size'),
      '1024x1024'
    )
    await user.selectOptions(screen.getByLabelText('Image quality'), 'high')

    expect(onConfigChange).toHaveBeenCalledWith('image_size', '1024x1024')
    expect(onConfigChange).toHaveBeenCalledWith('image_quality', 'high')
  })

  test('clamps the image count into the supported range', async () => {
    const user = userEvent.setup()

    const { onConfigChange } = renderPanel({ isImageGeneration: true })
    await user.click(screen.getByRole('button', { name: 'Parameters' }))

    const countInput = await screen.findByLabelText('Image count')
    await user.clear(countInput)
    await user.type(countInput, '99')

    expect(onConfigChange).toHaveBeenLastCalledWith('image_n', 10)
  })
})

describe('PlaygroundParameterPanel in text mode', () => {
  test('keeps the chat parameters and hides the image controls', async () => {
    const user = userEvent.setup()

    renderPanel({ isImageGeneration: false })
    await user.click(screen.getByRole('button', { name: 'Parameters' }))

    // The chat controls label a slider, which is not a labelable element, so
    // these are matched by their visible text rather than by label.
    expect(await screen.findByText('Temperature')).toBeInTheDocument()
    expect(screen.getByText('Top P')).toBeInTheDocument()
    expect(screen.queryByText('Image size')).not.toBeInTheDocument()
    expect(screen.queryByText('Image count')).not.toBeInTheDocument()
  })
})
