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
import type { LegalVersion } from '../types'

/** Which document of a revision is being read. */
export type LegalDocumentKind = 'user_agreement' | 'privacy_policy'

/**
 * The reader's language of one document. A revision published before the site
 * carried a translation serves its original to everybody; the revision a
 * reader accepts is the same either way.
 */
export function legalDocumentText(
  version: LegalVersion | null | undefined,
  document: LegalDocumentKind,
  language: string | undefined
): string {
  if (!version) return ''
  const translated =
    document === 'user_agreement'
      ? version.user_agreement_en
      : version.privacy_policy_en
  const base =
    document === 'user_agreement'
      ? version.user_agreement
      : version.privacy_policy
  const english = (language ?? '').toLowerCase().startsWith('en')
  if (english && translated) return translated
  return base ?? ''
}

/** Whether both documents of a revision carry a translation. */
export function hasEnglishLegalText(
  version: LegalVersion | null | undefined
): boolean {
  if (!version) return false
  return Boolean(version.user_agreement_en && version.privacy_policy_en)
}
