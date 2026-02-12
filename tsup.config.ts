import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/main/index.ts',
    api: 'src/api/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  minify: false,
  outDir: 'dist',
  tsconfig: 'tsconfig.build.json',
  bundle: true,
  outExtension: () => ({ js: '.js' }),
});
