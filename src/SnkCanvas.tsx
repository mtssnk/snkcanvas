import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CanvasHTMLAttributes,
} from 'react';
import { createFlow, defaultOptions, type Flow, type FlowOptions, type FlowStart } from './createFlow';

export interface SnkCanvasProps
  extends Partial<FlowOptions>,
    FlowStart,
    Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'children'> {}

export interface SnkCanvasHandle {
  /** Starts moving to the next palette now, unless already on the way. */
  nextPalette(): void;
}

/**
 * Fills its parent, which must have a size. Options can change between renders;
 * `startTime` and `startPalette` are read once.
 */
export const SnkCanvas = forwardRef<SnkCanvasHandle, SnkCanvasProps>(function SnkCanvas(
  {
    palettes,
    speed,
    zoom,
    tubes,
    pointerPull,
    pointerResponse,
    holdSeconds,
    morphSeconds,
    interactive,
    paused,
    respectReducedMotion,
    renderScale,
    maxDpr,
    startTime,
    startPalette,
    style,
    ...canvasProps
  },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const flow = useRef<Flow | null>(null);

  const options: Partial<FlowOptions> = {
    palettes,
    speed,
    zoom,
    tubes,
    pointerPull,
    pointerResponse,
    holdSeconds,
    morphSeconds,
    interactive,
    paused,
    respectReducedMotion,
    renderScale,
    maxDpr,
  };
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    flow.current = createFlow(canvas.current!, { ...latest.current, startTime, startPalette });
    return () => {
      flow.current?.destroy();
      flow.current = null;
    };
    // The engine is created once. The effect below carries later changes across.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    flow.current?.update(latest.current);
  }, Object.values(options));

  useImperativeHandle(ref, () => ({ nextPalette: () => flow.current?.nextPalette() }), []);

  const fallback = (palettes ?? defaultOptions.palettes)[startPalette ?? 0]?.deep;

  return (
    <canvas
      aria-hidden="true"
      {...canvasProps}
      ref={canvas}
      style={{ display: 'block', width: '100%', height: '100%', background: fallback, ...style }}
    />
  );
});
