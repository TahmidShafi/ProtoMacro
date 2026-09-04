import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built dist/ works when hosted from any sub-path.
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false
  }
});
