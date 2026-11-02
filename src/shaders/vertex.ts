export const vertexShader = `#version 300 es
out vec2 vUv;
void main() {
  // Single fullscreen triangle.
  vUv = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
}
`;
