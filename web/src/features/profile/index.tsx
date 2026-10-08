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

import { SectionPageLayout } from '@/components/layout'
import {
  CardStaggerContainer,
  CardStaggerItem,
} from '@/components/page-transition'
import { UsageLevelCard } from '@/features/usage-level/components/usage-level-card'
import { useAuthStore } from '@/stores/auth-store'

import { LanguagePreferencesCard } from './components/language-preferences-card'
import { ProfileSettingsCard } from './components/profile-settings-card'
import { SidebarModulesCard } from './components/sidebar-modules-card'
import { useProfile } from './hooks'

/**
 * The account's settings. Who the account is, its balance and the daily
 * check-in are on the console overview.
 */
export function Profile() {
  const { t } = useTranslation()
  const { profile, loading, refreshProfile } = useProfile()
  const permissions = useAuthStore((s) => s.auth.user?.permissions)
  const canConfigureSidebar = permissions?.sidebar_settings !== false

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Settings')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('Personal settings and profile management.')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <CardStaggerContainer className='mx-auto w-full max-w-7xl'>
          <CardStaggerItem>
            <div className='grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.46fr)] xl:items-start'>
              <div className='space-y-4 sm:space-y-6'>
                <UsageLevelCard />
                <ProfileSettingsCard
                  profile={profile}
                  loading={loading}
                  onProfileUpdate={refreshProfile}
                />
                <LanguagePreferencesCard
                  profile={profile}
                  onProfileUpdate={refreshProfile}
                />
              </div>

              {canConfigureSidebar && <SidebarModulesCard />}
            </div>
          </CardStaggerItem>
        </CardStaggerContainer>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
