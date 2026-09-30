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

/**
 * Humpback whale silhouette, authored here as vector commands and rasterised
 * at runtime into the single-channel alpha mask the backdrop shader samples.
 *
 * The mask is authored in mask pixel space (512x256, x to the right, y down)
 * with the whale swimming to the right: fluke at the left edge, snout at the
 * right. The shader maps mask UV onto a 2:1 quad, so 512x256 keeps mask texels
 * roughly square with the pixels they cover on screen.
 */

/** Mask texture width in texels. Power of two, and the UV origin of `uWhale`. */
export const WHALE_MASK_WIDTH = 512

/** Mask texture height in texels. Power of two. */
export const WHALE_MASK_HEIGHT = 256

/**
 * Mask width divided by height. The shader builds its quad from this value, so
 * mask texels stay square on screen.
 */
export const WHALE_MASK_ASPECT = WHALE_MASK_WIDTH / WHALE_MASK_HEIGHT

/**
 * Mask-space UV of the whale's eye. The intro renders its giant eye at the
 * world position this maps to, so pulling back lands the camera on the same
 * eye the whale actually has.
 */
export const WHALE_EYE_MASK_UV: readonly [number, number] = [
  444 / WHALE_MASK_WIDTH,
  116 / WHALE_MASK_HEIGHT,
]

/**
 * Closed outline of the whale, one bezier run per anatomical feature: snout and
 * head, back, dorsal fin, peduncle, the notched fluke, then the belly and jaw
 * back to the snout. Filled with the nonzero rule; the pectoral fin is a second
 * subpath that overlaps the belly so the union has no seam.
 */
export const WHALE_SILHOUETTE_PATH = [
  // Snout tip, up over the blunt rostrum and along the back.
  'M 500 122',
  'C 496 106 486 94 470 90',
  'C 446 84 420 85 396 90',
  'C 366 96 336 101 310 105',
  // Low hooked dorsal fin sitting on the hump two thirds back.
  'C 306 104 300 102 294 96',
  'C 289 92 283 91 279 94',
  'C 274 100 266 105 254 107',
  'C 240 108 222 111 202 115',
  // Slender peduncle, then the far (upper) fluke lobe.
  'C 178 120 158 124 140 130',
  'C 120 122 90 102 58 82',
  // Trailing edge of the upper lobe into the median notch.
  'C 52 96 56 114 72 130',
  // Near (lower) lobe, back along its leading edge to the peduncle.
  'C 60 146 48 164 44 180',
  'C 76 174 106 160 134 144',
  // Belly from the throat to the deepest point behind the pectoral base.
  'C 152 154 178 162 206 168',
  'C 244 176 292 182 330 183',
  // Chin and lower jaw back up to the snout.
  'C 372 183 406 174 434 162',
  'C 462 150 484 138 494 130',
  'C 499 127 501 125 500 122',
  'Z',
  // Pectoral fin: a blade about a third of the body long, swept back and down
  // from a base seam that sits inside the belly so the union has no seam.
  'M 417 189',
  'C 396 200 352 216 306 228',
  'C 336 220 366 206 403 161',
  'L 417 189',
  'Z',
].join(' ')

/**
 * Strokes carved out of the filled silhouette, so the shading reads a jaw line
 * and ventral pleats instead of a flat sticker.
 */
export const WHALE_DETAIL_STROKES: readonly string[] = [
  // Gape line from the snout tip back to the jaw hinge behind the eye.
  'M 498 132 C 476 137 448 141 416 143',
  // Ventral pleats, fanning along the throat and converging at the hinge.
  'M 490 139 C 466 147 442 153 418 153',
  'M 480 144 C 460 152 440 158 420 159',
  'M 468 150 C 452 157 436 163 422 165',
]

/** Carve strength for {@link WHALE_DETAIL_STROKES}; lower leaves a fainter line. */
const DETAIL_ERASE_ALPHA = 0.5

/** Stroke width of the carved detail lines, in mask texels. */
const DETAIL_STROKE_WIDTH = 2

/**
 * Rasterises the silhouette into an 8-bit coverage mask.
 *
 * @returns `width * height` alpha bytes in row-major order, or null when no 2D
 * context is available (server rendering, or a browser refusing the canvas).
 */
export function rasterizeWhaleMask(): Uint8Array | null {
  if (
    typeof document === 'undefined' ||
    typeof Path2D === 'undefined' ||
    typeof ImageData === 'undefined'
  ) {
    return null
  }
  const canvas = document.createElement('canvas')
  canvas.width = WHALE_MASK_WIDTH
  canvas.height = WHALE_MASK_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) return null

  try {
    context.clearRect(0, 0, WHALE_MASK_WIDTH, WHALE_MASK_HEIGHT)
    context.fillStyle = '#ffffff'
    context.fill(new Path2D(WHALE_SILHOUETTE_PATH))

    // Carving rather than stroking: the lines have to remove coverage from the
    // filled body, which source-over compositing cannot do.
    context.globalCompositeOperation = 'destination-out'
    context.strokeStyle = `rgba(0, 0, 0, ${DETAIL_ERASE_ALPHA})`
    context.lineWidth = DETAIL_STROKE_WIDTH
    context.lineCap = 'round'
    for (const stroke of WHALE_DETAIL_STROKES) {
      context.stroke(new Path2D(stroke))
    }
    // The eye, shallow enough to stay a smudge at resting distance.
    context.fillStyle = 'rgba(0, 0, 0, 0.5)'
    context.beginPath()
    context.ellipse(444, 116, 4, 3, 0, 0, Math.PI * 2)
    context.fill()

    const { data } = context.getImageData(
      0,
      0,
      WHALE_MASK_WIDTH,
      WHALE_MASK_HEIGHT
    )
    const mask = new Uint8Array(WHALE_MASK_WIDTH * WHALE_MASK_HEIGHT)
    for (let index = 0; index < mask.length; index += 1) {
      mask[index] = data[index * 4 + 3]
    }
    return mask
  } catch {
    // A tainted or detached canvas cannot supply pixels; the caller falls back
    // to an empty mask and still renders the water.
    return null
  }
}
