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
import { expect, it } from 'vitest'

import { buildDshSetupCommands } from '../dsh-setup'

it('builds one command per shell that runs the setup script with the code', () => {
  const commands = buildDshSetupCommands(
    'https://ai.example.test/',
    'aB3_-code'
  )

  expect(commands).toEqual({
    shell:
      'curl -fsSL https://ai.example.test/api/dsh_setup/setup.sh | sh -s -- aB3_-code',
    powershell:
      "$env:LUK_SETUP_CODE='aB3_-code'; irm https://ai.example.test/api/dsh_setup/setup.ps1 | iex",
  })
})

it('keeps the setup code out of the address the script is fetched from', () => {
  const commands = buildDshSetupCommands('https://ai.example.test', 'aB3_-code')

  for (const command of Object.values(commands)) {
    const address = command.match(/https:\/\/\S+/)?.[0]
    expect(address).not.toContain('aB3_-code')
  }
})
