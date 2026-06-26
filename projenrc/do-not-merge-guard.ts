import { GitHubActionTypeScriptProject } from 'projen-github-action-typescript';
import { BOT_LOGIN, DEPS_UPGRADE_LABEL, DO_NOT_MERGE_LABEL } from './constants';

/**
 * Builds the boolean expression body shared between the auto-approve and
 * auto-queue workflow `if:` conditions. The single source of truth is the
 * list of clauses below — anything new to enforce on both workflows should
 * be added here, not duplicated at the call sites.
 */
function guardClauses(): string[] {
  return [
    `contains(github.event.pull_request.labels.*.name, '${DEPS_UPGRADE_LABEL}')`,
    `(github.event.pull_request.user.login == '${BOT_LOGIN}')`,
    `!contains(github.event.pull_request.labels.*.name, '${DO_NOT_MERGE_LABEL}')`,
  ];
}

/**
 * Honour the `do-not-merge` label on auto-approve + auto-queue workflows.
 * projen's AutoApproveOptions / AutoQueueOptions don't expose an exclusion
 * label, so override the generated `if:` conditions directly.
 */
export function applyDoNotMergeGuard(project: GitHubActionTypeScriptProject) {
  const condition = guardClauses().join(' && ');
  project
    .tryFindObjectFile('.github/workflows/auto-approve.yml')
    ?.addOverride('jobs.approve.if', condition);
  project
    .tryFindObjectFile('.github/workflows/auto-queue.yml')
    ?.addOverride('jobs.enableAutoQueue.if', condition);
}
