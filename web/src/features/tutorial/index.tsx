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
import { useEffect, useMemo } from 'react'

import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'

import {
  TutorialFeedbackBar,
  TutorialHero,
  TutorialMobileToc,
  TutorialSection,
  TutorialToc,
} from './components'
import { useTutorialSections } from './content'
import { useActiveSection } from './hooks/use-active-section'

/**
 * 新手教程 —— the linear walkthrough a new reader follows once.
 *
 * Full-bleed public shell: the header and footer carry the site identity, and
 * this page only draws its own two columns — 240px of sticky contents, then
 * text no wider than 720px, so a line never outgrows the eye.
 */
export function Tutorial() {
  const sections = useTutorialSections()
  const ids = useMemo(() => sections.map((section) => section.id), [sections])
  const activeId = useActiveSection(ids)

  // Asking the browser to glide an anchor jump belongs to the document, not to
  // this page's box, so it is set while the tutorial is open and put back on
  // leave. `prefers-reduced-motion` wins over it: `styles/swiss.css` forces
  // `scroll-behavior: auto` there with a higher-specificity rule.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.scrollBehavior
    root.style.scrollBehavior = 'smooth'
    return () => {
      root.style.scrollBehavior = previous
    }
  }, [])

  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition className='mx-auto w-full max-w-[1128px] px-4 pb-24'>
        <TutorialHero />

        <div className='mt-8 grid grid-cols-1 items-start gap-x-6 sm:mt-14 lg:grid-cols-[240px_minmax(0,1fr)]'>
          <TutorialToc steps={sections} activeId={activeId} />

          <div className='max-w-[720px] min-w-0'>
            <TutorialFeedbackBar />
            <TutorialMobileToc steps={sections} activeId={activeId} />
            <div className='mt-14 space-y-14 lg:mt-0 lg:space-y-24'>
              {sections.map((section) => (
                <TutorialSection
                  key={section.id}
                  id={section.id}
                  number={section.number}
                  title={section.title}
                >
                  <section.Body />
                </TutorialSection>
              ))}
            </div>
          </div>
        </div>
      </PageTransition>
    </PublicLayout>
  )
}
