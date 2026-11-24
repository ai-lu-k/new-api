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
import { describe, expect, it } from 'vitest'

import { ApiKeySharedName } from '../components/api-key-shared-name'
import { ApiKeysProvider, useApiKeys } from '../components/api-keys-provider'
import type { ApiKey } from '../types'

const KEY: ApiKey = {
  id: 42,
  name: 'CI token',
  key: 'abcd1234',
  status: 1,
  remain_quota: 0,
  used_quota: 0,
  unlimited_quota: true,
  expired_time: -1,
  created_time: 0,
  accessed_time: 0,
  group: 'default',
  auto_groups: null,
  cross_group_retry: false,
  model_limits_enabled: false,
  model_limits: '',
  allow_ips: '',
}

/** Opens the edit drawer the way the row action does, without the drawer. */
function Harness() {
  const { setCurrentRow, setOpen } = useApiKeys()

  return (
    <>
      <button
        type='button'
        onClick={() => {
          setCurrentRow(KEY)
          setOpen('update')
        }}
      >
        Edit
      </button>
      <ApiKeySharedName apiKey={KEY} />
    </>
  )
}

describe('ApiKeySharedName', () => {
  it('names the row after its key so the drawer can morph into it', () => {
    render(
      <ApiKeysProvider>
        <Harness />
      </ApiKeysProvider>
    )

    const name = screen.getByText('CI token')
    expect(name).toHaveAttribute('data-vt-name', 'key-42')
    expect(name.style.getPropertyValue('view-transition-name')).toBe('key-42')
  })

  it('steps aside while the key is open in the edit drawer', async () => {
    const user = userEvent.setup()
    render(
      <ApiKeysProvider>
        <Harness />
      </ApiKeysProvider>
    )

    await user.click(screen.getByRole('button', { name: 'Edit' }))

    // The name may only exist once per snapshot: the drawer holds it now.
    expect(screen.getByText('CI token')).not.toHaveAttribute('data-vt-name')
  })
})
