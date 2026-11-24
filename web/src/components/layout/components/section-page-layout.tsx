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
import {
  Children,
  isValidElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'

import { Main } from './main'
import { PageFooterProvider } from './page-footer'

type SlotProps = { children?: ReactNode }

function SectionPageLayoutTitle(_props: SlotProps) {
  return null
}
SectionPageLayoutTitle.displayName = 'SectionPageLayout.Title'

/** One line under the title saying what the page is for. */
function SectionPageLayoutDescription(_props: SlotProps) {
  return null
}
SectionPageLayoutDescription.displayName = 'SectionPageLayout.Description'

function SectionPageLayoutActions(_props: SlotProps) {
  return null
}
SectionPageLayoutActions.displayName = 'SectionPageLayout.Actions'

function SectionPageLayoutContent(_props: SlotProps) {
  return null
}
SectionPageLayoutContent.displayName = 'SectionPageLayout.Content'

function SectionPageLayoutBreadcrumb(_props: SlotProps) {
  return null
}
SectionPageLayoutBreadcrumb.displayName = 'SectionPageLayout.Breadcrumb'

export type SectionPageLayoutProps = {
  children: ReactNode
  fixedContent?: boolean
  stackActionsOnMobile?: boolean
  pageIndex?: ReactNode
}

export function SectionPageLayout(props: SectionPageLayoutProps) {
  const [footerContainer, setFooterContainer] = useState<HTMLDivElement | null>(
    null
  )

  // Publish the footer height so overlays anchored to the viewport bottom (the
  // bulk-action bar) can clear it instead of covering the pagination.
  useEffect(() => {
    if (!footerContainer) return undefined
    const root = document.documentElement
    const publish = () => {
      root.style.setProperty(
        '--app-page-footer-height',
        `${footerContainer.offsetHeight}px`
      )
    }
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(footerContainer)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--app-page-footer-height')
    }
  }, [footerContainer])

  let title: ReactNode = null
  let description: ReactNode = null
  let actions: ReactNode = null
  let content: ReactNode = null
  let breadcrumb: ReactNode = null

  Children.forEach(props.children, (node) => {
    if (!isValidElement(node)) return
    const child = node as ReactElement<SlotProps>
    if (child.type === SectionPageLayoutTitle) title = child.props.children
    else if (child.type === SectionPageLayoutDescription) {
      description = child.props.children
    } else if (child.type === SectionPageLayoutActions) {
      actions = child.props.children
    } else if (child.type === SectionPageLayoutContent) {
      content = child.props.children
    } else if (child.type === SectionPageLayoutBreadcrumb) {
      breadcrumb = child.props.children
    }
  })

  const editorial = props.pageIndex != null && !props.fixedContent
  const contentOverflow = props.fixedContent
    ? 'overflow-hidden'
    : 'overflow-auto'

  return (
    <PageFooterProvider container={footerContainer}>
      <Main className={editorial ? 'overflow-y-auto' : undefined}>
        <div className='shrink-0 px-(--app-page-gutter,1rem) pt-3 pb-3 sm:pt-4 sm:pb-4'>
          {breadcrumb != null && (
            <div className='mb-2 sm:mb-3'>{breadcrumb}</div>
          )}
          <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:gap-x-4'>
            <div
              className={
                props.stackActionsOnMobile
                  ? 'min-w-0 flex-1 max-sm:basis-full'
                  : 'min-w-0 flex-1'
              }
            >
              {props.pageIndex != null && (
                <p
                  data-vt-name='page-eyebrow'
                  className='text-destructive mb-0.5 text-[11px] font-semibold tracking-wide'
                >
                  {props.pageIndex}
                </p>
              )}
              <h1
                data-vt-name='page-title'
                className='w-fit max-w-full text-xl leading-[1.15] font-bold tracking-tight [overflow-wrap:anywhere] sm:text-2xl'
              >
                {title}
              </h1>
              {description != null && (
                <p className='text-muted-foreground mt-1 text-[13px] leading-snug [overflow-wrap:anywhere]'>
                  {description}
                </p>
              )}
            </div>
            {actions != null && (
              <div
                data-vt-name='page-actions'
                className={cn(
                  'flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-x-4',
                  editorial && 'lg:[&_button]:h-9 lg:[&_button]:px-4'
                )}
              >
                {actions}
              </div>
            )}
          </div>
        </div>

        {/*
          The page body: everything that belongs to this page alone. The header
          band above (breadcrumb, eyebrow, title, description, actions) keeps
          its own identity across a navigation, so it must stay outside this
          layer — a body that contained it would drag the chrome down with it
          (see `.agents/design/ui-motion.md` §10.2).
        */}
        <div
          data-vt-name='page-body'
          className={editorial ? undefined : 'flex min-h-0 flex-1 flex-col'}
        >
          <div
            className={cn(
              'px-(--app-page-gutter,1rem) pb-8',
              editorial ? 'shrink-0' : 'min-h-0 flex-1 pt-1 pb-4 sm:pb-6',
              !editorial && contentOverflow
            )}
          >
            {content}
          </div>

          <div
            ref={setFooterContainer}
            data-slot='page-footer'
            className='bg-background shrink-0 border-t px-(--app-page-gutter,1rem) py-2.5 empty:hidden sm:py-3'
          />
        </div>
      </Main>
    </PageFooterProvider>
  )
}

SectionPageLayout.Title = SectionPageLayoutTitle
SectionPageLayout.Description = SectionPageLayoutDescription
SectionPageLayout.Actions = SectionPageLayoutActions
SectionPageLayout.Content = SectionPageLayoutContent
SectionPageLayout.Breadcrumb = SectionPageLayoutBreadcrumb
