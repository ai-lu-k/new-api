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
import { describe, expect, test, vi } from 'vitest'

import { PlaygroundChat } from '../playground-chat'

function renderChat(isImageModel: boolean) {
  return render(
    <PlaygroundChat
      messages={[]}
      isImageModel={isImageModel}
      onSelectPrompt={vi.fn()}
    />
  )
}

describe('PlaygroundChat empty state', () => {
  test('hides the starter prompt cards when an image model is selected', () => {
    renderChat(true)

    expect(
      screen.queryByRole('button', { name: 'Analyze data' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Get advice' })
    ).not.toBeInTheDocument()
  })

  test('keeps the starter prompt cards when a text model is selected', () => {
    renderChat(false)

    expect(
      screen.getByRole('button', { name: 'Analyze data' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Get advice' })
    ).toBeInTheDocument()
  })
})
