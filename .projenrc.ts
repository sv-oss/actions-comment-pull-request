import { github, javascript, DependencyType } from 'projen';
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
  deps: [
    '@octokit/types@^13',
  ],
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

// The packageTask defaults to bundling the action's `main` entry. We have a
// second entry (`cleanup-entry`) that powers the `post:` step, so build it
// after the main package step finishes.
project.packageTask.exec('ncc build --source-map --license licenses.txt lib/cleanup-entry.js -o dist/cleanup');

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

// Pin @actions/* deps to versions known compatible with the existing source.
// projen-github-action-typescript adds these as `*`; replace with explicit caret ranges.
project.deps.removeDependency('@actions/core');
project.deps.removeDependency('@actions/github');
project.deps.addDependency('@actions/core@^1.11.1', DependencyType.RUNTIME);
project.deps.addDependency('@actions/github@^6.0.0', DependencyType.RUNTIME);

project.synth();
