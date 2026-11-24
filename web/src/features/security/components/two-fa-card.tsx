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
import { Shield, AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SectionPanel } from '@/components/section-panel'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { SecureVerificationDialog } from '@/features/auth/secure-verification'
import { useDialogs } from '@/hooks/use-dialog'

import { useTwoFA } from '../hooks/use-two-fa'
import { useTwoFASetup } from '../hooks/use-two-fa-setup'
import { TwoFABackupDialog } from './dialogs/two-fa-backup-dialog'
import { TwoFADisableDialog } from './dialogs/two-fa-disable-dialog'
import { TwoFASetupDialog } from './dialogs/two-fa-setup-dialog'

// ============================================================================
// Two-Factor Authentication Card Component
// ============================================================================

interface TwoFACardProps {
  loading: boolean
}

type DialogKey = 'disable' | 'backup'

export function TwoFACard({ loading: pageLoading }: TwoFACardProps) {
  const { t } = useTranslation()
  const { status, loading, error, refetch } = useTwoFA(!pageLoading)
  const dialogs = useDialogs<DialogKey>()
  const setup = useTwoFASetup(refetch)

  if (pageLoading || loading) {
    return (
      <SectionPanel
        title={t('Two-Factor Authentication')}
        level='card'
        status='loading'
        placeholderClassName='h-20'
      />
    )
  }

  if (error) {
    return (
      <div role='alert'>
        <SectionPanel
          title={t('Two-Factor Authentication')}
          level='card'
          status='error'
          errorMessage={t(error)}
          onRetry={() => void refetch()}
        />
      </div>
    )
  }

  return (
    <>
      <SectionPanel
        title={t('Two-Factor Authentication')}
        description={t('Add an extra layer of security to your account')}
        level='card'
        contentClassName='pt-1'
      >
        <div className='space-y-6'>
          {/* Status Section */}
          <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
            <div className='flex items-start gap-4'>
              <Shield aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
              <div className='space-y-1'>
                <div className='flex items-center gap-2'>
                  <p className='font-medium'>{t('Two-Step Verification')}</p>
                  {status.enabled ? (
                    <StatusBadge
                      label={t('Enabled')}
                      variant='success'
                      showDot
                      copyable={false}
                    />
                  ) : (
                    <StatusBadge
                      label={t('Disabled')}
                      variant='neutral'
                      showDot
                      copyable={false}
                    />
                  )}
                  {status.locked && (
                    <StatusBadge
                      label={t('Locked')}
                      variant='danger'
                      showDot
                      copyable={false}
                    />
                  )}
                </div>
                <p className='text-muted-foreground text-sm'>
                  {status.enabled
                    ? t('Backup codes remaining: {{count}}', {
                        count: status.backup_codes_remaining,
                      })
                    : t('Add an extra layer of security to your account')}
                </p>
              </div>
            </div>

            {!status.enabled && (
              <Button
                className='min-h-11 w-full sm:min-h-8 sm:w-auto'
                onClick={setup.start}
                disabled={setup.active}
              >
                {t('Enable')}
              </Button>
            )}
          </div>

          {/* Actions Section - Only show when enabled */}
          {status.enabled && (
            <div className='flex flex-col gap-3 border-t pt-6 sm:flex-row xl:flex-col 2xl:flex-row'>
              <Button
                variant='outline'
                className='flex-1'
                onClick={() => dialogs.open('backup')}
              >
                <RefreshCw className='mr-2 h-4 w-4' />
                {t('Regenerate Backup Codes')}
              </Button>
              <Button
                variant='destructive'
                className='flex-1'
                onClick={() => dialogs.open('disable')}
              >
                <AlertTriangle className='mr-2 h-4 w-4' />
                {t('Disable 2FA')}
              </Button>
            </div>
          )}
        </div>
      </SectionPanel>

      {/* Dialogs */}
      <SecureVerificationDialog {...setup.verificationDialogProps} />
      <TwoFASetupDialog
        key={setup.setupDialogProps.setupData?.flow_token ?? 'initializing'}
        {...setup.setupDialogProps}
      />

      <TwoFADisableDialog
        open={dialogs.isOpen('disable')}
        onOpenChange={(open) =>
          open ? dialogs.open('disable') : dialogs.close('disable')
        }
        onSuccess={refetch}
      />

      <TwoFABackupDialog
        open={dialogs.isOpen('backup')}
        onOpenChange={(open) =>
          open ? dialogs.open('backup') : dialogs.close('backup')
        }
        onSuccess={refetch}
      />
    </>
  )
}
