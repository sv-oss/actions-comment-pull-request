import { Component } from 'projen';
import { GitHubActionTypeScriptProject } from 'projen-github-action-typescript';

/**
 * Wires vitest in as the test runner (the project is created with
 * `jest: false`). Owns everything projen needs to know about vitest: the
 * dev dependencies, the `test` / `test:watch` task commands, folding eslint
 * into `test`, and keeping coverage/report output out of both git and the
 * npm tarball.
 *
 * The runner behaviour itself (coverage provider, reporters, include/exclude
 * globs) lives in the hand-authored `vitest.config.ts` — vitest reads that
 * directly, so there's nothing for projen to generate.
 */
export class Vitest extends Component {
  constructor(project: GitHubActionTypeScriptProject) {
    super(project, 'Vitest');

    project.addDevDeps('vitest@^4', '@vitest/coverage-v8@^4');

    const test = project.tasks.tryFind('test');
    test?.reset('vitest run --coverage --passWithNoTests', { receiveArgs: true });
    project.tasks.tryFind('test:watch')?.reset('vitest', { receiveArgs: true });

    const eslint = project.tasks.tryFind('eslint');
    if (test && eslint) test.spawn(eslint);

    for (const path of ['/coverage/', '/test-reports/', 'junit.xml']) {
      project.addGitIgnore(path);
      project.addPackageIgnore(path);
    }
  }
}
