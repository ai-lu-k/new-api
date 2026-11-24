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

// Torn-edge geometry for the voucher.
//
// Ported from jal-co/boarding-pass (MIT, © 2026 Justin Levine), file `tear.ts`:
// the perforation profile, the notch bites at both ends of the seam, and the
// clip-path polygons that advance with the pull. The original is fixed at
// 672x280 for a boarding pass; here the same construction is parameterised by
// size, and every row of the profile is turned into a coordinate string once,
// so a pointer frame only joins a prefix of them.

/** One sample per pixel of height: the rip moves in 1px steps, never a ramp. */
export const TEAR_STEP = 1
/** First row of the perforation, below the rounded corner. */
export const PERFORATION_TOP = 12
/** Distance between two teeth, and the uncut paper between them. */
export const PERFORATION_PITCH = 10
export const PERFORATION_CUT = 6
/** Radius of the bite taken out of the seam at both ends. */
export const NOTCH_RADIUS = 8
/** How far the stub reaches back over the body, so both halves share one edge. */
export const FIBER_OVERLAP = 3

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Turns a voucher serial into a stable seed, so one ticket always tears the
 *  same way and two tickets in the same hand never share a rip. */
export function seedFromVoucher(serial: number | string): number {
  let value = 2166136261
  for (const char of String(serial)) {
    value = Math.imul(value ^ char.charCodeAt(0), 16777619)
  }
  return value | 0
}

/**
 * One signed offset per pixel row, in [-1, 1]: the fibres the rip wanders
 * through. Rows inside a perforation cut are flat (0) so the torn edge keeps
 * the rhythm of the teeth instead of turning into noise. The offset is drawn
 * once per tooth, not per pixel, or the edge would shiver instead of stepping.
 */
export function tearProfile(seed: number, height: number): number[] {
  const random = seededRandom(seed)
  const count = Math.floor(height / TEAR_STEP) + 1
  const nibs = new Map<number, number>()
  return Array.from({ length: count }, (_, index) => {
    const y = index * TEAR_STEP
    const period = Math.floor((y - PERFORATION_TOP) / PERFORATION_PITCH)
    const within = y - PERFORATION_TOP - period * PERFORATION_PITCH
    if (within < PERFORATION_CUT) return 0
    let nib = nibs.get(period)
    if (nib === undefined) {
      nib = (random() - 0.5) * 2
      nibs.set(period, nib)
    }
    return nib
  })
}

export interface TearGeometryOptions {
  width: number
  height: number
  stubWidth: number
  seed: number
  /** How far the rip may wander from the seam, in px. */
  amplitude?: number
}

export interface TearGeometry {
  readonly width: number
  readonly height: number
  /** Width of the body half; the seam sits on its right edge. */
  readonly bodyWidth: number
  readonly stubWidth: number
  /** Polygon for the body, torn open down to `progress`. */
  bodyClip(progress: number): string
  /** Polygon for the stub, carrying the same ripped edge. */
  stubClip(progress: number): string
  /**
   * The teeth that are still uncut, as an SVG path. They follow the stub as it
   * hinges open, so the part that is still glued stays glued.
   */
  bridgePath(progress: number, angle?: number): string
  /** How many teeth are still holding the two halves together. */
  remainingBridges(progress: number): number
}

function arc(cx: number, cy: number, from: number, to: number): string[] {
  return Array.from({ length: 7 }, (_, index) => {
    const angle = from + ((to - from) * index) / 6
    const x = (cx + Math.cos(angle) * NOTCH_RADIUS).toFixed(2)
    const y = (cy + Math.sin(angle) * NOTCH_RADIUS).toFixed(2)
    return `${x}px ${y}px`
  })
}

export function createTearGeometry(options: TearGeometryOptions): TearGeometry {
  const { width, height, stubWidth, seed, amplitude = 2.6 } = options
  const bodyWidth = Math.max(80, width - stubWidth)
  const profile = tearProfile(seed, height)
  const clamped = (progress: number) => Math.min(1, Math.max(0, progress))

  // Rows under the corner bites belong to the rounded ends, not to the rip.
  // `torn` is the wandering edge; `seam` is the straight line the untouched
  // part of the ticket keeps.
  const rows: { y: number; torn: string; seam: string }[] = []
  const stubRows: { y: number; torn: string; seam: string }[] = []
  for (let index = 0; index < profile.length; index += 1) {
    const y = index * TEAR_STEP
    if (y < NOTCH_RADIUS || y > height - NOTCH_RADIUS) continue
    const offset = profile[index] * amplitude
    rows.push({
      y,
      torn: `${(bodyWidth + offset).toFixed(2)}px ${y}px`,
      seam: `${bodyWidth.toFixed(2)}px ${y}px`,
    })
    // The stub owns its own box: its left edge sits FIBER_OVERLAP px into the
    // body, so both halves describe the same seam in their own coordinates.
    stubRows.push({
      y,
      torn: `${(FIBER_OVERLAP + offset).toFixed(2)}px ${y}px`,
      seam: `${FIBER_OVERLAP.toFixed(2)}px ${y}px`,
    })
  }

  /** Ripped rows above the front, one point on the seam, then the bite. */
  const rip = (
    source: { y: number; torn: string; seam: string }[],
    front: number
  ) => {
    let broken = 0
    while (broken < source.length && source[broken].y <= front) broken += 1
    if (broken === 0) return []
    const points = source.slice(0, broken).map((row) => row.torn)
    // Below the front the edge is a straight vertical line. One point closes the
    // last torn row back onto it; the rest of the line costs nothing.
    if (broken < source.length) points.push(source[broken].seam)
    return points
  }

  const teeth: number[] = []
  const toothCount = Math.max(
    1,
    Math.floor((height - PERFORATION_TOP - NOTCH_RADIUS) / PERFORATION_PITCH)
  )
  for (let index = 0; index < toothCount; index += 1) {
    teeth.push(PERFORATION_TOP + index * PERFORATION_PITCH + PERFORATION_CUT)
  }
  const frontOf = (progress: number) => clamped(progress) * height

  return {
    width,
    height,
    bodyWidth,
    stubWidth,

    bodyClip(progress) {
      const top = arc(bodyWidth, 0, Math.PI, Math.PI / 2)
      const bottom = arc(bodyWidth, height, -Math.PI / 2, -Math.PI)
      const points = [...top, ...rip(rows, frontOf(progress)), ...bottom]
      return `polygon(0px 0px, ${points.join(', ')}, 0px ${height}px)`
    },

    stubClip(progress) {
      const top = arc(FIBER_OVERLAP, 0, 0, Math.PI / 2)
      const bottom = arc(FIBER_OVERLAP, height, -Math.PI / 2, 0)
      const outer = stubWidth + FIBER_OVERLAP
      const points = [...top, ...rip(stubRows, frontOf(progress)), ...bottom]
      return `polygon(${outer}px 0px, ${points.join(', ')}, ${outer}px ${height}px)`
    },

    remainingBridges(progress) {
      const front = frontOf(progress)
      return teeth.filter((y) => y > front).length
    },

    bridgePath(progress, angle = 0) {
      const front = frontOf(progress)
      const height2 = PERFORATION_PITCH - PERFORATION_CUT
      const radians = (angle * Math.PI) / 180
      const cos = Math.cos(radians)
      const sin = Math.sin(radians)
      // The stub hinges on the end of the seam that is still attached: the
      // bottom of the ticket. Each tooth is placed on that hinge.
      const pivot = (y: number) => {
        const x = bodyWidth + (height - y) * sin
        const placed = height + (y - height) * cos
        return `${x.toFixed(2)},${placed.toFixed(2)}`
      }
      return teeth
        .filter((y) => y > front)
        .map((y) => {
          const top = pivot(y)
          const bottom = pivot(y + height2)
          return `M${bodyWidth - 1},${y} L${top} L${bottom} L${bodyWidth - 1},${y + height2} Z`
        })
        .join(' ')
    },
  }
}
