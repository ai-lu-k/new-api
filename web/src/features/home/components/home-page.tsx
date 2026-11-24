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
import { PublicLayout } from '@/components/layout'
import { useAuthStore } from '@/stores/auth-store'

import { useGiftStats, useHomeFigures } from '../hooks'
import { CostSection } from './cost-section'
import { GiftSection } from './gift-section'
import { GrowthSection } from './growth-section'
import { HomeHero } from './home-hero'
import { ThroughputSection } from './throughput-section'

/**
 * The default home page: one screen of positioning and live figures, then the
 * gift ledger, thirty days of traffic, the last day's throughput, and the
 * published costs.
 *
 * It only renders when no custom home page is configured; a stored URL, HTML or
 * Markdown home page takes the whole page instead (see `Home`).
 */
export function HomePage() {
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  const figures = useHomeFigures()
  const gifts = useGiftStats()

  return (
    <PublicLayout showMainContainer={false}>
      <main className='mx-auto w-full max-w-[1128px] px-4 pb-12'>
        <HomeHero figures={figures} signedIn={signedIn} />
        <GiftSection stats={gifts.stats} />
        <GrowthSection figures={figures} />
        <ThroughputSection figures={figures} />
        <CostSection />
      </main>
    </PublicLayout>
  )
}
