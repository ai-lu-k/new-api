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
import { useEffect, useRef, useState, type ReactElement } from 'react'

import { cn } from '@/lib/utils'

export interface ShaderBackdropProps {
  className?: string
  /** 0..1, scales the glow strength. Default 1. */
  intensity?: number
}

/** Device-range colour triplet, each channel 0..1. */
type Rgb = readonly [number, number, number]

/** Hue in turns plus saturation and value, each 0..1. */
type Hsv = readonly [number, number, number]

/** WebGL2 when the browser exposes it, WebGL1 otherwise. */
type GlContext = WebGL2RenderingContext | WebGLRenderingContext

/**
 * Accent used when `--glow` is missing, unparsable, or carries no hue at all.
 * Every other colour in the component is derived from the resolved accent.
 */
const DEFAULT_ACCENT: Rgb = [0x5e / 255, 0x6a / 255, 0xd2 / 255]

/**
 * Cap on the drawing-buffer density. A soft aurora gains nothing from a 2x or
 * 3x device ratio, so the extra pixels would only cost fragment work.
 */
const MAX_DEVICE_PIXEL_RATIO = 1.5

/**
 * Additional internal downscale below 1.0. The field is smooth by construction,
 * so rendering at this fraction of the capped ratio is visually identical once
 * the browser upscales it, and it cuts per-frame fragment work by ~64%.
 */
const RESOLUTION_SCALE = 0.6

/**
 * Channel spread (0-255) below which a colour is treated as neutral. An accent
 * without chroma cannot supply a hue, so such a value resolves to the default.
 */
const MIN_ACCENT_CHROMA = 12

/**
 * Hue rotation in turns between the accent and the secondary tint. Negative
 * because a cooler neighbour sits at shorter wavelengths, which is a *lower*
 * hue angle in every colour model this uses.
 */
const COOL_HUE_SHIFT = -0.075

/**
 * Longest frame delta fed into the animation clock, in seconds. Capping it
 * stops the field from jumping after the loop resumes from a pause.
 */
const MAX_FRAME_DELTA_SECONDS = 0.1

/** Attribute name shared by the vertex shader and the vertex buffer setup. */
const POSITION_ATTRIBUTE = 'aPosition'

/**
 * Fullscreen triangle in clip space. One triangle covers the viewport with no
 * index buffer and no vertex data upload per frame.
 */
const VERTEX_SHADER_SOURCE = `
attribute vec2 ${POSITION_ATTRIBUTE};

void main() {
  gl_Position = vec4(${POSITION_ATTRIBUTE}, 0.0, 1.0);
}
`

/**
 * Domain-warped value-noise fBm coloured from two theme-derived tints, with a
 * vignette and an ordered dither.
 *
 * Written against GLSL ES 1.00 so a single program serves both WebGL2 and
 * WebGL1, and unrolled rather than looped because every octave count is fixed
 * and dynamic loop bounds are the least portable construct in ES 1.00.
 */
const FRAGMENT_SHADER_SOURCE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform vec3 uAccent;
uniform vec3 uCool;

// Integer-free hash (Hoskins). Stable across GPUs without the sin() trick,
// which loses precision on mobile.
float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Two octaves are enough for the warp field: it only needs broad curvature,
// and the octaves it feeds cost far more than the ones skipped here.
float fbmWarp(vec2 p) {
  return (
    valueNoise(p) * 0.5 +
    valueNoise(p * 2.03 + vec2(11.3, 7.7)) * 0.25
  ) * 1.3333;
}

// Five octaves shape the light itself: enough structure to avoid a flat blob,
// few enough to stay cheap at the internal render scale.
float fbmLight(vec2 p) {
  float sum = valueNoise(p) * 0.5;
  sum += valueNoise(p * 2.03 + vec2(11.3, 7.7)) * 0.25;
  sum += valueNoise(p * 4.09 + vec2(3.1, 19.7)) * 0.125;
  sum += valueNoise(p * 8.21 + vec2(23.9, 5.3)) * 0.0625;
  sum += valueNoise(p * 16.43 + vec2(7.1, 31.4)) * 0.03125;
  return sum * 1.0323;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  // Height-relative coordinates keep the cells round on any aspect ratio.
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime;

  // Two low-octave fields displace the sampling position, turning the
  // lattice-aligned fBm into slow, curling sheets rather than blobs.
  vec2 q = vec2(
    fbmWarp(p * 1.35 + vec2(t * 0.030, 0.0)),
    fbmWarp(p * 1.35 + vec2(4.7, 2.3) + vec2(t * 0.021, t * -0.017))
  );
  float field = fbmLight(p * 1.35 + 1.7 * (q - 0.5));

  // The high threshold and the squaring together keep the lit area small, so
  // roughly half the frame stays within a few 8-bit steps of black.
  float glow = smoothstep(0.36, 0.84, field);
  glow *= glow;

  // The warp field also picks the tint, so the two hues drift into each other
  // instead of sitting in fixed bands.
  float tint = clamp((q.x - 0.32) * 1.6, 0.0, 1.0);
  vec3 light = mix(uCool, uAccent, tint);

  // ~24 s breathing cycle: slow enough to read as ambient, short enough that
  // the field is never exactly static.
  float breath = 0.84 + 0.16 * sin(t * 0.26);

  vec2 centered = uv * 2.0 - 1.0;
  float vignette = 1.0 - smoothstep(0.32, 1.42, length(centered * vec2(1.0, 1.06)));

  // The unlit field keeps a trace of the accent so backdrop and page share one
  // colour family instead of meeting at pure black.
  vec3 color = uAccent * 0.05;
  color += light * glow * breath * uIntensity * 0.85;
  color *= mix(0.10, 1.0, vignette);

  // One LSB of fixed-pattern dither. Near-black gradients band hard on 8-bit
  // panels, and a time-varying dither would flicker, so the pattern is static.
  float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;

  gl_FragColor = vec4(clamp(color + dither, 0.0, 1.0), 1.0);
}
`

/** Clamps the `intensity` prop to 0..1, defaulting invalid input to full. */
function clampIntensity(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.min(Math.max(value, 0), 1)
}

/** Converts one `rgb()` channel token, accepting `0-255` numbers and percentages. */
function toChannel(part: string): number | null {
  const isPercent = part.endsWith('%')
  const numeric = Number.parseFloat(isPercent ? part.slice(0, -1) : part)
  if (!Number.isFinite(numeric)) return null
  const scaled = isPercent ? numeric / 100 : numeric / 255
  return Math.min(Math.max(scaled, 0), 1)
}

/** Parses `#rgb`, `#rrggbb`, `rgb()` and `rgba()` (comma or space separated). */
function parseCssColor(value: string): Rgb | null {
  const input = value.trim()
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(input)
  if (hex) {
    const digits = hex[1]
    const full =
      digits.length === 3
        ? `${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`
        : digits
    return [
      Number.parseInt(full.slice(0, 2), 16) / 255,
      Number.parseInt(full.slice(2, 4), 16) / 255,
      Number.parseInt(full.slice(4, 6), 16) / 255,
    ]
  }

  const functional = /^rgba?\(([^)]+)\)$/i.exec(input)
  if (!functional) return null
  const parts = functional[1].split(/[\s,/]+/).filter((part) => part.length > 0)
  if (parts.length < 3) return null
  const red = toChannel(parts[0])
  const green = toChannel(parts[1])
  const blue = toChannel(parts[2])
  if (red === null || green === null || blue === null) return null
  return [red, green, blue]
}

/**
 * Resolves a colour value the browser can compute but this module cannot parse,
 * such as `oklch()` or `color-mix()`, by letting the engine normalise it on a
 * detached probe element and reading the resulting `rgb()` string back.
 */
function normalizeCssColor(value: string): Rgb | null {
  if (typeof CSS === 'undefined' || !CSS.supports('color', value)) return null
  const probe = document.createElement('span')
  probe.style.color = value
  probe.style.display = 'none'
  document.documentElement.append(probe)
  const resolved = window.getComputedStyle(probe).color
  probe.remove()
  return parseCssColor(resolved)
}

/**
 * Reads the theme accent from `--glow` on the document root.
 *
 * `--glow` is the token the theme reserves for this backdrop; it is deliberately
 * separate from `--primary`, which also paints opaque button fills and may be
 * tuned for contrast rather than for a soft light source.
 *
 * Any CSS colour syntax the browser resolves is accepted. The result must carry
 * chroma, because the shader derives both of its hues from it: a neutral value
 * would leave the default indigo in place.
 */
function readAccentColor(): Rgb {
  if (typeof document === 'undefined') return DEFAULT_ACCENT
  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--glow')
    .trim()
  if (raw.length === 0) return DEFAULT_ACCENT
  const color = parseCssColor(raw) ?? normalizeCssColor(raw)
  if (!color) return DEFAULT_ACCENT
  const spread =
    Math.max(color[0], color[1], color[2]) -
    Math.min(color[0], color[1], color[2])
  return spread * 255 < MIN_ACCENT_CHROMA ? DEFAULT_ACCENT : color
}

/** Converts device-range RGB to hue (turns), saturation and value. */
function rgbToHsv(color: Rgb): Hsv {
  const max = Math.max(color[0], color[1], color[2])
  const min = Math.min(color[0], color[1], color[2])
  const delta = max - min
  let hue = 0
  if (delta > 0) {
    if (max === color[0]) hue = ((color[1] - color[2]) / delta) % 6
    else if (max === color[1]) hue = (color[2] - color[0]) / delta + 2
    else hue = (color[0] - color[1]) / delta + 4
    hue = (hue / 6 + 1) % 1
  }
  return [hue, max === 0 ? 0 : delta / max, max]
}

/** Converts hue (turns), saturation and value back to device-range RGB. */
function hsvToRgb(hsv: Hsv): Rgb {
  const sector = hsv[0] * 6
  const chroma = hsv[2] * hsv[1]
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const base = hsv[2] - chroma
  let red = 0
  let green = 0
  let blue = 0
  switch (Math.floor(sector) % 6) {
    case 0:
      red = chroma
      green = second
      break
    case 1:
      red = second
      green = chroma
      break
    case 2:
      green = chroma
      blue = second
      break
    case 3:
      green = second
      blue = chroma
      break
    case 4:
      red = second
      blue = chroma
      break
    default:
      red = chroma
      blue = second
      break
  }
  return [red + base, green + base, blue + base]
}

/**
 * Builds the two hues the shader mixes: the accent itself, and a cooler,
 * desaturated neighbour. Deriving the second hue by rotation keeps the palette
 * inside the theme's colour family instead of pinning a fixed cyan.
 */
function toGlowPalette(accent: Rgb): readonly [Rgb, Rgb] {
  const hsv = rgbToHsv(accent)
  const hue = (hsv[0] + COOL_HUE_SHIFT + 1) % 1
  const cool = hsvToRgb([hue, hsv[1] * 0.6, hsv[2] * 0.86])
  return [accent, cool]
}

/** Formats an RGB triplet for inline CSS gradients. */
function rgbToCss(color: Rgb, alpha: number): string {
  const channel = (value: number): number => Math.round(value * 255)
  return `rgba(${channel(color[0])}, ${channel(color[1])}, ${channel(color[2])}, ${alpha})`
}

/**
 * CSS-only stand-in for the shader: three overlapping radial gradients on the
 * page background, with the same hues and a darkening vignette layer.
 */
function cssFallbackBackground(accent: Rgb, intensity: number): string {
  const [warm, cool] = toGlowPalette(accent)
  const shade = `rgba(0, 0, 0, ${0.55 * intensity})`
  return [
    `radial-gradient(60% 45% at 28% 22%, ${rgbToCss(warm, 0.3 * intensity)} 0%, transparent 70%)`,
    `radial-gradient(52% 40% at 74% 34%, ${rgbToCss(cool, 0.24 * intensity)} 0%, transparent 72%)`,
    `radial-gradient(90% 60% at 50% 96%, ${rgbToCss(warm, 0.18 * intensity)} 0%, transparent 78%)`,
    `radial-gradient(120% 100% at 50% 50%, transparent 40%, ${shade} 100%)`,
  ].join(', ')
}

/** True when two resolved accents are the same colour, up to 8-bit rounding. */
function sameColor(left: Rgb, right: Rgb): boolean {
  const close = (a: number, b: number): boolean => Math.abs(a - b) < 1 / 512
  return (
    close(left[0], right[0]) &&
    close(left[1], right[1]) &&
    close(left[2], right[2])
  )
}

/** Creates a WebGL2 context, falling back to WebGL1. */
function createGlContext(canvas: HTMLCanvasElement): GlContext | null {
  const attributes: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'low-power',
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    stencil: false,
  }
  return (
    canvas.getContext('webgl2', attributes) ??
    canvas.getContext('webgl', attributes)
  )
}

/** Compiles one shader stage, returning null instead of throwing on failure. */
function compileShader(
  gl: GlContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  const compiled: boolean = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
  if (compiled) return shader
  gl.deleteShader(shader)
  return null
}

/** Links the backdrop program, returning null instead of throwing on failure. */
function createProgram(gl: GlContext): WebGLProgram | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE)
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex)
    if (fragment) gl.deleteShader(fragment)
    return null
  }
  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    return null
  }
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  // Shaders stay deletable once attached; the linked program keeps them alive.
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  const linked: boolean = gl.getProgramParameter(program, gl.LINK_STATUS)
  if (linked) return program
  gl.deleteProgram(program)
  return null
}

/** Everything one draw needs, including uniform locations resolved once. */
interface GlResources {
  buffer: WebGLBuffer
  positionAttribute: number
  program: WebGLProgram
  uniforms: {
    accent: WebGLUniformLocation | null
    cool: WebGLUniformLocation | null
    intensity: WebGLUniformLocation | null
    resolution: WebGLUniformLocation | null
    time: WebGLUniformLocation | null
  }
}

/** Compiles the program and allocates the screen-covering triangle. */
function buildResources(gl: GlContext): GlResources | null {
  const program = createProgram(gl)
  if (!program) return null
  const buffer = gl.createBuffer()
  const positionAttribute = gl.getAttribLocation(program, POSITION_ATTRIBUTE)
  if (!buffer || positionAttribute < 0) {
    gl.deleteProgram(program)
    if (buffer) gl.deleteBuffer(buffer)
    return null
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  // Oversized triangle: the clip stage discards the off-screen corners, so no
  // matrix or viewport-sized geometry is needed.
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  )
  return {
    buffer,
    positionAttribute,
    program,
    uniforms: {
      accent: gl.getUniformLocation(program, 'uAccent'),
      cool: gl.getUniformLocation(program, 'uCool'),
      intensity: gl.getUniformLocation(program, 'uIntensity'),
      resolution: gl.getUniformLocation(program, 'uResolution'),
      time: gl.getUniformLocation(program, 'uTime'),
    },
  }
}

/** Releases the GL objects owned by one mount. */
function disposeResources(gl: GlContext, resources: GlResources): void {
  gl.deleteBuffer(resources.buffer)
  gl.deleteProgram(resources.program)
}

/**
 * Decorative animated backdrop: a near-black field carrying a very slow,
 * low-saturation aurora glow built from the theme accent.
 *
 * Chooses WebGL2, then WebGL1, then a static CSS gradient when neither is
 * available. The rendering loop only runs while the canvas is on screen, the
 * page is visible, and reduced motion is not requested; under
 * `prefers-reduced-motion: reduce` it draws a single frame and stops. The
 * element never takes pointer events and is hidden from assistive tech.
 *
 * @param props - Backdrop options; see {@link ShaderBackdropProps}.
 * @returns The canvas backdrop, or the CSS gradient fallback.
 */
export function ShaderBackdrop(props: ShaderBackdropProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [accent, setAccent] = useState<Rgb>(readAccentColor)
  const [webglUnavailable, setWebglUnavailable] = useState(false)
  const accentRef = useRef<Rgb>(accent)
  const intensityRef = useRef<number>(clampIntensity(props.intensity))

  useEffect(() => {
    accentRef.current = accent
  }, [accent])

  useEffect(() => {
    intensityRef.current = clampIntensity(props.intensity)
  }, [props.intensity])

  useEffect(() => {
    // The resolved accent changes with the theme class and with the presets
    // that this app applies through `data-theme-preset`.
    const observer = new MutationObserver(() => {
      setAccent((current) => {
        const next = readAccentColor()
        return sameColor(current, next) ? current : next
      })
    })
    observer.observe(document.documentElement, {
      attributeFilter: ['class', 'data-theme', 'data-theme-preset'],
      attributes: true,
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = createGlContext(canvas)
    const initialResources = gl ? buildResources(gl) : null
    if (!gl || !initialResources) {
      // The fallback replaces the canvas on the next render.
      setWebglUnavailable(true)
      return
    }

    let resources = initialResources
    let frameHandle = 0
    let running = false
    let contextLost = false
    // Distinguishes "nothing drawn yet" from "drawn and now paused", so a mount
    // under reduced motion still produces exactly one frame.
    let hasDrawn = false
    // Accumulated instead of derived from a start timestamp so a pause never
    // turns into a jump in the animation.
    let elapsed = 0
    let lastFrameAt = performance.now()
    let onScreen = true
    let pageVisible = document.visibilityState !== 'hidden'
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    const drawFrame = (): void => {
      if (contextLost) return
      gl.useProgram(resources.program)
      gl.bindBuffer(gl.ARRAY_BUFFER, resources.buffer)
      gl.enableVertexAttribArray(resources.positionAttribute)
      gl.vertexAttribPointer(
        resources.positionAttribute,
        2,
        gl.FLOAT,
        false,
        0,
        0
      )
      const [warm, cool] = toGlowPalette(accentRef.current)
      gl.uniform2f(resources.uniforms.resolution, canvas.width, canvas.height)
      gl.uniform1f(resources.uniforms.time, elapsed)
      gl.uniform1f(resources.uniforms.intensity, intensityRef.current)
      gl.uniform3f(resources.uniforms.accent, warm[0], warm[1], warm[2])
      gl.uniform3f(resources.uniforms.cool, cool[0], cool[1], cool[2])
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      hasDrawn = true
    }

    const tick = (now: number): void => {
      frameHandle = 0
      elapsed += Math.min((now - lastFrameAt) / 1000, MAX_FRAME_DELTA_SECONDS)
      lastFrameAt = now
      drawFrame()
      if (running) frameHandle = window.requestAnimationFrame(tick)
    }

    const start = (): void => {
      if (running || contextLost) return
      running = true
      lastFrameAt = performance.now()
      frameHandle = window.requestAnimationFrame(tick)
    }

    const stop = (): void => {
      running = false
      if (frameHandle !== 0) {
        window.cancelAnimationFrame(frameHandle)
        frameHandle = 0
      }
    }

    const sync = (): void => {
      if (motionQuery.matches) {
        // Reduced motion renders, but only the single frame each state change
        // needs: the loop must never start.
        stop()
        drawFrame()
        return
      }
      if (!onScreen || !pageVisible || contextLost) {
        stop()
        return
      }
      start()
    }

    const resize = (): void => {
      const ratio =
        Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO) *
        RESOLUTION_SCALE
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
      if (canvas.width === width && canvas.height === height) return
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
      // A paused backdrop still owes the viewer a frame at the new size; before
      // the first frame the caller's own sync() owns that draw.
      if (!running && hasDrawn) drawFrame()
    }

    const handleVisibilityChange = (): void => {
      pageVisible = document.visibilityState !== 'hidden'
      sync()
    }

    const handleMotionPreference = (): void => {
      sync()
    }

    const handleContextLost = (event: Event): void => {
      // Preventing the default keeps the browser able to restore the context.
      event.preventDefault()
      contextLost = true
      stop()
    }

    const handleContextRestored = (): void => {
      disposeResources(gl, resources)
      const rebuilt = buildResources(gl)
      if (!rebuilt) {
        setWebglUnavailable(true)
        return
      }
      resources = rebuilt
      contextLost = false
      resize()
      sync()
    }

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => resize())
    if (resizeObserver) resizeObserver.observe(canvas)
    else window.addEventListener('resize', resize)

    const intersectionObserver =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            const entry = entries.at(-1)
            onScreen = entry ? entry.isIntersecting : true
            sync()
          })
    intersectionObserver?.observe(canvas)

    document.addEventListener('visibilitychange', handleVisibilityChange)
    motionQuery.addEventListener('change', handleMotionPreference)
    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)

    resize()
    sync()

    return () => {
      stop()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      intersectionObserver?.disconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      motionQuery.removeEventListener('change', handleMotionPreference)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      // Resources are released, but the context is never force-lost: StrictMode
      // remounts into the same canvas and would otherwise receive a dead one.
      disposeResources(gl, resources)
    }
  }, [])

  // `size-full` is required, not cosmetic: a replaced element with an auto CSS
  // size takes its layout size from the drawing buffer, so resizing the buffer
  // would resize the element and re-trigger the ResizeObserver that asked for
  // the resize. Explicit 100% sizing breaks that feedback loop.
  const className = cn(
    'pointer-events-none fixed inset-0 -z-10 block size-full',
    props.className
  )

  if (webglUnavailable) {
    return (
      <div
        aria-hidden='true'
        className={className}
        style={{
          backgroundImage: cssFallbackBackground(
            accent,
            clampIntensity(props.intensity)
          ),
        }}
      />
    )
  }

  return <canvas ref={canvasRef} aria-hidden='true' className={className} />
}
