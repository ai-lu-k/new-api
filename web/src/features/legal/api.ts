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
import i18next from 'i18next'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { legalDocumentText } from './lib/document-text'
import type {
  LegalAcceptance,
  LegalDocumentResponse,
  LegalVersion,
} from './types'

/** The interface language the documents are read in. */
export function legalLanguage(): string {
  return i18next.resolvedLanguage || i18next.language || 'en'
}

// Both documents drop the client's global `Cache-Control: no-store` for the
// same reason as getNotice in @/lib/api: `no-store` stops the browser from
// keeping a copy, so it would never hold an ETag to revalidate with and the
// server could never answer 304. These are the largest payloads in this family
// and are re-fetched on every sign-up, so the saving is the most visible here.
export async function getUserAgreement(): Promise<LegalDocumentResponse> {
  const version = new URLSearchParams(window.location.search).get('version')
  if (version && /^[1-9]\d*$/.test(version)) {
    const result = await getLegalVersion(Number(version))
    return {
      success: result.success,
      data: legalDocumentText(result.data, 'user_agreement', legalLanguage()),
    }
  }
  const res = await api.get<LegalDocumentResponse>('/api/user-agreement', {
    headers: { 'Cache-Control': null },
    params: { lang: legalLanguage() },
  })
  return res.data
}

export async function getPrivacyPolicy(): Promise<LegalDocumentResponse> {
  const version = new URLSearchParams(window.location.search).get('version')
  if (version && /^[1-9]\d*$/.test(version)) {
    const result = await getLegalVersion(Number(version))
    return {
      success: result.success,
      data: legalDocumentText(result.data, 'privacy_policy', legalLanguage()),
    }
  }
  const res = await api.get<LegalDocumentResponse>('/api/privacy-policy', {
    headers: { 'Cache-Control': null },
    params: { lang: legalLanguage() },
  })
  return res.data
}

export async function getLegalVersion(version?: number) {
  const response = await api.get<{
    success: boolean
    data: LegalVersion | null
  }>(version ? `/api/legal/versions/${version}` : '/api/legal/current')
  return requireServerSuccess(response.data)
}

export async function getLegalConsent() {
  const response = await api.get<{
    success: boolean
    data: {
      required: boolean
      records: { version_id: number; accepted_at: number }[]
    }
  }>('/api/user/legal-consent')
  return requireServerSuccess(response.data).data
}

export async function acceptLegalConsent(acceptance: LegalAcceptance) {
  requireServerSuccess(
    (
      await api.post<{ success: boolean; message?: string }>(
        '/api/user/legal-consent',
        acceptance
      )
    ).data
  )
}

export async function publishLegalVersion(request: {
  user_agreement?: string
  privacy_policy?: string
  user_agreement_en?: string
  privacy_policy_en?: string
  material: boolean
  expected_version: number
}) {
  return requireServerSuccess(
    (
      await api.post<{ success: boolean; data: LegalVersion }>(
        '/api/option/legal',
        request
      )
    ).data
  )
}
