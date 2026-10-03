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
import { describe, expect, it } from 'vitest'

import { pageTitle } from '../page-title'

const zh: Record<string, string> = {
  'Model Square': '模型广场',
  Rankings: '排行榜',
  About: '关于',
}
const t = (key: string) => zh[key] ?? key
const site = { name: 'LUK', homeTitle: 'LUK · 统一 API 网关' }

describe('pageTitle', () => {
  it('gives each public page its own title', () => {
    expect(pageTitle('/', site, t)).toBe('LUK · 统一 API 网关')
    expect(pageTitle('/pricing', site, t)).toBe('模型广场 · LUK')
    expect(pageTitle('/pricing/', site, t)).toBe('模型广场 · LUK')
    expect(pageTitle('/rankings', site, t)).toBe('排行榜 · LUK')
    expect(pageTitle('/about', site, t)).toBe('关于 · LUK')
  })

  it('names the model on a model page', () => {
    expect(pageTitle('/pricing/deepseek-v4.1-flash-x0.25', site, t)).toBe(
      'deepseek-v4.1-flash-x0.25 · LUK'
    )
    expect(pageTitle('/pricing/z-ai%2Fglm-5.3', site, t)).toBe(
      'z-ai/glm-5.3 · LUK'
    )
    expect(pageTitle('/pricing/50%', site, t)).toBe('50% · LUK')
  })

  it('falls back to the system name', () => {
    expect(pageTitle('/', { name: 'LUK' }, t)).toBe('LUK')
    expect(pageTitle('/dashboard', site, t)).toBe('LUK')
    expect(pageTitle('/sign-in', site, t)).toBe('LUK')
  })
})
