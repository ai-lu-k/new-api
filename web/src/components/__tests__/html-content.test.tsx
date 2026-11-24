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
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HtmlContent } from '../html-content'

const CONTENT =
  '<style>.demo-x{color:red}</style><p class="x" data-demo="zh">hi<br>there</p>'

function renderIsolated(content: string): ShadowRoot {
  const { container } = render(
    <HtmlContent content={content} variant='isolated' />
  )
  const host = container.firstElementChild as HTMLElement
  const root = host.shadowRoot
  if (!root) {
    throw new Error('shadow root missing')
  }
  return root
}

afterEach(cleanup)

describe('HtmlContent isolated variant', () => {
  it('keeps the admin-authored style element inside the shadow root', () => {
    const root = renderIsolated(CONTENT)

    const styleTexts = [...root.querySelectorAll('style')].map(
      (style) => style.textContent ?? ''
    )
    expect(styleTexts.some((text) => text.includes('.demo-x{color:red}'))).toBe(
      true
    )
  })

  it('keeps data attributes, classes and line breaks of the content', () => {
    const root = renderIsolated(CONTENT)

    const paragraph = root.querySelector('p')
    expect(paragraph?.getAttribute('data-demo')).toBe('zh')
    expect(paragraph?.className).toBe('x')
    expect(paragraph?.querySelector('br')).not.toBeNull()
    expect(root.querySelector('script')).toBeNull()
  })

  it('mirrors the document language onto the wrapper for CSS switching', async () => {
    document.documentElement.lang = 'en'
    const root = renderIsolated(CONTENT)
    const wrapper = root.lastElementChild as HTMLElement

    expect(wrapper.dataset.appLang).toBe('en')

    document.documentElement.lang = 'zh-CN'
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(wrapper.dataset.appLang).toBe('zh-CN')

    delete document.documentElement.dataset.appLang
    document.documentElement.lang = 'en'
  })
})
