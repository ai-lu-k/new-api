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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout/components/section-page-layout'
import { Reveal } from '@/components/motion/reveal'
import { SectionHeading } from '@/components/section-heading'
import { SettingsShell } from '@/components/settings-shell'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfile } from '@/features/profile/hooks/use-profile'

import { AccessTokenCard } from './components/access-token-card'
import { AccountActionCard } from './components/account-action-card'
import { AccountBindings } from './components/account-bindings'
import { LoginSessionsCard } from './components/login-sessions-card'
import { PasskeyCard } from './components/passkey-card'
import { PrivacyCard } from './components/privacy-card'
import { TwoFACard } from './components/two-fa-card'

/**
 * Security & access: sign-in methods, live sessions and the account's own
 * destructive actions, chosen from the group list on the left.
 */
export function Security() {
  const { t } = useTranslation()
  const { profile, loading, refreshProfile, fetchProfile } = useProfile()

  const groups = [
    { id: 'security-authentication', label: t('Login & Authentication') },
    { id: 'security-verification', label: t('Security verification') },
    { id: 'security-access', label: t('Sessions & Access') },
    { id: 'security-privacy', label: t('Privacy') },
    { id: 'security-account', label: t('Account Actions') },
  ]

  let content: ReactNode
  if (loading) {
    content = (
      <div role='status' aria-label={t('Loading...')} className='space-y-4'>
        <Skeleton className='h-28 w-full' />
        <Skeleton className='h-52 w-full' />
        <Skeleton className='h-52 w-full' />
      </div>
    )
  } else if (!profile) {
    content = (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('Failed to load profile')}</EmptyTitle>
          <EmptyDescription>
            {t('Refresh the list and try again.')}
          </EmptyDescription>
        </EmptyHeader>
        <Button
          type='button'
          variant='outline'
          onClick={() => void fetchProfile()}
        >
          {t('Retry')}
        </Button>
      </Empty>
    )
  } else {
    content = (
      <div className='min-w-0 space-y-6 sm:space-y-8'>
        <section id='security-authentication' className='scroll-mt-4 space-y-3'>
          <Reveal className='space-y-3'>
            <SectionHeading
              as='h2'
              title={t('Login & Authentication')}
              className='border-border border-b pb-2'
            />
            <AccountActionCard
              action='password'
              username={profile.username}
              hasPassword={profile.has_password}
              onUpdate={refreshProfile}
            />
            <div className='border-border space-y-3 border-t pt-3'>
              <SectionHeading
                as='h3'
                level='card'
                title={t('Account Bindings')}
              />
              <AccountBindings profile={profile} onUpdate={refreshProfile} />
            </div>
          </Reveal>
        </section>

        <section id='security-verification' className='scroll-mt-4 space-y-3'>
          <Reveal delay={0.04} className='space-y-3'>
            <SectionHeading
              as='h2'
              title={t('Security verification')}
              className='border-border border-b pb-2'
            />
            <PasskeyCard loading={loading} />
            <TwoFACard loading={loading} />
          </Reveal>
        </section>

        <section id='security-access' className='scroll-mt-4 space-y-3'>
          <Reveal delay={0.08} className='space-y-3'>
            <SectionHeading
              as='h2'
              title={t('Sessions & Access')}
              className='border-border border-b pb-2'
            />
            <LoginSessionsCard />
            <AccessTokenCard />
          </Reveal>
        </section>

        <section id='security-privacy' className='scroll-mt-4 space-y-3'>
          <Reveal delay={0.12} className='space-y-3'>
            <SectionHeading
              as='h2'
              title={t('Privacy')}
              className='border-border border-b pb-2'
            />
            <PrivacyCard profile={profile} onUpdate={refreshProfile} />
          </Reveal>
        </section>

        <section id='security-account' className='scroll-mt-4 space-y-3'>
          <Reveal delay={0.12} className='space-y-3'>
            <SectionHeading
              as='h2'
              title={t('Account Actions')}
              className='border-border border-b pb-2'
            />
            <AccountActionCard action='delete' username={profile.username} />
          </Reveal>
        </section>
      </div>
    )
  }

  return (
    <SectionPageLayout pageIndex={<>{t('Personal workspace')} / 10</>}>
      <SectionPageLayout.Title>
        {t('Security & Access')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('Manage your security settings and account access')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <SettingsShell navLabel={t('Security & Access')} items={groups}>
          {content}
        </SettingsShell>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
