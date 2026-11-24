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
import { describe, expect, it } from 'vitest'

import { TicketThread } from '../components/ticket-thread'
import { TICKET_AUTHOR } from '../types'

describe('TicketThread', () => {
  it('still shows the conversation when the response carries no events', () => {
    render(
      <TicketThread
        messages={[
          {
            id: 1,
            ticket_id: 9,
            author_id: 7,
            author_role: TICKET_AUTHOR.USER,
            author_name: 'mei',
            content: 'The gateway returns 500',
            created_at: 1791972000,
            attachments: [],
          },
        ]}
      />
    )

    expect(screen.getByText('The gateway returns 500')).toBeInTheDocument()
  })
})
