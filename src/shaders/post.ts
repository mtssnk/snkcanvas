/** Composite pass: runs at full resolution so the grain stays sharp. */
export const postShader = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform float uGrainSeed;
uniform float uPixel;     // device pixels per grain cell

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

// Two-pixel value noise: film grain clumps, it isn't per-pixel static.
float grain(vec2 px, float seed) {
  vec2 c = px / uPixel;
  vec2 i = floor(c), f = fract(c);
  f = f * f * (3.0 - 2.0 * f);
  vec2 s = vec2(seed * 17.0, seed * 41.0);
  float n = mix(mix(hash(i + s), hash(i + s + vec2(1, 0)), f.x),
                mix(hash(i + s + vec2(0, 1)), hash(i + s + vec2(1, 1)), f.x), f.y);
  return n + (hash(gl_FragCoord.xy + s) - 0.5) * 0.45 - 0.5;
}

void main() {
  vec4 scene = texture(uScene, vUv);
  vec3 col = scene.rgb;

  float n = grain(gl_FragCoord.xy, uGrainSeed);
  float amount = 0.03 + 0.11 * scene.a;
  col += n * amount * (0.55 + 0.45 * (1.0 - abs(dot(col, vec3(0.33)) * 2.0 - 1.0)));

  // Fixed dust on the emulsion.
  vec2 cell = floor(gl_FragCoord.xy / (uPixel * 1.5));
  if (hash(cell + 3.7) > 0.9994) col *= 0.82;

  // Gentle corner falloff.
  vec2 v = vUv - 0.5;
  col *= 1.0 - dot(v, v) * 0.22;

  fragColor = vec4(col, 1.0);
}
`;
