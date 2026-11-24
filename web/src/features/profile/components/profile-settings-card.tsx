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
import { useTranslation } from 'react-i18next'

import { SectionPanel } from '@/components/section-panel'

import type { UserProfile } from '../types'
import { NotificationTab } from './tabs/notification-tab'

// ============================================================================
// Profile Settings Card Component
// ============================================================================

interface ProfileSettingsCardProps {
  profile: UserProfile | null
  loading: boolean
  onProfileUpdate: () => void
  onDirtyChange?: (dirty: boolean) => void
}

export function ProfileSettingsCard({
  profile,
  loading,
  onProfileUpdate,
  onDirtyChange,
}: ProfileSettingsCardProps) {
  const { t } = useTranslation()

  return (
    <SectionPanel
      title={t('Notifications')}
      description={t('Settings & Preferences')}
      status={loading ? 'loading' : 'ready'}
      placeholderClassName='h-52'
      contentClassName='pt-1'
    >
      <NotificationTab
        profile={profile}
        onUpdate={onProfileUpdate}
        onDirtyChange={onDirtyChange}
      />
    </SectionPanel>
  )
}
