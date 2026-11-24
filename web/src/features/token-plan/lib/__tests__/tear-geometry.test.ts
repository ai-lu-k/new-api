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
import { expect, it } from 'vitest'

import {
  createTearGeometry,
  seedFromVoucher,
  tearProfile,
} from '../tear-geometry'

const geometry = (seed = 7) =>
  createTearGeometry({ width: 400, height: 240, stubWidth: 64, seed })

// Each row of the polygon is one pixel of height, so counting the points on a
// seam tells how much of the seam has been ripped.
function seamPoints(clip: string): string[] {
  return clip
    .replaceAll(/^polygon\(|\)$/g, '')
    .split(', ')
    .filter((point) => point.endsWith('px') || point.includes('px '))
}

it('keeps the perforation flat inside each cut and wandering between them', () => {
  const profile = tearProfile(7, 240)

  // One sample per pixel of height, plus the starting row.
  expect(profile).toHaveLength(241)
  // Rows 12..17 are the first cut: the tear has to stay on the dotted line.
  for (let y = 12; y < 18; y += 1) expect(profile[y]).toBe(0)
  // Rows 18..21 are the paper between two cuts: the fibre wanders.
  const fibres = profile.slice(18, 22)
  expect(fibres.some((offset) => offset !== 0)).toBe(true)
  expect(Math.max(...fibres.map(Math.abs))).toBeLessThanOrEqual(1)
})

it('rips the same ticket the same way and a different ticket differently', () => {
  expect(tearProfile(seedFromVoucher(101), 240)).toEqual(
    tearProfile(seedFromVoucher(101), 240)
  )
  expect(tearProfile(seedFromVoucher(101), 240)).not.toEqual(
    tearProfile(seedFromVoucher(102), 240)
  )
})

it('advances the torn edge row by row instead of moving the paper', () => {
  const ticket = geometry()

  const closed = seamPoints(ticket.bodyClip(0))
  const half = seamPoints(ticket.bodyClip(0.5))
  const open = seamPoints(ticket.bodyClip(1))

  // The rip only ever adds outline: the edge travels along the seam, the sheet
  // itself never leaves its place.
  expect(half.length).toBeGreaterThan(closed.length)
  expect(open.length).toBeGreaterThan(half.length)
  expect(ticket.bodyClip(1).startsWith('polygon(0px 0px, ')).toBe(true)
  expect(ticket.bodyClip(1).endsWith(', 0px 240px)')).toBe(true)
})

it('cuts the teeth free as the rip passes them', () => {
  const ticket = geometry()

  expect(ticket.remainingBridges(0)).toBeGreaterThan(0)
  expect(ticket.remainingBridges(0.5)).toBeLessThan(ticket.remainingBridges(0))
  // Nothing is holding the stub once the pull is complete.
  expect(ticket.remainingBridges(1)).toBe(0)
  expect(ticket.bridgePath(1)).toBe('')
  expect(ticket.bridgePath(0).split('M')).toHaveLength(
    ticket.remainingBridges(0) + 1
  )
})

it('gives the stub the same seam from its own side of the paper', () => {
  const ticket = geometry()
  const body = ticket.bodyClip(0.6)
  const stub = ticket.stubClip(0.6)
  // Both halves of the seam sample the same row, so the pair is unique.
  const at120 = (clip: string) =>
    clip.split(', ').find((point) => point.includes('px 120px'))
  const lastBody = at120(body)
  const lastStub = at120(stub)

  expect(lastBody).toBeDefined()
  expect(lastStub).toBeDefined()
  // The stub reaches three pixels back over the body, so the coordinates differ
  // by exactly that overlap and the two halves rip along one line.
  expect(Number.parseFloat(lastStub ?? '0')).toBeCloseTo(
    Number.parseFloat(lastBody ?? '0') - ticket.bodyWidth + 3,
    2
  )
})
