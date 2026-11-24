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
 * Background shader for the auth brand panel: a weighted blend of drifting
 * colour fields, bent by low-frequency noise and crossed by thin aurora
 * ribbons, plus a light that follows the pointer. Colours come from
 * `--primary`, so a theme preset or theme switch repaints the panel in the
 * same hue while staying dark enough for white copy.
 */

export type Rgb = [number, number, number]

export interface AuthBrandPalette {
  deep: Rgb
  mid: Rgb
  accent: Rgb
  light: Rgb
}

// #8AB4F9, used when the CSS variable cannot be resolved.
const FALLBACK_BRAND: Rgb = [0.541, 0.706, 0.976]

const VERTEX_SOURCE = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAGMENT_SOURCE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform vec3 u_deep;
uniform vec3 u_mid;
uniform vec3 u_accent;
uniform vec3 u_light;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    total += amplitude * noise(p);
    p = turn * p * 2.03 + 19.19;
    amplitude *= 0.5;
  }
  return total;
}

float blob(vec2 point, vec2 center, vec2 stretch, float spread) {
  vec2 delta = (point - center) * stretch;
  return exp(-dot(delta, delta) * spread);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  // Normalise by the mean edge length so the same field stays smooth on the
  // narrow phone header and on the tall desktop panel.
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / (0.5 * (u_resolution.x + u_resolution.y));
  float t = u_time * 0.16;

  // Low-frequency warp keeps the colour fields from looking like perfect
  // circles without adding cloud texture on top of them.
  vec2 warp = vec2(
    fbm(p * 1.4 + vec2(t * 0.32, -t * 0.26)),
    fbm(p * 1.4 + vec2(-t * 0.24, t * 0.3) + 7.3)
  ) - 0.5;
  vec2 pp = p + warp * 0.5 + u_pointer * 0.12;

  vec2 midLight = vec2(0.4 + 0.12 * sin(t * 0.62), 0.04 + 0.14 * cos(t * 0.5));
  vec2 accentLight = vec2(0.26 + 0.1 * cos(t * 0.44 + 1.6), 0.46 + 0.1 * sin(t * 0.56));
  vec2 shade = vec2(-0.36 + 0.14 * sin(t * 0.48 + 3.4), -0.42 + 0.12 * cos(t * 0.4 + 1.2));
  vec2 sheen = vec2(-0.04 + 0.16 * cos(t * 0.34 + 2.2), 0.5 + 0.1 * sin(t * 0.46 + 4.4));

  float midWeight = blob(pp, midLight, vec2(0.9, 1.25), 4.4);
  float accentWeight = blob(pp, accentLight, vec2(1, 1.35), 3.6) * 1.1;
  float shadeWeight = blob(pp, shade, vec2(1.1, 0.9), 2.9) * 0.9;
  float sheenWeight = blob(pp, sheen, vec2(1.2, 1.5), 5.4) * 0.42;
  float pointerWeight = blob(p, u_pointer * vec2(0.55, 0.45), vec2(1, 1), 5.5) * 0.45;

  vec3 color = u_deep;
  float total = 1.0;
  color += u_mid * midWeight;
  total += midWeight;
  color += u_accent * accentWeight;
  total += accentWeight;
  color += u_deep * shadeWeight;
  total += shadeWeight;
  color += u_light * sheenWeight;
  total += sheenWeight;
  color += u_light * pointerWeight;
  total += pointerWeight;
  color /= total;

  float rim = smoothstep(0.3, 0.68, midWeight) * (1.0 - smoothstep(0.68, 0.96, midWeight));
  color += u_light * rim * 0.22;

  // A soft light streak crossing the panel adds a sense of direction.
  vec2 axis = normalize(vec2(0.78, -0.63));
  float across = dot(p, vec2(axis.y, -axis.x));
  float along = dot(p, axis);
  float streak = exp(-pow((across - 0.2) / 0.17, 2.0)) * smoothstep(0.55, -0.55, along);
  color += u_light * streak * 0.1;

  // Undulating aurora lines: the part that reads as computed rather than CSS.
  float bandNoise = fbm(p * 1.5 + vec2(t * 0.14, -t * 0.1));
  float band = (p.x * 0.52 + p.y * 0.85) * 3.2 + bandNoise * 2.6 + t * 0.08;
  float lines = pow(0.5 + 0.5 * cos(band * 6.28318), 14.0);
  float linesSoft = pow(0.5 + 0.5 * cos(band * 6.28318 * 0.5 + 2.1), 6.0);
  color += mix(u_accent, u_light, 0.5) * (lines * 0.11 + linesSoft * 0.05) * smoothstep(-0.35, 0.75, p.y + 0.55);

  // Thin diagonal sheen bands: silk, not clouds.
  float silk = fbm(vec2((p.x * 0.6 + p.y * 0.8) * 3.2 + t * 0.22, (p.y * 0.6 - p.x * 0.8) * 1.1 - t * 0.12));
  color += u_light * smoothstep(0.46, 0.78, silk) * 0.055;

  color += u_light * 0.05 * smoothstep(-0.7, 0.5, -p.y - p.x * 0.6);
  color *= 1.0 - 0.22 * smoothstep(0.32, 1.05, length((uv - vec2(0.52, 0.5)) * vec2(0.95, 0.8)));
  color += (hash(gl_FragCoord.xy + fract(u_time) * 91.0) - 0.5) * 0.022;

  gl_FragColor = vec4(color, 1.0);
}
`

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

/** Compile and link the panel shader, returning null when WebGL cannot run it. */
export function createAuthBrandProgram(
  gl: WebGLRenderingContext
): WebGLProgram | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE)
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
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

function parseCssColor(value: string): Rgb | null {
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const context = probe.getContext('2d')
  if (!context) return null
  context.fillStyle = 'rgb(1, 2, 3)'
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  if (red === 1 && green === 2 && blue === 3) return null
  return [red / 255, green / 255, blue / 255]
}

/** Resolve the theme's primary colour so the panel follows preset and theme changes. */
export function readAuthBrandColor(): Rgb {
  if (typeof document === 'undefined') return FALLBACK_BRAND
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary')
    .trim()
  if (!value) return FALLBACK_BRAND
  return parseCssColor(value) ?? FALLBACK_BRAND
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4)
}

function linearToSrgb(channel: number): number {
  const value =
    channel <= 0.0031308
      ? channel * 12.92
      : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055
  return Math.min(1, Math.max(0, value))
}

function srgbToOklab(color: Rgb): Rgb {
  const [red, green, blue] = color.map(srgbToLinear) as Rgb
  const l = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
  )
  const m = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
  )
  const s = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
  )
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToSrgb(lab: Rgb): Rgb {
  const [lightness, axisA, axisB] = lab
  const l = Math.pow(lightness + 0.3963377774 * axisA + 0.2158037573 * axisB, 3)
  const m = Math.pow(lightness - 0.1055613458 * axisA - 0.0638541728 * axisB, 3)
  const s = Math.pow(lightness - 0.0894841775 * axisA - 1.291485548 * axisB, 3)
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/**
 * Keep the theme's hue but rebuild lightness and chroma so the panel stays
 * deep enough for white copy no matter how light or muted the preset is.
 */
export function authBrandPalette(brand: Rgb): AuthBrandPalette {
  const [, axisA, axisB] = srgbToOklab(brand)
  const chroma = Math.max(Math.hypot(axisA, axisB), 0.09)
  const hue = Math.atan2(axisB, axisA)
  const scale = (target: number) => Math.min(chroma * target, 0.19)
  const shade = (lightness: number, target: number, hueShift: number) =>
    oklabToSrgb([
      lightness,
      Math.cos(hue + hueShift) * scale(target),
      Math.sin(hue + hueShift) * scale(target),
    ])
  return {
    deep: shade(0.26, 0.9, -0.1),
    mid: shade(0.44, 1.45, 0),
    accent: shade(0.6, 1.45, 0.55),
    light: shade(0.92, 0.45, 0.05),
  }
}
