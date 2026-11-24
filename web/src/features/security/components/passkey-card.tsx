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
import { AlertTriangle, KeyRound, Loader2, ShieldAlert } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPanel } from '@/components/section-panel'
import { StatusBadge } from '@/components/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { usePasskeyManagement } from '@/features/auth/passkey'
import {
  SecureVerificationDialog,
  useSecureVerification,
} from '@/features/auth/secure-verification'
import dayjs from '@/lib/dayjs'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'

interface PasskeyCardProps {
  loading: boolean
}

export function PasskeyCard({ loading: pageLoading }: PasskeyCardProps) {
  const { t } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const {
    status,
    statusError,
    fetchStatus,
    loading,
    registering,
    removing,
    supported,
    enabled,
    lastUsed,
    register,
    remove,
  } = usePasskeyManagement()

  const verification = useSecureVerification()

  const handleRegister = useCallback(async () => {
    if (registering || removing || verification.isActive) return
    const proof = await verification.requestVerification({
      scope: 'passkey.register',
    })
    if (!proof) return
    try {
      await register(proof.proof_token)
      toast.success(t('Passkey registered successfully'))
    } catch (error) {
      const failure = AuthOperationError.from(error)
      if (failure.code !== 'AUTH_CANCELLED') handleServerError(failure)
    }
  }, [register, registering, removing, t, verification])

  const handleRemove = useCallback(async () => {
    if (registering || removing || verification.isActive) return
    setConfirmOpen(false)
    const proof = await verification.requestVerification({
      scope: 'passkey.delete',
    })
    if (!proof) return
    try {
      await remove(proof.proof_token)
      toast.success(t('Passkey removed successfully'))
    } catch (error) {
      const failure = AuthOperationError.from(error)
      if (failure.code !== 'AUTH_CANCELLED') handleServerError(failure)
    }
  }, [registering, remove, removing, t, verification])

  if (pageLoading || loading) {
    return (
      <SectionPanel
        title={t('Passkey Login')}
        level='card'
        status='loading'
        placeholderClassName='h-20'
      />
    )
  }

  if (statusError) {
    return (
      <SectionPanel
        title={t('Passkey Login')}
        level='card'
        status='error'
        errorMessage={t(statusError)}
        onRetry={() => void fetchStatus()}
      />
    )
  }

  const formattedLastUsed =
    lastUsed && !Number.isNaN(Date.parse(lastUsed))
      ? dayjs(lastUsed).fromNow()
      : t('Not used yet')

  const showUnsupportedNotice = !supported && !enabled
  let backupStatus: {
    label: string
    variant: 'success' | 'warning' | 'neutral'
  } | null = null

  if (status?.backup_eligible !== undefined) {
    backupStatus = {
      label: t('No backup'),
      variant: 'neutral',
    }

    if (status.backup_eligible) {
      backupStatus = {
        label: status.backup_state ? t('Backed up') : t('Not backed up'),
        variant: status.backup_state ? 'success' : 'warning',
      }
    }
  }

  return (
    <>
      <SectionPanel
        title={t('Passkey Login')}
        description={t(
          'Use Passkey to sign in without entering your password.'
        )}
        level='card'
        contentClassName='pt-1'
      >
        <div className='space-y-6'>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
            <div className='flex items-start gap-4'>
              <KeyRound aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
              <div className='space-y-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <p className='font-medium'>{t('Passkey Authentication')}</p>
                  <StatusBadge
                    label={enabled ? t('Enabled') : t('Disabled')}
                    variant={enabled ? 'success' : 'neutral'}
                    showDot
                    copyable={false}
                  />
                  {backupStatus && (
                    <StatusBadge
                      label={backupStatus.label}
                      variant={backupStatus.variant}
                      showDot
                      copyable={false}
                    />
                  )}
                </div>
                <p className='text-muted-foreground text-sm'>
                  {t('Last used:')} {formattedLastUsed}
                </p>
              </div>
            </div>

            {!enabled && (
              <Button
                className='min-h-11 w-full sm:min-h-8 sm:w-auto'
                onClick={handleRegister}
                disabled={!supported || registering || verification.isActive}
              >
                {registering && (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                )}
                {t('Enable Passkey')}
              </Button>
            )}
          </div>

          {enabled && (
            <div className='flex flex-col gap-3 border-t pt-6 sm:flex-row xl:flex-col 2xl:flex-row'>
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant='destructive'
                      className='flex-1'
                      disabled={removing}
                    />
                  }
                >
                  {removing ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <AlertTriangle className='mr-2 h-4 w-4' />
                  )}
                  {t('Remove Passkey')}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('Remove Passkey?')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t(
                        'Removing Passkey will require you to sign in with your password next time. You can re-register anytime.'
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={removing}>
                      {t('Cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant='destructive'
                      disabled={removing}
                      onClick={(event) => {
                        event.preventDefault()
                        handleRemove()
                      }}
                    >
                      {t('Remove')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {showUnsupportedNotice && (
            <div className='bg-muted/60 text-muted-foreground flex items-start gap-3 p-4 text-sm'>
              <ShieldAlert
                aria-hidden='true'
                className='mt-0.5 h-4 w-4 shrink-0'
              />
              <div>
                <p className='text-foreground font-medium'>
                  {t('Passkey not supported on this device')}
                </p>
                <p>
                  {t(
                    'Use a compatible browser or device with biometric authentication or a security key to register a Passkey.'
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </SectionPanel>

      <SecureVerificationDialog {...verification.dialogProps} />
    </>
  )
}
