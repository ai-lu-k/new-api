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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createLanguageDetector } from '../language-detector'

function browserLanguage(language: string): void {
  vi.stubGlobal('navigator', {
    ...navigator,
    language,
    languages: [language],
  })
}

describe('interface language of a new visitor', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.defaultLang
  })
  afterEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.defaultLang
    vi.unstubAllGlobals()
  })

  it('follows the browser on a site with no default language', () => {
    browserLanguage('zh-TW')
    expect(createLanguageDetector().detect()).toBe('zhTW')
  })

  it('is the site default language, whatever the browser reports', () => {
    // A search engine crawls with an English browser.
    browserLanguage('en-US')
    document.documentElement.dataset.defaultLang = 'zh-CN'
    expect(createLanguageDetector().detect()).toBe('zhCN')
  })

  it('stays the language the visitor chose', () => {
    browserLanguage('en-US')
    localStorage.setItem('i18nextLng', 'ja')
    document.documentElement.dataset.defaultLang = 'zh-CN'
    expect(createLanguageDetector().detect()).toBe('ja')
  })
})
