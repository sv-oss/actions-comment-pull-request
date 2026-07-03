import { Component } from 'projen';
import { GitHubActionTypeScriptProject } from 'projen-github-action-typescript';

/**
 * projen generates one tsconfig per source tree — production `tsconfig.json`
 * (`src/`), `test/tsconfig.json`, and (since projen 0.101.4) `projenrc/
 * tsconfig.json`. Each extends the production config but is *consumed*
 * differently, which is the only reason the module settings vary. There are
 * two coherent profiles:
 *
 *  1. BUNDLER profile — production + test. This code is never executed by
 *     `tsc`: `tsup` (esbuild) bundles `src/` to CJS for the Action runtime and
 *     vitest runs `test/` through esbuild, so `tsc` is a pure type-checker
 *     (`noEmit`). `@actions/core@>=3` and `@actions/github@>=9` are ESM-only
 *     and expose their types via package `exports` subpaths (e.g.
 *     `@octokit/core/types`), which only `moduleResolution: Bundler` (TS 5.0+)
 *     resolves. Bundler resolution is valid *only* alongside `module: ESNext`
 *     (otherwise TS5095), hence the pairing.
 *
 *  2. TS-NODE profile — projenrc. `.projenrc.ts` is actually *executed* by
 *     ts-node, so it needs a real Node resolver rather than `Bundler`.
 *     `NodeNext` resolves it as CommonJS (this package has no
 *     `"type": "module"`), letting ts-node load it — and its
 *     `projen/lib/github` directory import — without hitting
 *     `ERR_UNSUPPORTED_DIR_IMPORT`. The projenrc sources only import `projen` /
 *     `projen-github-action-typescript` (plain CJS, no `exports` map), so they
 *     have no need for Bundler resolution.
 *
 * Production additionally disables every source map: esbuild would otherwise
 * embed absolute paths, making dist/ bytes differ between developer
 * machines and CI and breaking the release task's `git diff --exit-code`
 * reproducibility guard.
 */
export class TsconfigOverrides extends Component {
  constructor(project: GitHubActionTypeScriptProject) {
    super(project, 'TsconfigOverrides');

    // Shared by every tree — a modern target/lib for the @octokit/* type chain.
    const base = {
      'compilerOptions.target': 'ES2022',
      'compilerOptions.lib': ['ES2022'],
    };

    // Type-checked but never run by tsc (tsup / esbuild handle emission).
    const bundlerProfile = {
      ...base,
      'compilerOptions.module': 'ESNext',
      'compilerOptions.moduleResolution': 'Bundler',
    };

    // Executed by ts-node, so it needs Node-style (CommonJS) resolution.
    const tsNodeProfile = {
      ...base,
      'compilerOptions.module': 'NodeNext',
      'compilerOptions.moduleResolution': 'NodeNext',
    };

    this.applyOverrides('tsconfig.json', {
      ...bundlerProfile,
      'compilerOptions.noEmit': true,
      'compilerOptions.inlineSourceMap': false,
      'compilerOptions.inlineSources': false,
      'compilerOptions.sourceMap': false,
    });
    this.applyOverrides('test/tsconfig.json', bundlerProfile);
    this.applyOverrides('projenrc/tsconfig.json', tsNodeProfile);
  }

  private applyOverrides(path: string, overrides: Record<string, unknown>) {
    const file = this.project.tryFindObjectFile(path);
    if (!file) return;
    for (const [key, value] of Object.entries(overrides)) {
      file.addOverride(key, value);
    }
  }
}
