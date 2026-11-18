import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build works from any path (GitHub Pages serves it under /toyota-simulator/).
  base: './',
  plugins: [react()],
  server: { port: 5183, strictPort: true },
  test: { globals: true, environment: 'node' },
} as never);
