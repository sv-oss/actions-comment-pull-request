import { Component } from 'projen';
import { GitHubActionTypeScriptProject } from 'projen-github-action-typescript';
import { BOT_LOGIN, DEPS_UPGRADE_LABEL, DO_NOT_MERGE_LABEL } from './constants';

/**
 * Honours the `do-not-merge` label on the auto-approve + auto-queue
 * workflows. projen's AutoApproveOptions / AutoQueueOptions don't expose an
 * exclusion label, so this overrides the generated `if:` conditions
 * directly. The single source of truth is {@link guardClauses} — anything
 * new to enforce on both workflows goes there, not at the call sites.
 */
export class DoNotMergeGuard extends Component {
  private static guardClauses(): string[] {
    return [
      `contains(github.event.pull_request.labels.*.name, '${DEPS_UPGRADE_LABEL}')`,
      `(github.event.pull_request.user.login == '${BOT_LOGIN}')`,
      `!contains(github.event.pull_request.labels.*.name, '${DO_NOT_MERGE_LABEL}')`,
    ];
  }

  constructor(project: GitHubActionTypeScriptProject) {
    super(project, 'DoNotMergeGuard');

    const condition = DoNotMergeGuard.guardClauses().join(' && ');
    project
      .tryFindObjectFile('.github/workflows/auto-approve.yml')
      ?.addOverride('jobs.approve.if', condition);
    project
      .tryFindObjectFile('.github/workflows/auto-queue.yml')
      ?.addOverride('jobs.enableAutoQueue.if', condition);
  }
}
