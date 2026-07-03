import { AiInstructions, AiAgent, Component } from 'projen';
import { GitHubActionTypeScriptProject } from 'projen-github-action-typescript';

/**
 * Generates instruction files for the AI coding assistants that actually
 * run against this repo. Currently scoped to GitHub Copilot — both
 * Copilot CLI and the cloud code-review agent consume
 * `.github/copilot-instructions.md`. If we ever onboard a different
 * assistant, add it to the `agents` array; do not duplicate the
 * instructions list.
 */
export class AiAssistantInstructions extends Component {
  constructor(project: GitHubActionTypeScriptProject) {
    super(project, 'AiAssistantInstructions');

    new AiInstructions(project, {
      agents: [AiAgent.GITHUB_COPILOT],
      instructions: [
        'This repository is a Service Victoria Platform Engineering maintained fork of `thollander/actions-comment-pull-request`, upgraded to node24.',
        'The project is managed by **projen**. Do NOT edit generated files directly (e.g. `package.json`, `tsconfig.json`, `action.yml`, anything under `.github/workflows/`, `.github/settings.yml`, `dist/`, `.projen/`). Instead, edit `.projenrc.ts` (or the helpers under `projenrc/`) and run `npx projen`.',
        'Build with `npx projen build` (runs synth, tsc type-check, vitest, eslint, tsup bundle). Test with `npx projen test`. Both `dist/index.js` and `dist/cleanup/index.js` are committed because the Action runtime consumes them directly from a git ref.',
        'TypeScript is configured with `module: ESNext` + `moduleResolution: Bundler` + `noEmit: true` for the production sources, because `@actions/core@^3` and `@actions/github@^9` are ESM-only. `tsc` only type-checks; `tsup` (esbuild) bundles `src/index.ts` and `src/cleanup-entry.ts` directly to CJS (config in `tsup.config.ts`).',
        'When upserting/deleting PR comments, the HTML marker is `<!-- service-victoria/actions-comment-pull-request "tag" -->`. The old upstream marker (`thollander/...`) is intentionally NOT matched — this is a deliberate clean break.',
        'Auto-merge for dependency upgrade PRs uses the native projen merge queue (`.github/workflows/auto-queue.yml`), not Mergify. The branch protection rule on `main` is declared in `.github/settings.yml` and synced by the probot/settings GitHub App.',
        'Tests use **vitest**, not jest. Mock `@actions/core` and `@actions/github` at module level when writing tests. The `run()` function in `src/main.ts` and `src/cleanup.ts` is exported separately from the entry files (`src/index.ts`, `src/cleanup-entry.ts`) so it can be imported without triggering side effects.',
        'Shared values (the CD bot login, deps-upgrade/do-not-merge label names, App-credential secret names) live in `projenrc/constants.ts`. Don\'t hard-code them anywhere else in projenrc/.',
      ],
    });
  }
}
