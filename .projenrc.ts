import { github, javascript, DependencyType, TextFile } from 'projen';
import { MergeMethod } from 'projen/lib/github';
import { UpgradeDependenciesSchedule } from 'projen/lib/javascript';
import { GitHubActionTypeScriptProject } from 'projen-github-action-typescript';
import { actionMetadata } from './projenrc/action-metadata';
import { AiAssistantInstructions } from './projenrc/ai-instructions';
import { CompatibilityMirror } from './projenrc/compatibility-mirror';
import { BOT_LOGIN, DEPS_UPGRADE_LABEL, ciAppCredentials } from './projenrc/constants';
import { DoNotMergeGuard } from './projenrc/do-not-merge-guard';
import { RepoSettings } from './projenrc/repo-settings';
import { TsconfigOverrides } from './projenrc/tsconfig-overrides';
import { Vitest } from './projenrc/vitest';

const project = new GitHubActionTypeScriptProject({
  defaultReleaseBranch: 'main',
  name: 'actions-comment-pull-request',
  description: 'GitHub action for commenting on a pull request (Service Victoria maintained fork of thollander/actions-comment-pull-request).',
  packageManager: javascript.NodePackageManager.NPM,
  projenrcTs: true,
  minNodeVersion: '24.18.0',
  minMajorVersion: 4,
  license: 'MIT',
  copyrightOwner: 'Service Victoria',
  dependabot: false,
  jest: false,
  deps: [],
  devDeps: [
    'projen-github-action-typescript',
    'tsup',
  ],
  githubOptions: {
    mergify: false,
    mergeQueue: true,
    mergeQueueOptions: {
      autoQueue: true,
      autoQueueOptions: {
        labels: [DEPS_UPGRADE_LABEL],
        allowedUsernames: [BOT_LOGIN],
        projenCredentials: ciAppCredentials(),
        mergeMethod: MergeMethod.SQUASH,
      },
    },
  },
  autoApproveOptions: {
    label: DEPS_UPGRADE_LABEL,
    allowedUsernames: [BOT_LOGIN],
  },
  depsUpgradeOptions: {
    // Don't upgrade to versions that are <7 days old.
    // Should prevent us being hit by the worst of
    // supply chain attacks
    cooldown: 7,
    workflowOptions: {
      schedule: UpgradeDependenciesSchedule.expressions(['0 0 1,15 * *']),
      projenCredentials: ciAppCredentials(),
      labels: [DEPS_UPGRADE_LABEL],
    },
  },
  buildWorkflowOptions: {
    mutableBuild: false,
  },
  actionMetadata,
});

// Constrain minimum versions of transitive dependencies with known
// advisories. Caret ranges, not exact pins, so patch/minor updates with
// the fixes get picked up automatically.
//
// @actions/http-client is deliberately absent: @actions/core@3 needs `^4`
// (which has an `exports` map, so esbuild can statically resolve core's
// extensionless `@actions/http-client/lib/auth` import) while
// @actions/github@9 needs `^3`. Overriding to a single version collapses
// core onto the `^3` line, which has no `exports` map and forces esbuild
// into an `eval("require")` runtime fallback that crashes the bundled
// action. npm's natural resolution (separate copies) keeps both happy.
project.package.addField('overrides', {
  'undici': '^6.27.0',
  'fast-xml-parser': '^5.9.3',
  'fast-xml-builder': '^1.2.0',
  'js-yaml': '^4.2.0',
  // tsup/vite pin esbuild to `^0.27`, which carries a dev-server advisory
  // (GHSA-g7r4-m6w7-qqqr). We never run `esbuild serve`, but bumping the
  // shared copy to a patched line keeps `npm audit` clean.
  'esbuild': '^0.28.1',
});

// Wire vitest as the test runner in place of jest.
new Vitest(project);

// projen's `release` task drops scratch files in dist/ for the release
// workflow to read (changelog body, version, tag name) and immediately
// uploads them as workflow artefacts — they're transient and must never
// be committed alongside the action bundles.
project.addGitIgnore('dist/changelog.md');
project.addGitIgnore('dist/releasetag.txt');
project.addGitIgnore('dist/version.txt');

// Re-run the build after dependency upgrades so the compiled bundles in
// dist/ end up in the upgrade PR.
project.tasks.tryFind('post-upgrade')?.spawn(project.buildTask);

project.release?.addJobs({
  'floating-tags': {
    permissions: {
      contents: github.workflows.JobPermission.WRITE,
    },
    runsOn: ['ubuntu-latest'],
    needs: ['release_github'],
    steps: [
      { uses: 'actions/checkout@v6' },
      { uses: 'giantswarm/floating-tags-action@v1' },
    ],
  },
});

// The Actions toolkit v3/v9 lines are ESM. We only use APIs stable since
// v1 (getInput, setOutput, setFailed, info, debug, context, getOctokit).
// @octokit/types tracks the line @actions/github@9 ships (via
// @octokit/plugin-rest-endpoint-methods@^17). See the overrides above for
// the @actions/http-client resolution constraint these versions impose.
project.deps.removeDependency('@actions/core');
project.deps.removeDependency('@actions/github');
project.deps.addDependency('@actions/core@^3.0.0', DependencyType.RUNTIME);
project.deps.addDependency('@actions/github@^9.0.0', DependencyType.RUNTIME);
project.deps.removeDependency('@octokit/types');
project.deps.addDependency('@octokit/types@^16', DependencyType.RUNTIME);

new TsconfigOverrides(project);

// tsup (esbuild) bundles the two Action entrypoints straight from the
// TypeScript sources into single-file CJS — src/index.ts -> dist/index.js
// and src/cleanup-entry.ts -> dist/cleanup/index.js (entry mapping lives in
// tsup.config.ts). Source maps are disabled there: they embed absolute
// filesystem paths, so enabling them would break the release task's
// `git diff --exit-code` reproducibility guard, and the Action runtime
// never consumes them.
project.deps.removeDependency('@vercel/ncc');
project.packageTask.reset('tsup');

new DoNotMergeGuard(project);
new CompatibilityMirror(project);
new RepoSettings(project);
new AiAssistantInstructions(project);

new TextFile(project, '.nvmrc', {
  lines: [project.minNodeVersion ?? 'lts'],
});

project.synth();
