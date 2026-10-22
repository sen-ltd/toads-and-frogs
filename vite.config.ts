import { defineConfig } from 'vite';

export default defineConfig({
  base: '/portfolio/toads-and-frogs/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
