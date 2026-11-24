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
import { within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { renderTutorial } from './render-tutorial'

/** The anchors other pages deep-link to; they are a contract, not a detail. */
const STEP_IDS = ['step-key', 'step-call', 'step-clients', 'step-agent']

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: { success: true, data: url === '/api/notice' ? '' : {} },
  }))
})

it('gives each of the four sections its deep-link anchor', async () => {
  await renderTutorial()

  for (const id of STEP_IDS) {
    expect(document.querySelector(`#${id}`)?.tagName).toBe('SECTION')
  }
})

it('offsets every section below the sticky header so an anchor lands in view', async () => {
  await renderTutorial()

  for (const id of STEP_IDS) {
    expect(document.querySelector(`#${id}`)).toHaveClass('scroll-mt-24')
  }
})

it('keeps the phone contents folded until the reader opens it', async () => {
  await renderTutorial()

  const details = document.querySelector(
    "details[data-slot='tutorial-toc-mobile']"
  )
  expect(details).not.toBeNull()
  expect(details).not.toHaveAttribute('open')
})

it('keeps a ticket entry beside the reader instead of at the end of the text', async () => {
  await renderTutorial()

  const entry = document.querySelector("nav [data-slot='tutorial-feedback']")
  expect(entry).not.toBeNull()

  // Twice on the page — the sticky column and the phone's pinned bar — both
  // opening the ticket page.
  const links = within(entry as HTMLElement).getAllByRole('link')
  expect(links).toHaveLength(1)
  expect(links[0]).toHaveAttribute('href', '/tickets')

  const bar = document.querySelector("[data-slot='tutorial-feedback-bar']")
  expect(bar).not.toBeNull()
  expect(within(bar as HTMLElement).getByRole('link')).toHaveAttribute(
    'href',
    '/tickets'
  )
})

it('pins the phone bar under the header and releases it before the footer', async () => {
  await renderTutorial()

  const bar = document.querySelector("[data-slot='tutorial-feedback-bar']")
  // Fixed offset would cover the footer; the bar scrolls with the article.
  expect(bar).toHaveClass('sticky')
  expect(bar).not.toHaveClass('fixed')
  expect(bar?.parentElement).toBe(
    document.querySelector('#step-key')?.parentElement?.parentElement
  )
})

it('keeps the ticket entries out of the numbered steps', async () => {
  await renderTutorial()

  // Contents and steps are built from one list of four; neither entry joins it.
  expect(document.querySelectorAll('nav ol > li')).toHaveLength(4)
})
