import { Component, github } from 'projen';
import { GitHubActionTypeScriptProject } from 'projen-github-action-typescript';
import {
  CANONICAL_REPOSITORY,
  COMPATIBILITY_APP_ID_SECRET,
  COMPATIBILITY_APP_PRIVATE_KEY_SECRET,
  COMPATIBILITY_DISPATCH_EVENT,
  COMPATIBILITY_DISPATCH_SECRET,
  COMPATIBILITY_REPOSITORY,
} from './constants';

/**
 * Keeps the legacy private repository aligned with the public canonical
 * repository, then applies the private-only automation overlay. Both workflows
 * are committed to the canonical branch: the repository guards make each one
 * inert in the other repository, while allowing the sync workflow to survive
 * the next forced reset.
 */
export class CompatibilityMirror extends Component {
  constructor(project: GitHubActionTypeScriptProject) {
    super(project, 'CompatibilityMirror');

    if (!project.github) {
      throw new Error('Compatibility mirroring requires GitHub workflows.');
    }

    const notify = project.github.addWorkflow('notify-compatibility-mirror');
    notify.on({
      push: {
        branches: ['main'],
        tags: ['*'],
      },
    });
    notify.addJob('notify', {
      if: `github.repository == '${CANONICAL_REPOSITORY}'`,
      runsOn: ['ubuntu-latest'],
      permissions: {
        contents: github.workflows.JobPermission.READ,
      },
      steps: [{
        name: 'Request mirror update',
        env: {
          TOKEN: `\${{ secrets.${COMPATIBILITY_DISPATCH_SECRET} }}`,
        },
        run: [
          'curl --fail-with-body --request POST \\',
          '  --header "Accept: application/vnd.github+json" \\',
          '  --header "Authorization: Bearer $TOKEN" \\',
          `  https://api.github.com/repos/${COMPATIBILITY_REPOSITORY}/dispatches \\`,
          `  --data '{"event_type":"${COMPATIBILITY_DISPATCH_EVENT}"}'`,
        ].join('\n'),
      }],
    });

    const sync = new github.GithubWorkflow(project.github, 'sync-from-canonical', {
      limitConcurrency: true,
    });
    sync.on({
      repositoryDispatch: {
        types: [COMPATIBILITY_DISPATCH_EVENT],
      },
      workflowDispatch: {},
    });
    sync.addJob('sync', {
      if: `github.repository == '${COMPATIBILITY_REPOSITORY}'`,
      runsOn: ['ubuntu-latest'],
      permissions: {
        contents: github.workflows.JobPermission.READ,
      },
      steps: [
        {
          name: 'Generate mirror token',
          id: 'generate_mirror_token',
          uses: 'actions/create-github-app-token@f8d387b68d61c58ab83c6c016672934102569859',
          with: {
            'app-id': `\${{ secrets.${COMPATIBILITY_APP_ID_SECRET} }}`,
            'private-key': `\${{ secrets.${COMPATIBILITY_APP_PRIVATE_KEY_SECRET} }}`,
          },
        },
        {
          name: 'Checkout compatibility mirror',
          uses: 'actions/checkout@v6',
          with: {
            fetchDepth: 0,
            token: '${{ steps.generate_mirror_token.outputs.token }}',
          },
        },
        {
          name: 'Pull canonical branch, tags, and private overlay',
          run: [
            `git remote add canonical https://github.com/${CANONICAL_REPOSITORY}.git`,
            "git fetch --force canonical main 'refs/tags/*:refs/tags/*'",
            '',
            'git checkout main',
            'git reset --hard canonical/main',
            '',
            // The private repository should retain only this workflow. Removing
            // every other workflow prevents canonical CI, releases, dependency
            // upgrades, and automation from running again downstream.
            "find .github/workflows -maxdepth 1 -type f ! -name 'sync-from-canonical.yml' -delete",
            'git rm --ignore-unmatch .github/settings.yml',
            "awk 'NR == 1 { print; print \"\"; print \"> **Compatibility mirror.** This repository is retained for existing consumers. New workflows should use [sv-oss/actions-comment-pull-request](https://github.com/sv-oss/actions-comment-pull-request).\"; print \"\"; next } { print }' README.md > README.md.private",
            'mv README.md.private README.md',
            'git add --all README.md .github/workflows .github/settings.yml',
            'git config user.name "compatibility-mirror[bot]"',
            'git config user.email "compatibility-mirror[bot]@users.noreply.github.com"',
            'git diff --cached --quiet || git commit --message "chore: apply private mirror overlay"',
            '',
            'git push --force origin main',
            "git push --force --prune origin 'refs/tags/*:refs/tags/*'",
          ].join('\n'),
        },
      ],
    });
  }
}
