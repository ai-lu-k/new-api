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
import { beforeEach, describe, expect, it } from 'vitest'

import i18n from '../config'

describe('documentElement lang follows the interface language', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en'
  })

  it('updates html lang whenever the interface language changes', async () => {
    await i18n.changeLanguage('zhCN')
    expect(document.documentElement.lang).toBe('zh-CN')

    await i18n.changeLanguage('zhTW')
    expect(document.documentElement.lang).toBe('zh-TW')

    await i18n.changeLanguage('fr')
    expect(document.documentElement.lang).toBe('fr')

    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('falls back to en for a language outside supportedLngs', async () => {
    await i18n.changeLanguage('xx-YY')
    expect(document.documentElement.lang).toBe('en')
  })
})
