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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { Button } from '@/components/ui/button'
import { LegalConsent } from '@/features/auth/components/legal-consent'
import { handleServerError } from '@/lib/handle-server-error'

import { acceptLegalConsent, getLegalConsent } from './api'
import type { LegalVersion } from './types'
import { useLegalVersion } from './use-legal-version'

function AcceptCurrentLegal(props: {
  version: LegalVersion
  onAccepted: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [checked, setChecked] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const queryClient = useQueryClient()
  const accept = useMutation({
    mutationFn: () =>
      acceptLegalConsent({ accepted: checked, version_id: props.version.id }),
    onSuccess: props.onAccepted,
    onError: (error) => {
      setChecked(false)
      void queryClient.invalidateQueries({ queryKey: ['legal-version'] })
      handleServerError(error)
    },
  })
  return (
    <>
      <Dialog
        open={!signOutOpen}
        onOpenChange={(_, details) => details.cancel()}
        disablePointerDismissal
        showCloseButton={false}
        title={t('Review legal documents')}
        description={t('Please review and accept the current legal documents')}
        contentClassName='sm:max-w-lg'
        footer={
          <>
            <Button variant='ghost' onClick={() => setSignOutOpen(true)}>
              {t('Sign out')}
            </Button>
            <Button variant='outline' render={<a href='/feedback' />}>
              {t('Feedback')}
            </Button>
            <Button
              disabled={!checked || accept.isPending}
              onClick={() => accept.mutate()}
            >
              {t('Agree and continue')}
            </Button>
          </>
        }
      >
        <LegalConsent
          status={{
            user_agreement_enabled: Boolean(props.version.user_agreement),
            privacy_policy_enabled: Boolean(props.version.privacy_policy),
          }}
          version={props.version}
          checked={checked}
          onCheckedChange={setChecked}
        />
      </Dialog>
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </>
  )
}

export function LegalGate(props: { children: ReactNode }) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const legal = useLegalVersion()
  const consent = useQuery({
    queryKey: ['legal-consent'],
    queryFn: getLegalConsent,
    staleTime: 0,
  })
  // The authenticated support page remains usable before accepting an update.
  if (location.pathname === '/feedback') return props.children
  if (consent.isPending || legal.isPending) return <LoadingState />
  if (consent.isError || legal.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void consent.refetch()
          void legal.refetch()
        }}
      />
    )
  }
  if (consent.data?.required && !legal.version) {
    return (
      <ErrorState
        onRetry={() => {
          void legal.refetch()
        }}
      />
    )
  }
  if (consent.data?.required && legal.version) {
    return (
      <AcceptCurrentLegal
        key={legal.version.id}
        version={legal.version}
        onAccepted={async () => {
          await queryClient.invalidateQueries({ queryKey: ['legal-consent'] })
          await queryClient.invalidateQueries({
            predicate: (query) =>
              query.queryKey[0] !== 'legal-consent' &&
              query.queryKey[0] !== 'legal-version',
          })
        }}
      />
    )
  }
  return props.children
}
