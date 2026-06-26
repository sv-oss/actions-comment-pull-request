import { github, javascript, DependencyType } from 'projen';
import { MergeMethod } from 'projen/lib/github';
import { GitHubActionTypeScriptProject } from 'projen-github-action-typescript';
import { actionMetadata } from './projenrc/action-metadata';
import { addAiInstructions } from './projenrc/ai-instructions';
import { BOT_LOGIN, DEPS_UPGRADE_LABEL, ciAppCredentials } from './projenrc/constants';
import { applyDoNotMergeGuard } from './projenrc/do-not-merge-guard';
import { addRepoSettings } from './projenrc/repo-settings';
import { applyTsconfigOverrides } from './projenrc/tsconfig-overrides';

const project = new GitHubActionTypeScriptProject({
  defaultReleaseBranch: 'main',
  name: 'actions-comment-pull-request',
  description: 'GitHub action for commenting on a pull request (Service Victoria maintained fork of thollander/actions-comment-pull-request).',
  packageManager: javascript.NodePackageManager.NPM,
  projenrcTs: true,
  minNodeVersion: '24.15.0',
  minMajorVersion: 4,
  license: 'MIT',
  copyrightOwner: 'Service Victoria',
  dependabot: false,
  jest: false,
  deps: [],
  devDeps: [
    'projen-github-action-typescript',
    'vitest@^3',
    '@vitest/coverage-v8@^3',
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
    workflowOptions: {
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
// advisories that don't yet have upstream fixes available via direct
// package upgrades. Caret ranges, not exact pins, so patch/minor updates
// with the fixes get picked up automatically.
project.package.addField('overrides', {
  'undici': '^6.27.0',
  'fast-xml-parser': '^5.9.3',
  'fast-xml-builder': '^1.2.0',
  'js-yaml': '^4.2.0',
  '@actions/http-client': '^2.2.3',
});

// Wire vitest as the test runner in place of jest.
const testTask = project.tasks.tryFind('test')!;
testTask.reset('vitest run --coverage --passWithNoTests', { receiveArgs: true });
project.tasks.tryFind('test:watch')?.reset('vitest', { receiveArgs: true });
const eslintTask = project.tasks.tryFind('eslint');
if (eslintTask) testTask.spawn(eslintTask);

// Test/coverage artefacts: ignore in git AND keep out of the npm tarball.
for (const path of ['/coverage/', '/test-reports/', 'junit.xml']) {
  project.addGitIgnore(path);
  project.addPackageIgnore(path);
}
// ncc emits 0-byte .d.ts shadows next to bundles when fed .ts sources;
// they aren't needed by the Action runtime.
project.addGitIgnore('dist/**/*.d.ts');

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

// Pin @octokit/types to the version line shipped by @actions/github@^9.
// @actions/core@^3 and @actions/github@^9 themselves float at whatever
// projen-github-action-typescript resolves (currently latest).
project.deps.removeDependency('@octokit/types');
project.deps.addDependency('@octokit/types@^16', DependencyType.RUNTIME);

applyTsconfigOverrides(project);

// Since tsc no longer emits lib/, point ncc at the TypeScript sources
// directly. Two ncc passes — one per Action entrypoint.
project.packageTask.reset('ncc build --source-map --license licenses.txt src/index.ts -o dist');
project.packageTask.exec('ncc build --source-map --license licenses.txt src/cleanup-entry.ts -o dist/cleanup');

applyDoNotMergeGuard(project);
addRepoSettings(project);
addAiInstructions(project);

project.synth();
