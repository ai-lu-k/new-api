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
import { useLayoutEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import {
  authBrandPalette,
  createAuthBrandProgram,
  readAuthBrandColor,
} from '../lib/auth-brand-shader'

// Paint during layout so the CSS fallback never shows on a WebGL browser.
const MAX_PIXELS = 1_100_000
const MAX_DPR = 1.75
const POINTER_EASE = 0.05

interface AuthBrandCanvasProps {
  className?: string
}

export function AuthBrandCanvas(props: AuthBrandCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [painted, setPainted] = useState(false)

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    // jsdom and older browsers have no WebGL; the CSS gradient stays in place.
    if (!canvas || typeof WebGLRenderingContext === 'undefined') return
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (!gl) return
    const program = createAuthBrandProgram(gl)
    if (!program) return

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    const start = performance.now()
    const pointer = { x: 0, y: 0 }
    const target = { x: 0, y: 0 }
    let pointerActive = false
    let paintedOnce = false
    let frameId = 0

    gl.useProgram(program)
    const position = gl.getAttribLocation(program, 'a_position')
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    )
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const uniform = (name: string) => gl.getUniformLocation(program, name)
    const uniforms = {
      resolution: uniform('u_resolution'),
      time: uniform('u_time'),
      pointer: uniform('u_pointer'),
      deep: uniform('u_deep'),
      mid: uniform('u_mid'),
      accent: uniform('u_accent'),
      light: uniform('u_light'),
    }

    const draw = (now = 0) => {
      let seconds = 0
      if (now > 0) {
        seconds = (now - start) / 1000
      } else if (reduceMotion) {
        seconds = 12
      }
      gl.uniform2f(uniforms.pointer, pointer.x, pointer.y)
      gl.uniform1f(uniforms.time, seconds)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (!paintedOnce && canvas.width > 1 && canvas.height > 1) {
        paintedOnce = true
        setPainted(true)
      }
    }

    const applyPalette = () => {
      const palette = authBrandPalette(readAuthBrandColor())
      gl.uniform3fv(uniforms.deep, palette.deep)
      gl.uniform3fv(uniforms.mid, palette.mid)
      gl.uniform3fv(uniforms.accent, palette.accent)
      gl.uniform3fv(uniforms.light, palette.light)
      draw()
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const area = Math.max(rect.width * rect.height, 1)
      const scale = Math.min(
        window.devicePixelRatio || 1,
        MAX_DPR,
        Math.sqrt(MAX_PIXELS / area)
      )
      const width = Math.max(1, Math.round(rect.width * scale))
      const height = Math.max(1, Math.round(rect.height * scale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
      draw()
    }

    const frame = (now: number) => {
      frameId = requestAnimationFrame(frame)
      const ease = pointerActive ? POINTER_EASE : POINTER_EASE * 0.4
      pointer.x += (target.x - pointer.x) * ease
      pointer.y += (target.y - pointer.y) * ease
      draw(now)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      target.x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1
      target.y = -(
        ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 -
        1
      )
      pointerActive = true
    }

    const handlePointerLeave = () => {
      target.x = 0
      target.y = 0
      pointerActive = false
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    // Theme presets and the light/dark switch both change these attributes.
    const themeObserver = new MutationObserver(applyPalette)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    if (document.body) {
      themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: [
          'class',
          'style',
          'data-theme-preset',
          'data-theme-radius',
          'data-theme-scale',
          'data-theme-font',
        ],
      })
    }

    const panel = canvas.parentElement
    panel?.addEventListener('pointermove', handlePointerMove)
    panel?.addEventListener('pointerleave', handlePointerLeave)

    // A lost context cannot be revived without rebuilding every handle, and
    // React reuses the same canvas on a strict-mode remount, so stop drawing
    // instead of dropping the context during cleanup.
    const handleContextLost = () => cancelAnimationFrame(frameId)
    canvas.addEventListener('webglcontextlost', handleContextLost)

    applyPalette()
    resize()
    if (!reduceMotion) frameId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      panel?.removeEventListener('pointermove', handlePointerMove)
      panel?.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden='true'
      data-slot='auth-brand-canvas'
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full',
        painted ? 'opacity-100' : 'opacity-0',
        props.className
      )}
    />
  )
}
