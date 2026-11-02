import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['react'],
  // Marks the bundle as client code for React Server Components (Next.js app router).
  banner: { js: "'use client';" },
});
