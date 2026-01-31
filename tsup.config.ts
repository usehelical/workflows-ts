import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'client/index.ts',
    workflows: 'core/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  outDir: 'dist',
  tsconfig: 'tsconfig.build.json',
  bundle: false,
});
