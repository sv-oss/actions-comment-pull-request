import { Component, YamlFile } from 'projen';
import { GitHubActionTypeScriptProject } from 'projen-github-action-typescript';
import { DEPS_UPGRADE_LABEL, DO_NOT_MERGE_LABEL } from './constants';

/**
 * Generates `.github/settings.yml` consumed by the probot/settings GitHub
 * App (https://github.com/apps/settings). The app syncs this file to the
 * GitHub API on every push to the default branch.
 *
 * Intentionally omitted:
 *   - The `required_merge_queue` toggle on branch protection: probot/settings
 *     doesn't reliably forward it. Flip it via the repo Settings UI
 *     (Settings → Branches → main → "Require merge queue") or one-shot
 *     `gh api -X PUT .../branches/main/protection/required_merge_queue`.
 *   - The "Allow GitHub Actions to create and approve pull requests" toggle
 *     (Settings → Actions → General): probot/settings can't reach it. Flip
 *     via UI or `gh api -X PUT .../actions/permissions/workflow
 *     -f can_approve_pull_request_reviews=true`.
 */
export class RepoSettings extends Component {
  constructor(project: GitHubActionTypeScriptProject) {
    super(project, 'RepoSettings');

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
          allow_rebase_merge: true,
          delete_branch_on_merge: true,
        },
        labels: [
          {
            name: DEPS_UPGRADE_LABEL,
            color: '0e8a16',
            description: 'Dependency upgrade PR eligible for auto-merge',
          },
          {
            name: DO_NOT_MERGE_LABEL,
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
  }
}
