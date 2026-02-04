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
  bundle: true,
  external: [
    // Your actual runtime dependencies (will be resolved at runtime from node_modules)
    'kysely',
    'pg',
    'pino',
    'serialize-error',
    // Database drivers you don't use (kysely's optional peer deps)
    'mysql2',
    'better-sqlite3',
    'tedious',
    'tarn',
    '@libsql/kysely-libsql',
    'kysely-bun-worker',
    '@tediousjs/connection-string',
    // Dev-only packages
    'kysely-codegen',
  ],
  outExtension: () => ({ js: '.js' }),
});
