import { github } from 'projen';

// Single source of truth for the values that get repeated across the
// generated workflow files, branch protection, label declarations, and
// projen options. Avoid hard-coding any of these elsewhere in projenrc/.

export const BOT_LOGIN = 'sv-oss-continuous-delivery[bot]';

export const DEPS_UPGRADE_LABEL = 'deps-upgrade';

export const DO_NOT_MERGE_LABEL = 'do-not-merge';

export const APP_ID_SECRET = 'CICD_APP_ID';

export const APP_PRIVATE_KEY_SECRET = 'CICD_APP_PRIVKEY';

export const CANONICAL_REPOSITORY = 'sv-oss/actions-comment-pull-request';

export const COMPATIBILITY_REPOSITORY = 'service-victoria/actions-comment-pull-request';

export const COMPATIBILITY_DISPATCH_EVENT = 'sync-from-sv-oss';

export const COMPATIBILITY_DISPATCH_SECRET = 'SERVICE_VICTORIA_DISPATCH_TOKEN';

// The existing Service Victoria CD App is installed in the private mirror and
// can be listed as the ruleset bypass actor there.
export const COMPATIBILITY_APP_ID_SECRET = 'CD_APPLICATION_ID';

export const COMPATIBILITY_APP_PRIVATE_KEY_SECRET = 'CD_APPLICATION_PRIVATE_KEY';

/**
 * Returns a fresh `GithubCredentials` instance backed by the org's CD GitHub
 * App. Each consumer needs its own instance because projen mutates the
 * credentials when wiring them into workflows.
 */
export function ciAppCredentials() {
  return github.GithubCredentials.fromApp({
    appIdSecret: APP_ID_SECRET,
    privateKeySecret: APP_PRIVATE_KEY_SECRET,
  });
}
