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
import { describe, expect, test } from 'vitest'

import type { Message } from '../../../types'
import { PlaygroundMessageContent } from '../playground-message-content'
import { PlaygroundMessageImages } from '../playground-message-images'

const imageMessage: Message = {
  key: 'assistant-image',
  from: 'assistant',
  versions: [{ id: 'v1', content: 'Generated 2 images' }],
  status: 'complete',
  images: ['https://example.com/first.png', 'data:image/png;base64,QUJD'],
}

const textMessage: Message = {
  key: 'assistant-text',
  from: 'assistant',
  versions: [{ id: 'v1', content: 'plain answer' }],
  status: 'complete',
}

describe('PlaygroundMessageImages', () => {
  test('renders one accessible image per generated result', () => {
    render(<PlaygroundMessageImages images={imageMessage.images ?? []} />)

    expect(screen.getByAltText('Generated image 1')).toHaveAttribute(
      'src',
      'https://example.com/first.png'
    )
    expect(screen.getByAltText('Generated image 2')).toHaveAttribute(
      'src',
      'data:image/png;base64,QUJD'
    )
    expect(
      screen.getByRole('button', { name: 'Open image 1' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open image 2' })
    ).toBeInTheDocument()
  })

  test('opens the full image in a preview dialog when a thumbnail is activated', async () => {
    const user = userEvent.setup()

    render(<PlaygroundMessageImages images={imageMessage.images ?? []} />)

    await user.click(screen.getByRole('button', { name: 'Open image 1' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Image Preview')
    expect(screen.getByAltText('Generated image')).toHaveAttribute(
      'src',
      'https://example.com/first.png'
    )
  })

  test('renders no image element when there is nothing to show', () => {
    render(<PlaygroundMessageImages images={[]} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('PlaygroundMessageContent image messages', () => {
  function renderContent(message: Message, versionContent: string) {
    return render(
      <PlaygroundMessageContent
        actions={null}
        alignment='left'
        message={message}
        versionContent={versionContent}
      />
    )
  }

  test('shows the generated images together with the summary', () => {
    renderContent(imageMessage, 'Generated 2 images')

    expect(screen.getByAltText('Generated image 1')).toBeInTheDocument()
    expect(screen.getByText('Generated 2 images')).toBeInTheDocument()
  })

  test('renders no image container for a message without images', () => {
    renderContent(textMessage, 'plain answer')

    expect(screen.queryByTestId('playground-message-images')).toBeNull()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
