# snkcanvas

A hypnotic background of melting neon tubes, with an airbrushed film-grain finish. It is a WebGL2 shader with a React component on top, and has no runtime dependencies beyond React.

- Colours morph across the frame through a cycle of palettes.
- Tubes bend gently towards the pointer.
- Rendering stops when the canvas is off-screen, in a hidden tab, or paused.
- Visitors who prefer reduced motion get a still frame.

How the animation works, and which numbers to change for which effect, is in [docs/how-it-works.md](docs/how-it-works.md).

## Repository layout

```
src/
  SnkCanvas.tsx     React component: a thin wrapper around createFlow
  createFlow.ts     The engine: WebGL setup, render loop, pointer, lifecycle. No React.
  palettes.ts       Palette type and the four built-in palettes
  shaders/
    scene.ts        The tubes: shapes, colour, lighting
    post.ts         Film grain, dust, corner falloff
    vertex.ts       Fullscreen triangle
  index.ts          Public exports
demo/               Fullscreen demo app, built from src
docs/               How the animation works
prototypes/         Earlier standalone experiments, kept for reference. Not part of the package.
_temp/              Source reference images. Not part of the package.
```

## Working on it

```sh
npm install        # also builds dist/
npm run dev        # demo at http://localhost:5173
npm run typecheck
npm run build      # library, to dist/
npm run build:demo # demo as a static site, to dist-demo/
```

To try settings, edit the props in [demo/main.tsx](demo/main.tsx). The dev server reloads as you save. Clicking the demo moves to the next palette.

## Adding it to a React project

The package is marked `private`, so it won't be published to npm by accident. Pick one of these:

**From a tarball.** Run `npm pack` here, copy `snkcanvas-0.1.0.tgz` into your project, then:

```sh
npm install ./snkcanvas-0.1.0.tgz
```

**From a Git repository**, once this folder is in one:

```sh
npm install git+ssh://git@github.com/your-org/snkcanvas.git
```

**By copying the source.** Copy `src/` into your project and import from it. It has no build step of its own, but your project must compile TypeScript and TSX.

## Usage

`SnkCanvas` fills its parent, so the parent needs a size. For a hero section with content on top:

```tsx
import { SnkCanvas } from 'snkcanvas';

export function Hero() {
  return (
    <section style={{ position: 'relative', height: '100vh' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <SnkCanvas />
      </div>
      <div style={{ position: 'relative' }}>
        <h1>Your content</h1>
      </div>
    </section>
  );
}
```

The canvas renders `aria-hidden` and carries no content. Text placed over it has a constantly changing background, so check its contrast against all the palettes you use.

### Props

All props are optional and can change between renders, except the two marked as read once. Any other prop, such as `className`, `style` or `onClick`, passes to the `<canvas>`.

| Prop | Default | Description |
| --- | --- | --- |
| `palettes` | four built-in | Palettes to cycle through, in order |
| `speed` | `1` | Motion speed. Doesn't affect colour timing |
| `zoom` | `0.5` | Lower is closer in, with fewer tubes in frame |
| `tubes` | `2.33` | Tube density. Lower is fatter |
| `pointerPull` | `0.4` | How strongly tubes bend towards the pointer |
| `pointerResponse` | `0.6` | How quickly the effect follows the pointer, per second. Lower is lazier |
| `interactive` | `true` | Whether the pointer has any effect |
| `holdSeconds` | `9` | Time resting on each palette |
| `morphSeconds` | `14` | Time moving to the next palette |
| `paused` | `false` | Freeze on the current frame |
| `respectReducedMotion` | `true` | Show a still frame when the visitor prefers reduced motion |
| `renderScale` | `0.5` | Tube resolution relative to the canvas. Lower is cheaper and softer |
| `maxDpr` | `2` | Device pixel ratio cap |
| `startTime` | `20` | Read once. Clock at the first frame, which sets the opening composition. The motion never repeats, so any value gives a new one. Keep it under about 10,000, as float precision makes motion steppy beyond that |
| `startPalette` | `0` | Read once. Index of the first palette |

### A different opening each visit

Pick random start values once, with `useState`, so they stay fixed across re-renders:

```tsx
const [start] = useState(() => ({
  time: Math.random() * 1000,
  palette: Math.floor(Math.random() * palettes.length),
}));

<SnkCanvas palettes={palettes} startTime={start.time} startPalette={start.palette} />;
```

With server rendering, the server and browser pick different values, so the fallback background won't match on hydration. Pick the values in a `useEffect` instead, and render `SnkCanvas` once they're set.

### Custom palettes

Colours must be `#rrggbb`. Pass a stable reference, such as a constant outside the component.

```tsx
import { SnkCanvas, type Palette } from 'snkcanvas';

const brand: Palette[] = [
  { pale: '#f4f0ff', deep: '#1a0a4a', neon: ['#7a3cff', '#ff3d9a', '#29d3ff'] },
  { pale: '#fff4e6', deep: '#4a1a0a', neon: ['#ff7a1a', '#ffd21a', '#ff3d3d'] },
];

<SnkCanvas palettes={brand} />;
```

- `neon`: the three tones looped across the tubes. These do most of the work.
- `deep`: the shadow between tubes, and the fallback background.
- `pale`: a little of this is added to the glowing core of each tube.

### Triggering a colour change

```tsx
const canvas = useRef<SnkCanvasHandle>(null);

<SnkCanvas ref={canvas} />;
<button onClick={() => canvas.current?.nextPalette()}>Change colour</button>;
```

### Next.js and server rendering

The bundle is marked `'use client'`, and the component renders a plain `<canvas>` on the server. WebGL starts after hydration, so the canvas shows the first palette's `deep` colour until then.

### Without React

The engine has no dependency on React:

```ts
import { createFlow } from 'snkcanvas';

const flow = createFlow(canvas, { zoom: 0.5 }); // null if WebGL2 is unavailable
flow?.update({ speed: 0.6 });
flow?.destroy();
```

## Behaviour to know about

- **Sizing:** the canvas follows its CSS size automatically.
- **Fallback:** where WebGL2 is unavailable, the canvas shows the first palette's `deep` colour as a flat background.
- **Lost GPU context:** the animation stops, then rebuilds itself when the browser restores the context.
- **Pointer:** tracked on `window`, so content layered over the canvas doesn't block it. It only has an effect while the cursor is inside the canvas.
- **Cost:** every pixel of a shader runs on every frame. If a device struggles, lower `renderScale` or `maxDpr`.

## Tested

Tested in Chrome on an Apple M1 Pro with React 19: 60fps at 1920×1080 at 2x. Checked from a packed tarball in a separate app, as ESM and CommonJS, including `renderToString`, StrictMode, unmounting, context loss, off-screen pausing and reduced motion.

Not yet tested: Safari, Firefox, phones, low-end GPUs, React 18, a real Next.js app, and installing from Git.
