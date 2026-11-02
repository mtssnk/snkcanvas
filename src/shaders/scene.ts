/** Scene pass: neon tubes as the contour lines of one smooth field. */
export const sceneShader = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

const int SOURCES = 5;
const vec3 LIGHT = vec3(-0.42, 0.58, 0.70);

uniform vec2  uRes;
uniform float uTime;
uniform float uZoom;         // lower is closer in, with fewer tubes in frame
uniform float uTubes;        // tubes per unit of field; lower is fatter
uniform vec3  uFrom[5];      // pale, deep, neon a, neon b, neon c
uniform vec3  uTo[5];
uniform float uMorph;
uniform vec3  uPointer;      // xy position, z presence
uniform float uPointerPull;  // how strongly the pointer attracts tubes

float drift(vec2 p, float t, float seed) {
  return 0.5 + 0.5 * sin(p.x * 1.7 + sin(p.y * 2.1 + seed + t * 0.13) * 1.6 + t * 0.09 + seed * 2.1);
}

// Colour travels across the frame as a soft front rather than cross-fading.
vec3 paint(int i, vec2 p, float t) {
  float front = uMorph * 2.2 - 0.6 + (drift(p * 0.8, t, 7.0 + float(i)) - 0.5) * 0.9;
  return mix(uFrom[i], uTo[i], smoothstep(0.0, 0.6, front));
}

// Three neon tones looped smoothly.
vec3 neon(float x, vec2 p, float t) {
  x = fract(x) * 3.0;
  float f = smoothstep(0.1, 0.9, fract(x));
  int i = int(x);
  return mix(paint(2 + i, p, t), paint(2 + (i + 1) % 3, p, t), f);
}

// Gentle sine warp, so rings melt out of round.
vec2 melt(vec2 p, float t) {
  float a = 0.16;
  float f = 1.5;
  for (int i = 0; i < 3; i++) {
    float k = float(i);
    p += a * vec2(sin(p.y * f + t * 0.17 + k * 1.7), sin(p.x * f * 1.13 - t * 0.14 + k * 2.9));
    a *= 0.55;
    f *= 1.5;
  }
  return p;
}

// Sum of soft sources and sinks. Contours ring each one, and pinch and join at
// the saddles between them: that joining is the melting.
float field(vec2 p, float t) {
  vec2 q = melt(p, t);
  float f = 0.0;
  for (int i = 0; i < SOURCES; i++) {
    float k = float(i);
    vec2 c = vec2(
      sin(t * (0.083 + k * 0.017) + k * 2.4) * 0.62,
      cos(t * (0.071 - k * 0.009) + k * 1.3) * 0.46
    );
    float charge = (i % 2 == 0 ? 1.0 : -1.0) * (1.0 - k * 0.09);
    vec2 d = q - c;
    f += charge * 0.5 * log(dot(d, d) + 0.05);
  }
  vec2 d = p - uPointer.xy * uZoom;
  return f + uPointer.z * uPointerPull * log(dot(d, d) + 0.12);
}

// One tube's cross-section. \`u\` runs 0 to 1 from the crisp side to the far side:
// a long airbrushed roll with a soft glowing core.
vec3 tube(float u, float index, vec2 across, vec2 p, float t) {
  float x = 2.0 * pow(u, 0.72) - 1.0;
  vec3 n = normalize(vec3(across * x, sqrt(max(1.0 - x * x, 0.0)) + 0.12));

  float tone = index * 0.09 + u * 0.05 + t * 0.012;
  vec3 tint = neon(tone, p, t);
  vec3 rim = neon(tone + 0.4, p, t);
  vec3 deep = mix(paint(1, p, t), tint * 0.3, 0.35);

  vec3 col = mix(deep, tint, smoothstep(-0.3, 0.6, dot(n, LIGHT)));
  float core = exp(-pow((u - 0.6) / 0.2, 2.0));
  col = mix(col, tint * 1.12 + paint(0, p, t) * 0.14, core * 0.4);

  // Coloured light spilling across from the neighbouring tube.
  return mix(col, rim, exp(-u / 0.06) * 0.8);
}

void main() {
  float t = uTime;
  vec2 p = (vUv - 0.5) * uRes / sqrt(uRes.x * uRes.y) * uZoom;

  // Sources drift very slowly: a small move sweeps many tubes across the frame.
  float slow = t * 0.28;
  float f = field(p, slow) * uTubes;
  // Finite differences rather than dFdx: the slope sets the tube's direction,
  // and must stay smooth at half resolution.
  float e = 0.003;
  vec2 slope = (vec2(field(p + vec2(e, 0), slow), field(p + vec2(0, e), slow)) * uTubes - f) / e;
  // Fades to flat where the field does, so sources and saddles stay dimple free.
  vec2 across = slope / sqrt(dot(slope, slope) + 4.0);

  // Steady scroll: tubes are born at sources and drain into sinks, for ever.
  float phase = f + t * 0.14;
  float index = floor(phase);
  float u = phase - index;

  // Tubes crossed per scene pixel, for antialiasing the seam.
  float pixel = length(slope) * uZoom / sqrt(uRes.x * uRes.y);

  // Each seam changes from a crisp edge to a full dissolve along its length.
  float seam = mix(0.012, 0.42, smoothstep(0.3, 0.85, drift(p * 1.3, t * 0.5, 3.0 + index * 0.6)));
  seam = max(seam, pixel * 1.6);
  float blend = smoothstep(0.0, seam, 1.0 - u);
  vec3 col = mix(tube(0.0, index + 1.0, across, p, t), tube(u, index, across, p, t), blend);

  // Where tubes crowd beyond what the pixels can hold, settle to their average.
  vec3 settled = 0.5 * (tube(0.3, index, across, p, t) + tube(0.8, index, across, p, t));
  col = mix(col, settled, smoothstep(0.3, 0.8, pixel));

  // Alpha carries how much film grain this pixel takes.
  fragColor = vec4(col, clamp(0.2 + (1.0 - blend) * 0.8, 0.0, 1.0));
}
`;
