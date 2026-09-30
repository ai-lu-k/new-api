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
import { WHALE_MASK_ASPECT } from './whale-mask'

/**
 * Seconds of accumulated shader time inside the resting phase. Reduced motion
 * renders this instant as a single frame instead of playing the intro.
 */
export const STATIC_FRAME_TIME_SECONDS = 30

/**
 * Seconds of accumulated shader time after which the intro is over and the
 * distant whale only drifts.
 */
export const INTRO_END_SECONDS = 8.5

/**
 * Deep-sea fragment shader: the light field from the original backdrop, plus
 * god rays and caustics, a whale drawn from `uWhale`, and the intro eye.
 *
 * Written against GLSL ES 1.00 so one program serves WebGL2 and WebGL1, and
 * unrolled rather than looped because every fixed count here is small and
 * dynamic loop bounds are the least portable construct in ES 1.00.
 *
 * Uniforms:
 * - `uResolution` - drawing buffer size in pixels; sets the pixel grid.
 * - `uTime` - accumulated seconds, frozen at
 *   {@link STATIC_FRAME_TIME_SECONDS} under reduced motion. Drives every phase.
 * - `uIntensity` - 0..1 master scale for every additive term.
 * - `uAccent` - theme accent in linear RGB.
 * - `uCool` - cooler neighbour of the accent, in linear RGB.
 * - `uWhale` - whale coverage mask, 1.0 inside the silhouette. Sampled at
 *   several offsets for the soft shadow and the shading gradient.
 * - `uWhaleEye` - mask-space UV of the eye, anchoring the intro eye to the head
 *   so pulling back does not slide the eye across the body.
 */
export const FRAGMENT_SHADER_SOURCE = `
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
uniform sampler2D uWhale;
uniform vec2 uWhaleEye;

// Intro timings, in accumulated shader seconds.
// The intro is authored against a shorter clock and then stretched, because
// the app mounts this backdrop before the landing content resolves: at the
// authored pace the eye finished behind the loading state and most visitors
// never saw it.
const float INTRO_STRETCH = 1.7;
const float EYE_HOLD_END = 2.2;
const float SWIM_END = 5.0;

// Seconds the resting whale takes to cross the frame once.
const float TRAVERSE_SECONDS = 118.0;

// Quad half-height in height-relative world units, where 1.0 is the viewport
// height. The mask aspect fixes the half-width.
const float INTRO_HALF_HEIGHT = 0.62;
// The resting whale is far wider than the viewport is tall, so the frame crops
// it: a whale passing close by is never seen whole, and a small complete whale
// centred on screen reads as a decal rather than as an animal in the water.
const float REST_HALF_HEIGHT = 0.24;

// Tilt the whale holds while the eye fills the frame, in radians.
const float INTRO_TILT = 0.22;

// Screen-space softness of the whale shadow, in the same world units. Wide on
// purpose: the animal is tens of metres away and seen through water, so every
// edge has to be diffuse.
const float SHADOW_BLUR = 0.014;

// Halftone cell size, in drawing-buffer pixels.
const float DOT_PITCH = 5.0;

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

float whaleMask(vec2 uv) {
  return texture2D(uWhale, clamp(uv, vec2(0.0), vec2(1.0))).r;
}

// Nine mask taps: the centre, four axis taps reused for the shading gradient,
// and four diagonal taps that round out the blur. The weights sum to one.
void sampleWhale(vec2 uv, vec2 r, out float sharp, out float soft, out vec2 grad) {
  float centre = whaleMask(uv);
  float right = whaleMask(uv + vec2(r.x, 0.0));
  float left = whaleMask(uv - vec2(r.x, 0.0));
  float up = whaleMask(uv + vec2(0.0, r.y));
  float down = whaleMask(uv - vec2(0.0, r.y));
  sharp = centre;
  soft =
    centre * 0.2 +
    (right + left + up + down) * 0.11 +
    (whaleMask(uv + r * 0.71) +
      whaleMask(uv - r * 0.71) +
      whaleMask(uv + vec2(r.x, -r.y) * 0.71) +
      whaleMask(uv + vec2(-r.x, r.y) * 0.71)) * 0.09;
  grad = vec2(right - left, up - down);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  // Height-relative coordinates keep the cells round on any aspect ratio.
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime;
  // Intro-relative clock; the resting drift keeps real time.
  float it = t / INTRO_STRETCH;

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

  // God rays: near-vertical shafts drifting on one low-frequency field,
  // brightest at the surface and fading into the depth below.
  float shafts = fbmWarp(vec2(p.x * 1.7 + t * 0.012, p.y * 0.30 + t * 0.019));
  shafts = smoothstep(0.46, 0.90, shafts);
  shafts *= smoothstep(-0.6, 0.5, p.y);
  color += light * shafts * (0.25 + 0.75 * glow) * 0.055 * uIntensity;

  // Caustics: two much higher frequency fields multiplied, so only their
  // occasional coincidence lights up. Very low amplitude by design.
  float causticA = valueNoise(p * 27.0 + vec2(t * 0.05, t * -0.030));
  float causticB = valueNoise(p * 33.0 + vec2(9.1, 3.7) + vec2(t * -0.04, t * 0.055));
  float caustic = smoothstep(0.52, 1.0, causticA * causticB);
  color += light * caustic * (0.35 + 0.65 * glow) * 0.05 * uIntensity;

  // Whale placement. Ease-out, so the turn never snaps, and the resting path is
  // evaluated at zero age during the intro so the two agree at the handover.
  float swimK = clamp((it - EYE_HOLD_END) / (SWIM_END - EYE_HOLD_END), 0.0, 1.0);
  float swim = 1.0 - pow(1.0 - swimK, 3.0);
  float restAge = max(t - SWIM_END * INTRO_STRETCH, 0.0);
  // Resting traverse: in from the left, across the light, out to the right,
  // both ends clear of the frame so the wrap is never visible. The phase offset
  // starts it where the intro leaves the whale.
  float traverse = fract(0.148 + restAge / TRAVERSE_SECONDS);
  vec2 restCenter = vec2(
    mix(-1.35, 1.35, traverse),
    0.06 + 0.05 * sin(restAge * 0.041)
  );
  float restTilt = 0.035 * sin(restAge * 0.053);

  float halfHeight = mix(INTRO_HALF_HEIGHT, REST_HALF_HEIGHT, swim);
  vec2 halfExtent = vec2(halfHeight * ${WHALE_MASK_ASPECT.toFixed(1)}, halfHeight);
  float angle = mix(INTRO_TILT, restTilt, swim);

  // Mask offset of the eye in world units, rotated into the current tilt.
  vec2 eyeRel = vec2(
    (uWhaleEye.x - 0.5) * 2.0 * halfExtent.x,
    (0.5 - uWhaleEye.y) * 2.0 * halfExtent.y
  );
  float tiltCos = cos(angle);
  float tiltSin = sin(angle);
  vec2 eyeOffset = vec2(
    eyeRel.x * tiltCos - eyeRel.y * tiltSin,
    eyeRel.x * tiltSin + eyeRel.y * tiltCos
  );
  // Phase A frames the eye dead centre; the whale is placed so that same mask
  // point lands there. The pull-back then swings the body through the middle of
  // the frame - the reveal is what makes the turn read - before it drifts off to
  // the left and the resting traverse takes over.
  vec2 whaleCenter = mix(vec2(0.05, 0.015) - eyeOffset, restCenter, swimK * swimK);
  whaleCenter.x += 0.55 * sin(3.14159265 * swimK);

  // The body darkens what passes behind it and scatters a rim of light around
  // its edge, as if it were between the viewer and the light.
  float whaleAlpha = smoothstep(2.25, 3.35, it);
  if (whaleAlpha > 0.002) {
    vec2 rel = p - whaleCenter;
    vec2 local = vec2(
      rel.x * tiltCos + rel.y * tiltSin,
      -rel.x * tiltSin + rel.y * tiltCos
    );
    vec2 maskUv = vec2(
      local.x / (2.0 * halfExtent.x),
      -local.y / (2.0 * halfExtent.y)
    ) + 0.5;
    if (all(greaterThan(maskUv, vec2(-0.08))) && all(lessThan(maskUv, vec2(1.08)))) {
      vec2 blurRadius = SHADOW_BLUR / (2.0 * halfExtent);
      float sharp;
      float soft;
      vec2 grad;
      sampleWhale(maskUv, blurRadius, sharp, soft, grad);
      float body = soft * whaleAlpha;

      // Fake body normal from the mask gradient; drives the lit edge and the
      // halftone dot radius together.
      vec3 normal = normalize(vec3(-grad.x * 3.5, grad.y * 3.5, 1.0));
      float facing = clamp(
        dot(normal, normalize(vec3(-0.45, 0.6, 0.66))),
        0.0,
        1.0
      );

      // The body is a mass of shadow, so it can only ever *remove* light. An
      // earlier revision also added a bright term along the mask edge, which
      // outshone the body and turned the animal into a contour drawing. The
      // halftone now modulates how much light survives inside the silhouette
      // instead of drawing bright dots over it.
      vec2 grid = mat2(0.928, -0.371, 0.371, 0.928) * gl_FragCoord.xy / DOT_PITCH;
      float dotDist = length(fract(grid) - 0.5);
      float tone = clamp(body * (0.35 + 0.65 * facing), 0.0, 1.0);
      float dotRadius = sqrt(tone) * 0.46;
      float ink = smoothstep(dotRadius, dotRadius - 0.22, dotDist);
      float density = mix(0.34, 1.0, ink);

      color *= 1.0 - 0.46 * body * density * uIntensity;
      // Only a faint scatter along the lit edge, to keep the mass from reading
      // as a flat hole punched in the water.
      color += mix(uCool, uAccent, 0.45) * body * facing * 0.10 * uIntensity;
    }
  }

  // The eye: a macro shot of the whale's eye for the intro, squashing shut as
  // the whale turns away and the body takes over.
  float blink = smoothstep(2.15, 2.95, it);
  float eyeAmount = smoothstep(0.0, 0.5, it) * (1.0 - smoothstep(2.62, 3.5, it));
  if (eyeAmount > 0.003) {
    // Slow lissajous parallax: the eye drifts against the light field instead
    // of sitting on top of it like a decal.
    vec2 drift = vec2(0.026 * sin(t * 0.21), 0.018 * sin(t * 0.157 + 1.4));
    vec2 eyeCenter = mix(vec2(0.05, 0.015), whaleCenter + eyeOffset, swim) + drift;
    float eyeRadius = 0.46 * (halfHeight / INTRO_HALF_HEIGHT);
    float squash = mix(0.88, 0.09, blink);
    vec2 e = (p - eyeCenter) / vec2(eyeRadius, eyeRadius * squash);
    float r = length(e);

    // Eyelid: a soft dark falloff that also buys the headline its contrast.
    float lid = 1.0 - smoothstep(1.0, 2.2, r);
    color *= mix(1.0, 0.30, lid * eyeAmount * uIntensity);
    float crease = (1.0 - smoothstep(1.0, 1.06, r)) * smoothstep(1.08, 1.18, r);
    color *= mix(1.0, 0.50, crease * eyeAmount * uIntensity);
    // Socket: a trace of light on the skin around the lid, so the eye sits in a
    // face rather than in a void.
    float socket = smoothstep(0.98, 1.30, r) * (1.0 - smoothstep(1.30, 2.30, r));
    color += uAccent * socket * eyeAmount * uIntensity * 0.025;

    float iris = 1.0 - smoothstep(0.86, 1.0, r);
    if (iris > 0.002) {
      vec2 dir = e / max(r, 1e-4);
      float ang = atan(dir.y, dir.x);
      // Radial fibres as angular harmonics. Every term has an integer frequency,
      // so the pattern closes seamlessly where the angle wraps.
      float fibre =
        0.5 +
        0.30 * sin(ang * 7.0 + r * 2.6 + t * 0.03) +
        0.20 * sin(ang * 17.0 - r * 5.5);
      float rings = 0.82 + 0.18 * sin(r * 26.0 - t * 0.22);
      float pupilCentre = length((e - vec2(0.02, 0.04)) / vec2(1.15, 1.0));
      float pupil = 1.0 - smoothstep(0.24, 0.36, pupilCentre + 0.008 * sin(ang * 11.0));
      float limbus = smoothstep(0.74, 0.99, r);
      float gathered = clamp(dot(dir, vec2(-0.55, 0.60)), 0.0, 1.0);

      // Iris tone: fibre structure over a falloff that deepens toward the
      // limbus, so the disc has depth instead of reading as one flat circle.
      float irisShade = mix(0.26, 0.46, fibre * rings);
      irisShade *= 0.55 + 0.45 * (1.0 - smoothstep(0.18, 0.98, r));
      irisShade *= 0.85 + 0.35 * gathered;
      vec3 irisColor = mix(uCool, uAccent, 0.42) * irisShade;
      // The upper lid casts its own shadow across the top of the iris.
      irisColor *= 1.0 - 0.35 * limbus * clamp(dot(dir, vec2(0.0, 1.0)), 0.0, 1.0);
      irisColor *= mix(1.0, 0.45, limbus);
      irisColor = mix(irisColor, uCool * 0.03, pupil * 0.9);

      // Wet rim light along the upper left of the limbus, then one hard
      // catchlight with a bloom and one dimmer counter-fleck: what actually
      // sells this as an eye rather than a dark disc.
      float rimArc =
        smoothstep(0.80, 0.96, r) * (1.0 - smoothstep(0.96, 1.0, r)) * gathered;
      irisColor += vec3(0.72, 0.80, 1.0) * rimArc * 0.22;
      float keyDist = length(e - vec2(-0.32, 0.34));
      float key = 1.0 - smoothstep(0.055, 0.135, keyDist);
      float bloom = exp(-keyDist * keyDist * 22.0) * 0.13;
      float fill =
        (1.0 - smoothstep(0.05, 0.22, length(e - vec2(0.30, -0.24)))) * 0.14;
      irisColor += vec3(0.90, 0.94, 1.0) * (key * 0.36 + bloom + fill);

      color = mix(color, irisColor, iris * eyeAmount * uIntensity);
    }
  }

  // One LSB of fixed-pattern dither. Near-black gradients band hard on 8-bit
  // panels, and a time-varying dither would flicker, so the pattern is static.
  float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;

  gl_FragColor = vec4(clamp(color + dither, 0.0, 1.0), 1.0);
}
`
