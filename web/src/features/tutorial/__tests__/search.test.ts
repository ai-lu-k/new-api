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
import { afterEach, beforeEach, expect, it } from 'vitest'

import { searchTutorial } from '../lib/tutorial-search'
import type { TutorialStep } from '../types'

const steps: TutorialStep[] = [
  { id: 'step-key', number: '01', title: 'Get an API Key' },
  { id: 'step-call', number: '02', title: 'Make one request' },
  { id: 'step-agent', number: '03', title: 'For agents and scripts' },
]

function renderPage(html: string) {
  document.body.innerHTML = html
}

beforeEach(() => {
  renderPage(`
  <section id="step-key"><div><h2>01 Get an API Key</h2></div><div><p>The key is the identity: every request carries it.</p></div></section>
  <section id="step-call"><div><h2>02 Make one request</h2></div><div><p>Send the request with curl and the model you picked.</p></div></section>
  <section id="step-agent"><div><h2>03 For agents and scripts</h2></div><div><p>If the SDK doubles the path you get a 404.</p></div></section>
`)
})

afterEach(() => {
  document.body.innerHTML = ''
})

it('finds the section that mentions the words and quotes them back', () => {
  const hits = searchTutorial(document, steps, 'curl')

  expect(hits.map((hit) => hit.id)).toEqual(['step-call'])
  expect(hits[0].title).toBe('Make one request')
  // The quote starts in the body: the heading is already on the hit itself.
  expect(hits[0].snippet).toContain('Send the request with curl')
  expect(hits[0].snippet).not.toContain('Make one request')
})

it('matches body copy, not only the headings', () => {
  const hits = searchTutorial(document, steps, '404')

  expect(hits.map((hit) => hit.id)).toEqual(['step-agent'])
  expect(hits[0].snippet).toContain('404')
})

it('ignores a query shorter than two characters', () => {
  expect(searchTutorial(document, steps, 'p')).toEqual([])
  expect(searchTutorial(document, steps, '   ')).toEqual([])
})

it('reports no hit instead of the nearest section', () => {
  expect(searchTutorial(document, steps, 'kubernetes')).toEqual([])
})
