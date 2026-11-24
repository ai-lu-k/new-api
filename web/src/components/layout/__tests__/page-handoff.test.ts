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
import { afterEach, describe, expect, it } from 'vitest'

import {
  capturePageFrame,
  clearPageFrame,
  readPageFrame,
} from '../lib/page-handoff'

afterEach(() => {
  clearPageFrame()
  document.body.innerHTML = ''
})

/**
 * The page handoff is switched off (2026-11-05): the outgoing public page must
 * not leave a frame behind, so the next page never draws a falling copy of it.
 */
describe('page handoff with the switch off', () => {
  it('leaves no frame for the page that replaces the outgoing one', () => {
    const root = document.createElement('div')
    root.innerHTML = '<main><p>旧页内容</p></main>'
    document.body.append(root)

    capturePageFrame('/about', root)

    expect(readPageFrame('/guide')).toBeNull()
  })
})
