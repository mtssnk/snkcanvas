# How the animation works

Every tube on screen is a contour line of a single smooth field, like the height lines on a map. The tubes are not separate objects. That one idea explains most of how the animation behaves: tubes run in parallel, never collide, and merge where contours join.

## The render pipeline

Each frame runs two fragment shader passes:

```
scene.ts (half resolution)              post.ts (full resolution)
tubes, colour, lighting      ──────►    film grain, dust, corner falloff  ──►  screen
rendered to a float texture             upscales the scene smoothly
```

The tubes are soft, so half resolution costs little visually and saves most of the work. Grain has to stay sharp, so it runs at full resolution. The texture is floating point because long, slow gradients show visible banding in 8-bit colour.

The scene pass has no geometry and no stored state. Each pixel's colour is calculated from its position and the clock, and the engine in `createFlow.ts` only supplies those inputs.

## From field to tubes

These steps are all in `main()` and the functions above it in `src/shaders/scene.ts`.

**1. Build the field.** Five points drift around the frame, alternating between sources and sinks. Each adds a logarithmic bowl or hill:

```glsl
f += charge * 0.5 * log(dot(d, d) + 0.05);
```

The contours of this sum ring each point and form saddles between them. As points drift, contours pinch off and join up at those saddles. That is the melting.

**2. Warp it.** `melt()` shifts the input position with a few sine waves, so rings go organically out of round.

**3. Slice it into tubes.** The field is multiplied by the tube density and a steady amount is added over time:

```glsl
float phase = f + t * 0.14;
float index = floor(phase);   // which tube this pixel is in
float u = phase - index;      // where it sits across that tube, 0 to 1
```

The time term moves every contour along the field for ever: tubes are born at sources and drain into sinks. This constant flow is what makes it hypnotic.

Tube width comes from the field's slope. Where the slope is gentle, a tube swells. Where it's steep, tubes crowd together.

**4. Shade a tube.** `tube()` turns `u` into a fake cylinder. Its surface normal is built from `u` and the slope direction, and then it's lit from the upper left. The cross-section is deliberately lopsided, a sawtooth rather than a symmetrical bump. One side is crisp and the other rolls off slowly, which gives the look of airbrush over a stencil.

**5. Vary the edges.** Where one tube meets the next, the seam width changes along its length, from razor sharp to a full dissolve. `drift()` is a slow wobble that controls this. It's the most important detail for matching the reference prints.

**6. Handle crowding.** Where tubes are thinner than a pixel, they would shimmer, so they fade to their average colour instead.

## Colour

A palette has five colours. `neon()` loops the three neon tones, stepping along with `index`, so neighbouring tubes differ slightly and bands of colour flow through the frame. The neighbouring tone also spills a thin line across each crisp edge, which gives the neon rim.

Between palettes, `paint()` doesn't cross-fade. It moves a soft front across the frame, offset per colour, so hybrid palettes appear along the way. Palette timing runs in real time and ignores `speed`.

## Grain

`post.ts` adds clumped film grain that refreshes at about 15fps, like film. The scene pass stores a grain amount in its alpha channel, which is highest at dissolving seams, so grain reads as airbrush stipple there. A sparse pattern of fixed dark specks adds dust.

## The pointer

The pointer is one more soft point in the field, so tubes bend around it through the same maths as everything else. Its position and presence ease towards the cursor over time, so it never snaps. This easing uses elapsed time, so it feels the same on 60Hz and 120Hz displays.

## Engine lifecycle

`createFlow.ts` keeps WebGL outside React's render cycle. `SnkCanvas` creates it once on mount, forwards prop changes through `update()`, and calls `destroy()` on unmount.

`sync()` is the single place that decides whether the loop runs. It stops the loop when the canvas is paused, off-screen, in a hidden tab, showing a still frame for reduced motion, or has lost its GPU context, and it draws one frame so the canvas isn't left stale.

## What to change

**Through props:**

| To change | Use |
| --- | --- |
| Overall scale, fewer or more forms | `zoom` |
| Fatter or thinner tubes | `tubes` |
| Pace of the motion | `speed` |
| Mouse strength and laziness | `pointerPull`, `pointerResponse` |
| Colour pacing | `holdSeconds`, `morphSeconds` |

**In `src/shaders/scene.ts`:**

| To change | Edit | Notes |
| --- | --- | --- |
| Flow along the tubes | `t * 0.14` in `phase` | Higher flows faster. This is the hypnotic pulse |
| How fast the shapes change | `t * 0.28` in `slow` | Small increases go a long way: moving a source sweeps many tubes across the frame |
| Complexity of the shapes | `SOURCES` | More gives busier compositions. It's also a little more work per pixel |
| How wobbly the tubes are | `a = 0.16` in `melt()` | Higher is more liquid. Too high, and contours start to fold sharply |
| Crisp against dissolved edges | `mix(0.012, 0.42, ...)` in `seam` | The first number is the crispest edge, the second the softest |
| Tube shape | `pow(u, 0.72)` in `tube()` | Controls how lopsided the cross-section is |
| Neon rim strength | `exp(-u / 0.06) * 0.8` in `tube()` | |
| Colour spread between tubes | `index * 0.09` in `tube()` | Higher makes neighbouring tubes more distinct |

**In `src/shaders/post.ts`:**

| To change | Edit |
| --- | --- |
| Grain strength | `0.03 + 0.11 * scene.a` (base, then extra at seams) |
| Dust amount | `0.9994` (closer to 1 is less dust) |
| Corner darkening | `0.22` in the falloff line |

Each frame evaluates the field three times per pixel to find its slope, and shades a tube up to four times. Any addition inside `field()` or `tube()` is therefore multiplied, so check the frame rate after changing them.
