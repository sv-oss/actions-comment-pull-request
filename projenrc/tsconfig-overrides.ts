import { GitHubActionTypeScriptProject } from 'projen-github-action-typescript';

/**
 * `@actions/core@>=2` and `@actions/github@>=8` are ESM-only and ship their
 * types via package `exports` subpaths (e.g. `@octokit/core/types`). The
 * production tsconfig uses `Bundler` module resolution (TS 5.0+) so the
 * source can `import` from those packages without TS rewriting to
 * `require()` calls — `ncc` does the final CJS bundling for the Action
 * runtime, so `tsc` is reduced to a pure type-checker (`noEmit: true`).
 *
 * The test tsconfig is kept on `module: CommonJS` so that ts-node can load
 * `.projenrc.ts` without needing an ESM loader flag, but still keeps the
 * `Bundler` resolution and modern target/lib values needed by the
 * `@octokit/*` type-resolution chain.
 */
export function applyTsconfigOverrides(project: GitHubActionTypeScriptProject) {
  const productionOverrides = {
    'compilerOptions.module': 'ESNext',
    'compilerOptions.moduleResolution': 'Bundler',
    'compilerOptions.target': 'ES2022',
    'compilerOptions.lib': ['ES2022'],
    'compilerOptions.noEmit': true,
  };
  const testOverrides = {
    'compilerOptions.module': 'CommonJS',
    'compilerOptions.moduleResolution': 'Bundler',
    'compilerOptions.target': 'ES2022',
    'compilerOptions.lib': ['ES2022'],
  };

  applyOverrides(project, 'tsconfig.json', productionOverrides);
  applyOverrides(project, 'test/tsconfig.json', testOverrides);
}

function applyOverrides(
  project: GitHubActionTypeScriptProject,
  path: string,
  overrides: Record<string, unknown>,
) {
  const file = project.tryFindObjectFile(path);
  if (!file) return;
  for (const [key, value] of Object.entries(overrides)) {
    file.addOverride(key, value);
  }
}
