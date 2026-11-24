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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import * as legalAPI from '../api'
import { LegalGate } from '../legal-gate'
import type { LegalVersion } from '../types'

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/dashboard' }),
}))
vi.mock('@/components/sign-out-dialog', () => ({ SignOutDialog: () => null }))

const initialVersion: LegalVersion = {
  id: 1,
  user_agreement: 'Terms',
  privacy_policy: 'Privacy',
  digest: 'hash-v1',
  required_version: 1,
  published_at: 100,
}

afterEach(() => vi.restoreAllMocks())

function renderGate() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <LegalGate>
          <p>Private account tools</p>
        </LegalGate>
      </QueryClientProvider>
    ),
  }
}

test('requires an explicit checkbox and sends the displayed immutable version', async () => {
  let required = true
  vi.spyOn(legalAPI, 'getLegalVersion').mockResolvedValue({
    success: true,
    data: initialVersion,
  })
  vi.spyOn(legalAPI, 'getLegalConsent').mockImplementation(async () => ({
    required,
    records: [],
  }))
  const accept = vi
    .spyOn(legalAPI, 'acceptLegalConsent')
    .mockImplementation(async () => {
      required = false
    })
  renderGate()
  const button = await screen.findByRole('button', {
    name: 'Agree and continue',
  })
  expect(
    screen.getByRole('dialog', { name: 'Review legal documents' })
  ).toBeVisible()
  expect(button).toBeDisabled()
  expect(screen.queryByText('Private account tools')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'User Agreement' }))
  const document = await screen.findByRole('dialog', { name: 'User Agreement' })
  expect(within(document).getByText('Terms')).toBeVisible()
  expect(within(document).getByText('Version 1')).toBeVisible()
  await userEvent.click(within(document).getByRole('button', { name: 'Back' }))
  expect(
    screen.getByRole('dialog', { name: 'Review legal documents' })
  ).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(button)
  expect(accept).toHaveBeenCalledWith({ accepted: true, version_id: 1 })
  expect(await screen.findByText('Private account tools')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('an updated version resets an existing checkbox before it can be accepted', async () => {
  let version = initialVersion
  vi.spyOn(legalAPI, 'getLegalVersion').mockImplementation(async () => ({
    success: true,
    data: version,
  }))
  vi.spyOn(legalAPI, 'getLegalConsent').mockResolvedValue({
    required: true,
    records: [],
  })
  const accept = vi.spyOn(legalAPI, 'acceptLegalConsent').mockResolvedValue()
  const { client } = renderGate()
  await screen.findByRole('checkbox')
  await userEvent.click(screen.getByRole('checkbox'))
  expect(
    screen.getByRole('button', { name: 'Agree and continue' })
  ).toBeEnabled()
  version = {
    ...initialVersion,
    id: 2,
    user_agreement: 'Changed terms',
    required_version: 2,
  }
  await client.invalidateQueries({ queryKey: ['legal-version'] })
  await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked())
  await userEvent.click(screen.getByRole('button', { name: 'User Agreement' }))
  const document = await screen.findByRole('dialog', { name: 'User Agreement' })
  expect(within(document).getByText('Changed terms')).toBeVisible()
  expect(within(document).getByText('Version 2')).toBeVisible()
  await userEvent.click(within(document).getByRole('button', { name: 'Back' }))
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(
    screen.getByRole('button', { name: 'Agree and continue' })
  ).toBeDisabled()
  expect(accept).not.toHaveBeenCalled()
})

test('a failed consent lookup does not expose protected tools', async () => {
  vi.spyOn(legalAPI, 'getLegalVersion').mockResolvedValue({
    success: true,
    data: initialVersion,
  })
  vi.spyOn(legalAPI, 'getLegalConsent').mockRejectedValue(
    new Error('unavailable')
  )
  renderGate()
  await screen.findByRole('button', { name: 'Retry' })
  expect(screen.queryByText('Private account tools')).not.toBeInTheDocument()
})

test('the consent API rejects a business failure instead of treating HTTP 200 as acceptance', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: false,
      message: 'Legal documents changed. Please review them again',
    },
  })
  await expect(
    legalAPI.acceptLegalConsent({ accepted: true, version_id: 1 })
  ).rejects.toThrow()
})

test('the consent dialog traps keyboard focus and cannot dismiss an unsigned update', async () => {
  vi.spyOn(legalAPI, 'getLegalVersion').mockResolvedValue({
    success: true,
    data: initialVersion,
  })
  vi.spyOn(legalAPI, 'getLegalConsent').mockResolvedValue({
    required: true,
    records: [],
  })
  const accept = vi.spyOn(legalAPI, 'acceptLegalConsent').mockResolvedValue()
  renderGate()
  const dialog = await screen.findByRole('dialog', {
    name: 'Review legal documents',
  })
  const checkbox = screen.getByRole('checkbox')
  checkbox.focus()
  await userEvent.keyboard(' ')
  expect(checkbox).toBeChecked()
  await userEvent.keyboard('{Escape}')
  expect(dialog).toBeVisible()
  await userEvent.click(document.body)
  expect(dialog).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Close' })
  ).not.toBeInTheDocument()
  screen.getByRole('button', { name: 'Agree and continue' }).focus()
  await userEvent.tab()
  expect(dialog).toContainElement(document.activeElement as HTMLElement)
  expect(accept).not.toHaveBeenCalled()
})
