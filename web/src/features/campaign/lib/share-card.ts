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
export type ShareCardRow = { label: string; value: string }

export type ShareCardData = {
  siteName: string
  eventName: string
  subtitle: string
  name: string
  rows: ShareCardRow[]
  badge: string
  footer: string
}

const CARD_WIDTH = 1200
const CARD_HEIGHT = 630
const CARD_SCALE = 2
const MONO_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "PingFang SC", "Microsoft YaHei", sans-serif'

function drawGrid(context: CanvasRenderingContext2D) {
  context.strokeStyle = 'rgba(52, 211, 153, 0.10)'
  context.lineWidth = 1
  for (let x = 0; x <= CARD_WIDTH; x += 40) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, CARD_HEIGHT)
    context.stroke()
  }
  for (let y = 0; y <= CARD_HEIGHT; y += 40) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(CARD_WIDTH, y)
    context.stroke()
  }
}

export function renderShareCard(data: ShareCardData): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH * CARD_SCALE
  canvas.height = CARD_HEIGHT * CARD_SCALE
  const context = canvas.getContext('2d')
  if (!context) return null
  context.scale(CARD_SCALE, CARD_SCALE)

  context.fillStyle = '#04100a'
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  drawGrid(context)
  context.fillStyle = 'rgba(16, 185, 129, 0.08)'
  context.fillRect(0, 0, CARD_WIDTH, 8)

  context.font = `700 88px ${MONO_FONT}`
  context.fillStyle = '#6ee7b7'
  context.fillText(data.eventName, 72, 150)
  context.font = `500 22px ${MONO_FONT}`
  context.fillStyle = 'rgba(209, 250, 229, 0.72)'
  context.fillText(data.subtitle, 72, 196)

  context.font = `600 34px ${MONO_FONT}`
  context.fillStyle = '#ecfdf5'
  context.fillText(data.name, 72, 288)

  data.rows.forEach((row, index) => {
    const x = 72 + (index % 2) * 240
    const y = 406 + Math.floor(index / 2) * 88
    context.font = `500 18px ${MONO_FONT}`
    context.fillStyle = 'rgba(167, 243, 208, 0.62)'
    context.fillText(row.label, x, y)
    context.font = `700 34px ${MONO_FONT}`
    context.fillStyle = '#ecfdf5'
    context.fillText(row.value, x, y + 40)
  })

  context.fillStyle = 'rgba(16, 185, 129, 0.14)'
  context.fillRect(660, 268, 468, 64)
  context.font = `600 22px ${MONO_FONT}`
  context.fillStyle = '#a7f3d0'
  context.fillText(data.badge, 684, 308)

  context.font = `500 16px ${MONO_FONT}`
  context.fillStyle = 'rgba(167, 243, 208, 0.55)'
  context.fillText(data.footer, 72, 574)
  context.textAlign = 'right'
  context.fillText(data.siteName, CARD_WIDTH - 72, 574)
  context.textAlign = 'left'
  return canvas
}

export function downloadShareCard(data: ShareCardData, fileName: string) {
  const canvas = renderShareCard(data)
  if (!canvas) return
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}
