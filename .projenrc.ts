import { github, javascript, DependencyType, YamlFile } from 'projen';
import { MergeMethod } from 'projen/lib/github';
import { GitHubActionTypeScriptProject, RunsUsing } from 'projen-github-action-typescript';

const project = new GitHubActionTypeScriptProject({
  defaultReleaseBranch: 'main',
  githubOptions: {
    mergify: false,
    mergeQueue: true,
    mergeQueueOptions: {
      autoQueue: true,
      autoQueueOptions: {
        labels: ['deps-upgrade'],
        allowedUsernames: ['sv-oss-continuous-delivery[bot]'],
        projenCredentials: github.GithubCredentials.fromApp({
          appIdSecret: 'CICD_APP_ID',
          privateKeySecret: 'CICD_APP_PRIVKEY',
        }),
        mergeMethod: MergeMethod.SQUASH,
      },
    },
  },
  devDeps: [
    'projen-github-action-typescript',
    'vitest@^3',
    '@vitest/coverage-v8@^3',
  ],
  deps: [],
  name: 'actions-comment-pull-request',
  description: 'GitHub action for commenting on a pull request (Service Victoria maintained fork of thollander/actions-comment-pull-request).',
  packageManager: javascript.NodePackageManager.NPM,
  projenrcTs: true,
  minNodeVersion: '24.15.0',
  depsUpgradeOptions: {
    workflowOptions: {
      projenCredentials: github.GithubCredentials.fromApp({
        appIdSecret: 'CICD_APP_ID',
        privateKeySecret: 'CICD_APP_PRIVKEY',
      }),
      labels: ['deps-upgrade'],
    },
  },
  autoApproveOptions: {
    label: 'deps-upgrade',
    allowedUsernames: [
      'sv-oss-continuous-delivery[bot]',
    ],
  },
  dependabot: false,
  minMajorVersion: 1,
  license: 'MIT',
  copyrightOwner: 'Service Victoria',
  actionMetadata: {
    author: 'Service Victoria Platform Engineering',
    name: 'Comment Pull Request',
    description: 'Comments a pull request with the provided message',
    branding: {
      icon: 'message-circle',
      color: 'blue',
    },
    runs: {
      // WARNING: This is a temp workaround to prevent the action breaking soon.
      // Ideally, upgrade projen-github-action-typescript and use the proper `RunsUsing` enum when it's available
      using: 'node24' as RunsUsing, // RunsUsing.NODE_24, // For v24, we need: https://github.com/projen/projen-github-action-typescript/pull/529
      main: 'dist/index.js',
      post: 'dist/cleanup/index.js',
    },
    inputs: {
      'message': {
        description: 'Message that should be printed in the pull request',
        required: false,
      },
      'file-path': {
        description: 'Path of the file that should be commented',
        required: false,
      },
      'github-token': {
        description: 'Github token of the repository (automatically created by Github)',
        required: false,
        default: '${{ github.token }}',
      },
      'reactions': {
        description: 'You can set some reactions on your comments through the `reactions` input.',
        required: false,
      },
      'pr-number': {
        description: 'Manual pull request number',
        required: false,
      },
      'comment-tag': {
        description: 'A tag on your comment that will be used to identify a comment in case of replacement.',
        required: false,
      },
      'mode': {
        description: 'Mode that will be used (upsert/recreate/delete/delete-on-completion)',
        required: false,
        default: 'upsert',
      },
      'create-if-not-exists': {
        description: 'Whether a comment should be created even if comment-tag is not found.',
        required: false,
        default: 'true',
      },
    },
  },
  jest: false,
  buildWorkflowOptions: {
    mutableBuild: false,
  },
});

// Constrain minimum versions of transitive dependencies with known advisories
// that don't yet have upstream fixes available via direct package upgrades.
// These are minimum-version constraints (caret ranges), not exact pins, so
// patch/minor updates with the fixes will be picked up automatically.
project.package.addField('overrides', {
  'undici': '^6.27.0',
  'fast-xml-parser': '^5.9.3',
  'fast-xml-builder': '^1.2.0',
  'js-yaml': '^4.2.0',
  '@actions/http-client': '^2.2.3',
});

// The packageTask is fully reset below in the deps-upgrade block to point
// ncc directly at the TypeScript sources, so nothing extra is wired here.

// Configure vitest as the test runner
const testTask = project.tasks.tryFind('test')!;
testTask.reset('vitest run --coverage --passWithNoTests', { receiveArgs: true });
const watchTask = project.tasks.tryFind('test:watch');
if (watchTask) {
  watchTask.reset('vitest', { receiveArgs: true });
}
const eslintTask = project.tasks.tryFind('eslint');
if (eslintTask) {
  testTask.spawn(eslintTask);
}

project.addGitIgnore('/coverage/');
project.addGitIgnore('/test-reports/');
project.addGitIgnore('junit.xml');
// ncc emits .d.ts shadows next to bundles when fed .ts sources; they are
// not needed by the Action runtime, so keep them out of git.
project.addGitIgnore('dist/**/*.d.ts');

// Ensure test/coverage artifacts are never published to npm even if they
// happen to be present in the working tree at pack/publish time.
project.addPackageIgnore('/coverage/');
project.addPackageIgnore('/test-reports/');
project.addPackageIgnore('junit.xml');

// Build the project after upgrading so that the compiled JS ends up being committed
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

// @actions/core@>=2 and @actions/github@>=8 are ESM-only and ship their
// types via package `exports` subpaths (e.g. `@octokit/core/types`). Use
// `Bundler` module resolution (TS 5.0+) so the source can `import` from
// ESM-only packages without TS rewriting to `require()` calls. We rely on
// ncc to do the final CJS bundling for the Action runtime, so tsc just
// type-checks.
const productionTsconfigOverrides = {
  'compilerOptions.module': 'ESNext',
  'compilerOptions.moduleResolution': 'Bundler',
  'compilerOptions.target': 'ES2022',
  'compilerOptions.lib': ['ES2022'],
  'compilerOptions.noEmit': true,
};
for (const [path, value] of Object.entries(productionTsconfigOverrides)) {
  project.tryFindObjectFile('tsconfig.json')?.addOverride(path, value);
}

// test/tsconfig.json is what ts-node uses to execute .projenrc.ts. Keep it
// on a CommonJS-compatible module/resolution so ts-node loads it as CJS
// (ESM ts-node would need a custom loader flag we don't want to wire).
// We still pin target/lib/moduleResolution wide enough to satisfy the
// modern @octokit/* type-resolution needs.
const testTsconfigOverrides = {
  'compilerOptions.module': 'CommonJS',
  'compilerOptions.moduleResolution': 'Bundler',
  'compilerOptions.target': 'ES2022',
  'compilerOptions.lib': ['ES2022'],
};
for (const [path, value] of Object.entries(testTsconfigOverrides)) {
  project.tryFindObjectFile('test/tsconfig.json')?.addOverride(path, value);
}

// Since tsc no longer emits lib/, point ncc at the TypeScript sources directly.
project.packageTask.reset('ncc build --source-map --license licenses.txt src/index.ts -o dist');
project.packageTask.exec('ncc build --source-map --license licenses.txt src/cleanup-entry.ts -o dist/cleanup');

// Repo settings consumed by https://github.com/apps/settings (probot/settings).
// The app syncs `.github/settings.yml` to the GitHub API on every push to the
// default branch. The merge-queue toggle is intentionally omitted here —
// probot/settings doesn't reliably forward it; flip it via the repo Settings
// UI (Settings → Branches → main → "Require merge queue") or one-shot `gh api`.
new YamlFile(project, '.github/settings.yml', {
  marker: true,
  obj: {
    repository: {
      name: 'actions-comment-pull-request',
      description: 'GitHub action for commenting on a pull request (Service Victoria fork).',
      has_issues: true,
      has_projects: false,
      has_wiki: false,
      default_branch: 'main',
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
      delete_branch_on_merge: true,
    },
    labels: [
      {
        name: 'deps-upgrade',
        color: '0e8a16',
        description: 'Dependency upgrade PR eligible for auto-merge',
      },
      {
        name: 'do-not-merge',
        color: 'b60205',
        description: 'Block this PR from being merged',
      },
    ],
    branches: [
      {
        name: 'main',
        protection: {
          required_pull_request_reviews: {
            required_approving_review_count: 1,
            dismiss_stale_reviews: true,
            require_code_owner_reviews: false,
          },
          required_status_checks: {
            strict: true,
            contexts: ['build'],
          },
          enforce_admins: false,
          required_linear_history: true,
          allow_force_pushes: false,
          allow_deletions: false,
          restrictions: null,
        },
      },
    ],
  },
});

project.synth();
