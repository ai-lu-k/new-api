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
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { LegalVersion } from '@/features/legal/types'
import { cn } from '@/lib/utils'

import type { SystemStatus } from '../types'

const LegalDocumentDialog = lazy(() =>
  import('@/features/legal/legal-document-dialog').then((module) => ({
    default: module.LegalDocumentDialog,
  }))
)

type DocumentKind = 'user_agreement' | 'privacy_policy'

interface LegalConsentProps {
  status: Pick<
    SystemStatus,
    'user_agreement_enabled' | 'privacy_policy_enabled'
  > | null
  version?: LegalVersion | null
  checked: boolean
  onCheckedChange: (nextValue: boolean) => void
  className?: string
  isLoading?: boolean
  hasError?: boolean
  onRetry?: () => void
}

export function LegalConsent(props: LegalConsentProps) {
  const { t } = useTranslation()
  const [document, setDocument] = useState<{
    kind: DocumentKind
    versionId: number
  } | null>(null)
  const hasUserAgreement = Boolean(props.status?.user_agreement_enabled)
  const hasPrivacyPolicy = Boolean(props.status?.privacy_policy_enabled)
  const visibleDocument =
    document?.versionId === props.version?.id ? document : null

  if (props.isLoading) return <LoadingState inline />
  if (props.hasError) {
    return <ErrorState className='min-h-0 py-2' onRetry={props.onRetry} />
  }
  if (!hasUserAgreement && !hasPrivacyPolicy) return null

  return (
    <>
      <div className={cn('flex items-start gap-2.5', props.className)}>
        <Checkbox
          id='legal-consent'
          checked={props.checked}
          onCheckedChange={(value) => props.onCheckedChange(value === true)}
          className='mt-0.5'
        />
        <div className='text-muted-foreground text-left text-xs leading-5'>
          <Label
            htmlFor='legal-consent'
            className='inline text-xs leading-5 font-normal'
          >
            {t('I have read and agree to the')}{' '}
          </Label>
          {hasUserAgreement && (
            <Button
              type='button'
              variant='link'
              aria-haspopup='dialog'
              className='h-auto rounded-sm p-0 text-xs leading-5 font-normal'
              disabled={!props.version}
              onClick={() => {
                if (props.version) {
                  setDocument({
                    kind: 'user_agreement',
                    versionId: props.version.id,
                  })
                }
              }}
            >
              {t('User Agreement')}
            </Button>
          )}
          {hasUserAgreement && hasPrivacyPolicy && t(' and the ')}
          {hasPrivacyPolicy && (
            <Button
              type='button'
              variant='link'
              aria-haspopup='dialog'
              className='h-auto rounded-sm p-0 text-xs leading-5 font-normal'
              disabled={!props.version}
              onClick={() => {
                if (props.version) {
                  setDocument({
                    kind: 'privacy_policy',
                    versionId: props.version.id,
                  })
                }
              }}
            >
              {t('Privacy Policy')}
            </Button>
          )}
          .
        </div>
      </div>
      {visibleDocument && props.version && (
        <Suspense fallback={<LoadingState inline />}>
          <LegalDocumentDialog
            version={props.version}
            document={visibleDocument.kind}
            onClose={() => setDocument(null)}
          />
        </Suspense>
      )}
    </>
  )
}
