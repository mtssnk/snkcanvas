import { defaultPalettes, toUniform, type Palette } from './palettes';
import { postShader } from './shaders/post';
import { sceneShader } from './shaders/scene';
import { vertexShader } from './shaders/vertex';

export interface FlowOptions {
  /** Cycled in order. Default: the four built-in palettes. */
  palettes: Palette[];
  /** Animation speed multiplier. Colour timing is unaffected. Default 1. */
  speed: number;
  /** Lower is closer in, with fewer tubes in frame. Default 0.5. */
  zoom: number;
  /** Tube density; lower is fatter. Default 2.33. */
  tubes: number;
  /** How strongly the pointer attracts tubes. 0 to disable the bend. Default 0.4. */
  pointerPull: number;
  /** How quickly the effect follows the pointer, per second. Lower is lazier. Default 0.6. */
  pointerResponse: number;
  /** Seconds resting on each palette. Default 9. */
  holdSeconds: number;
  /** Seconds moving to the next palette. Default 14. */
  morphSeconds: number;
  /** Whether the pointer affects the tubes. Default true. */
  interactive: boolean;
  /** Freezes on the current frame. Default false. */
  paused: boolean;
  /** Shows a still frame for visitors who prefer reduced motion. Default true. */
  respectReducedMotion: boolean;
  /** Tube resolution relative to the canvas. Lower is cheaper and softer. Default 0.5. */
  renderScale: number;
  /** Device pixel ratio cap. Default 2. */
  maxDpr: number;
}

export interface FlowStart {
  /** Animation clock at the first frame, which sets the opening composition. Default 20. */
  startTime?: number;
  /** Index of the first palette. Default 0. */
  startPalette?: number;
}

export interface Flow {
  /** Changes options while running. `undefined` values are ignored. */
  update(options: Partial<FlowOptions>): void;
  /** Starts moving to the next palette now, unless already on the way. */
  nextPalette(): void;
  /** Stops rendering and releases everything. The canvas can be reused afterwards. */
  destroy(): void;
}

export const defaultOptions: FlowOptions = {
  palettes: defaultPalettes,
  speed: 1,
  zoom: 0.5,
  tubes: 2.33,
  pointerPull: 0.4,
  pointerResponse: 0.6,
  holdSeconds: 9,
  morphSeconds: 14,
  interactive: true,
  paused: false,
  respectReducedMotion: true,
  renderScale: 0.5,
  maxDpr: 2,
};

const MAX_FRAME_SECONDS = 0.05;

interface Program {
  program: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

const buildProgram = (gl: WebGL2RenderingContext, fragment: string): Program => {
  const compile = (type: number, text: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('snkcanvas: could not create a shader');
    gl.shaderSource(shader, text);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`snkcanvas: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  };

  const program = gl.createProgram();
  if (!program) throw new Error('snkcanvas: could not create a program');
  const shaders = [compile(gl.VERTEX_SHADER, vertexShader), compile(gl.FRAGMENT_SHADER, fragment)];
  shaders.forEach((shader) => gl.attachShader(program, shader));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`snkcanvas: ${gl.getProgramInfoLog(program)}`);
  }
  shaders.forEach((shader) => gl.deleteShader(shader));

  const u: Program['u'] = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(program, i)!.name.replace('[0]', '');
    u[name] = gl.getUniformLocation(program, name);
  }
  return { program, u };
};

/**
 * Starts the animation on a canvas, sized by CSS.
 * Returns null where WebGL2 is unavailable, so the caller can fall back.
 */
export const createFlow = (
  canvas: HTMLCanvasElement,
  initial: Partial<FlowOptions> & FlowStart = {},
): Flow | null => {
  const glContext = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    powerPreference: 'low-power',
  });
  if (!glContext) return null;
  const gl = glContext;

  const options = { ...defaultOptions };
  let colours: Float32Array[] = [];

  const apply = (next: Partial<FlowOptions>) => {
    for (const [key, value] of Object.entries(next)) {
      if (key in defaultOptions && value !== undefined) {
        (options as Record<string, unknown>)[key] = value;
      }
    }
    colours = options.palettes.map(toUniform);
  };
  apply(initial);

  /* ---------- GPU resources, rebuilt if the context is lost ---------- */

  interface Gpu {
    scene: Program;
    post: Program;
    vao: WebGLVertexArrayObject | null;
    texture: WebGLTexture | null;
    framebuffer: WebGLFramebuffer | null;
    float: boolean;
  }

  const buildGpu = (): Gpu => {
    const scene = buildProgram(gl, sceneShader);
    const post = buildProgram(gl, postShader);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Float target keeps the long gradients free of banding.
    const float =
      !!gl.getExtension('EXT_color_buffer_float') ||
      !!gl.getExtension('EXT_color_buffer_half_float');
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { scene, post, vao, texture, framebuffer, float };
  };

  let gpu: Gpu | null = buildGpu();
  let dpr = 1;
  let sceneW = 1;
  let sceneH = 1;

  const resize = () => {
    if (!gpu) return;
    dpr = Math.min(window.devicePixelRatio || 1, options.maxDpr);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    sceneW = Math.max(1, Math.round(canvas.width * options.renderScale));
    sceneH = Math.max(1, Math.round(canvas.height * options.renderScale));

    gl.bindTexture(gl.TEXTURE_2D, gpu.texture);
    if (gpu.float) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, sceneW, sceneH, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sceneW, sceneH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, gpu.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gpu.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  /* ---------- Animation state ---------- */

  let palette = (initial.startPalette ?? 0) % colours.length;
  let clock = initial.startTime ?? 20;
  let morphClock = 0; // seconds spent on this palette
  let last = 0;
  let raf = 0;
  let onScreen = true;

  // The pointer is one more soft source, eased so nothing ever snaps.
  const pointer = { x: 0, y: 0, presence: 0, targetX: 0, targetY: 0, targetPresence: 0 };

  const draw = () => {
    if (!gpu) return;
    const { scene, post } = gpu;
    const progress = (morphClock - options.holdSeconds) / options.morphSeconds;
    const m = Math.min(1, Math.max(0, progress));
    const morph = m * m * (3 - 2 * m);
    const current = colours[palette % colours.length];
    const next = colours[(palette + 1) % colours.length];

    gl.bindFramebuffer(gl.FRAMEBUFFER, gpu.framebuffer);
    gl.viewport(0, 0, sceneW, sceneH);
    gl.useProgram(scene.program);
    gl.uniform2f(scene.u.uRes, sceneW, sceneH);
    gl.uniform1f(scene.u.uTime, clock);
    gl.uniform1f(scene.u.uZoom, options.zoom);
    gl.uniform1f(scene.u.uTubes, options.tubes);
    gl.uniform3fv(scene.u.uFrom, current);
    gl.uniform3fv(scene.u.uTo, next);
    gl.uniform1f(scene.u.uMorph, morph);
    gl.uniform3f(scene.u.uPointer, pointer.x, pointer.y, pointer.presence);
    gl.uniform1f(scene.u.uPointerPull, options.pointerPull);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(post.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gpu.texture);
    gl.uniform1i(post.u.uScene, 0);
    gl.uniform1f(post.u.uGrainSeed, (Math.floor(performance.now() / 66) % 97) / 97); // about 15fps, like film
    gl.uniform1f(post.u.uPixel, Math.max(1, dpr));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME_SECONDS, (now - last) / 1000);
    last = now;
    clock += dt * options.speed;
    morphClock += dt;
    if (morphClock >= options.holdSeconds + options.morphSeconds) {
      morphClock = 0;
      palette = (palette + 1) % colours.length;
    }
    const ease = 1 - Math.exp(-options.pointerResponse * dt);
    pointer.x += (pointer.targetX - pointer.x) * ease;
    pointer.y += (pointer.targetY - pointer.y) * ease;
    pointer.presence += (pointer.targetPresence - pointer.presence) * ease;
    draw();
  };

  /* ---------- Starting and stopping ---------- */

  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  // Runs only while there is something to see. Otherwise holds a single frame.
  const sync = () => {
    const still = options.paused || (options.respectReducedMotion && motion.matches);
    const run = !!gpu && !still && onScreen && !document.hidden;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (!run) draw();
  };

  const onResize = () => {
    resize();
    if (!raf) draw();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!options.interactive) return;
    const rect = canvas.getBoundingClientRect();
    const size = Math.sqrt(rect.width * rect.height) || 1;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    pointer.targetPresence = inside ? 1 : 0;
    if (inside) {
      pointer.targetX = (x - rect.width / 2) / size;
      pointer.targetY = (rect.height / 2 - y) / size;
    }
  };
  const onPointerGone = () => {
    pointer.targetPresence = 0;
  };

  const onContextLost = (e: Event) => {
    e.preventDefault(); // Without this the browser never offers the context back.
    gpu = null;
    sync();
  };
  const onContextRestored = () => {
    gpu = buildGpu();
    resize();
    sync();
  };

  const resizeObserver = new ResizeObserver(onResize);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  });

  resize();
  resizeObserver.observe(canvas);
  intersectionObserver.observe(canvas);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointercancel', onPointerGone);
  document.documentElement.addEventListener('mouseleave', onPointerGone);
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  sync();

  return {
    update(next) {
      const { maxDpr, renderScale } = options;
      apply(next);
      if (options.maxDpr !== maxDpr || options.renderScale !== renderScale) resize();
      if (!options.interactive) onPointerGone();
      sync();
    },
    nextPalette() {
      morphClock = Math.max(morphClock, options.holdSeconds);
      if (!raf) draw();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointercancel', onPointerGone);
      document.documentElement.removeEventListener('mouseleave', onPointerGone);
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (gpu) {
        gl.deleteProgram(gpu.scene.program);
        gl.deleteProgram(gpu.post.program);
        gl.deleteVertexArray(gpu.vao);
        gl.deleteTexture(gpu.texture);
        gl.deleteFramebuffer(gpu.framebuffer);
        gpu = null;
      }
    },
  };
};
