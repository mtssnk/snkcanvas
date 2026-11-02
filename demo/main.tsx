import { StrictMode, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { SnkCanvas, type SnkCanvasHandle } from '../src';

// Try ?speed=0.6, ?zoom=0.7, ?tubes=3, or ?paused&t=48&p=2 to hold a frame.
const params = new URLSearchParams(location.search);
const number = (key: string) => (params.has(key) ? Number(params.get(key)) : undefined);

function Demo() {
  const canvas = useRef<SnkCanvasHandle>(null);

  return (
    <SnkCanvas
      ref={canvas}
      onClick={() => canvas.current?.nextPalette()}
      speed={number('speed')}
      zoom={number('zoom')}
      tubes={number('tubes')}
      paused={params.has('paused')}
      startTime={number('t')}
      startPalette={number('p')}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
