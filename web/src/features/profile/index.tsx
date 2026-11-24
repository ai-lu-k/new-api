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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { SettingsShell } from '@/components/settings-shell'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'
import { UsageLevelCard } from '@/features/usage-level/components/usage-level-card'
import { USAGE_LEVEL_VISIBLE } from '@/features/usage-level/visibility'
import { useAuthStore } from '@/stores/auth-store'

import { LanguagePreferencesCard } from './components/language-preferences-card'
import { ProfileSettingsCard } from './components/profile-settings-card'
import { SidebarModulesCard } from './components/sidebar-modules-card'
import { useProfile } from './hooks'

/**
 * The account's settings: one group at a time, chosen from the group list on
 * the left. Who the account is, its balance and the daily check-in live on the
 * console overview.
 */
export function Profile() {
  const { t } = useTranslation()
  const { profile, loading, refreshProfile } = useProfile()
  const permissions = useAuthStore((s) => s.auth.user?.permissions)
  const canConfigureSidebar = permissions?.sidebar_settings !== false
  // The notification group saves on its own; leaving the page with edits in it
  // asks first instead of dropping them.
  const [notificationsDirty, setNotificationsDirty] = useState(false)

  const groups = [
    ...(USAGE_LEVEL_VISIBLE
      ? [{ id: 'usage-level', label: t('Usage level') }]
      : []),
    { id: 'notifications', label: t('Notifications') },
    { id: 'language', label: t('Language Preferences') },
    ...(canConfigureSidebar
      ? [{ id: 'sidebar', label: t('Sidebar Personal Settings') }]
      : []),
  ]

  return (
    <>
      <SectionPageLayout pageIndex={<>{t('Personal workspace')} / 09</>}>
        <SectionPageLayout.Title>{t('Settings')}</SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t('Personal settings and profile management.')}
        </SectionPageLayout.Description>
        <SectionPageLayout.Content>
          <SettingsShell navLabel={t('Settings')} items={groups}>
            <div className='min-w-0 space-y-6 sm:space-y-8'>
              {USAGE_LEVEL_VISIBLE && (
                <div id='usage-level' className='scroll-mt-4'>
                  <UsageLevelCard />
                </div>
              )}
              <div id='notifications' className='scroll-mt-4'>
                <ProfileSettingsCard
                  profile={profile}
                  loading={loading}
                  onProfileUpdate={refreshProfile}
                  onDirtyChange={setNotificationsDirty}
                />
              </div>
              <div id='language' className='scroll-mt-4'>
                <LanguagePreferencesCard
                  profile={profile}
                  onProfileUpdate={refreshProfile}
                />
              </div>
              {canConfigureSidebar && (
                <div id='sidebar' className='scroll-mt-4'>
                  <SidebarModulesCard />
                </div>
              )}
            </div>
          </SettingsShell>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <FormNavigationGuard when={notificationsDirty} />
    </>
  )
}
