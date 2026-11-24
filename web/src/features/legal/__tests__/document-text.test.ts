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
import { describe, expect, it } from 'vitest'

import { legalDocumentText } from '../lib/document-text'
import type { LegalVersion } from '../types'

const published: LegalVersion = {
  id: 2,
  user_agreement: '条款正文',
  privacy_policy: '隐私正文',
  user_agreement_en: 'Terms body',
  privacy_policy_en: 'Privacy body',
  digest: 'digest',
  required_version: 2,
  published_at: 0,
}

const untranslated: LegalVersion = {
  ...published,
  user_agreement_en: '',
  privacy_policy_en: '',
}

describe('legalDocumentText', () => {
  it('serves the translation to an English interface', () => {
    expect(legalDocumentText(published, 'user_agreement', 'en')).toBe(
      'Terms body'
    )
    expect(legalDocumentText(published, 'privacy_policy', 'en-US')).toBe(
      'Privacy body'
    )
  })

  it('serves the published text to every other interface language', () => {
    expect(legalDocumentText(published, 'user_agreement', 'zhCN')).toBe(
      '条款正文'
    )
    expect(legalDocumentText(published, 'privacy_policy', 'fr')).toBe(
      '隐私正文'
    )
  })

  it('falls back to the published text when the revision carries no translation', () => {
    expect(legalDocumentText(untranslated, 'user_agreement', 'en')).toBe(
      '条款正文'
    )
  })

  it('reads nothing from a revision that does not exist', () => {
    expect(legalDocumentText(null, 'user_agreement', 'en')).toBe('')
  })
})
