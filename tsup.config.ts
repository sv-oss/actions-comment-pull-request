import { defineConfig } from 'tsup';

// Bundles the two Action entrypoints into single-file CJS that the Action
// runtime consumes directly from a git ref (no node_modules alongside).
// The entry keys become the output paths under outDir:
//   index        -> dist/index.js
//   cleanup/index -> dist/cleanup/index.js
// sourcemap is off on purpose — embedded absolute paths would break the
// release task's `git diff --exit-code` reproducibility guard. dts is off
// because the runtime never reads type declarations. See .projenrc.ts.
export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'cleanup/index': 'src/cleanup-entry.ts',
  },
  outDir: 'dist',
  format: ['cjs'],
  platform: 'node',
  target: 'node24',
  bundle: true,
  // The Action ships no node_modules, so everything must be inlined. tsup
  // treats `dependencies` as external by default; override that so all
  // non-builtin modules get bundled (Node built-ins stay external — they're
  // provided by the runtime).
  noExternal: [/.*/],
  splitting: false,
  sourcemap: false,
  clean: true,
  dts: false,
  treeshake: true,
  minify: false,
  shims: false,
});
