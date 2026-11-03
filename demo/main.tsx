import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { SnkCanvas, defaultPalettes, type SnkCanvasHandle } from "../src";

const palettes = defaultPalettes;

function Demo() {
  const canvas = useRef<SnkCanvasHandle>(null);

  // Picked once per page load. useState keeps them stable across re-renders.
  const [start] = useState(() => ({
    time: Math.random() * 1000,
    palette: Math.floor(Math.random() * palettes.length),
  }));

  return (
    <SnkCanvas
      ref={canvas}
      palettes={palettes}
      onClick={() => canvas.current?.nextPalette()}
      speed={0.77}
      zoom={0.7}
      tubes={2.1}
      pointerPull={0.4}
      pointerResponse={0.6}
      holdSeconds={0}
      morphSeconds={14}
      paused={false}
      startTime={start.time}
      startPalette={start.palette}
      // startPalette={0}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
