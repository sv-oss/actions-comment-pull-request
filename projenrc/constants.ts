import { github } from 'projen';

// Single source of truth for the values that get repeated across the
// generated workflow files, branch protection, label declarations, and
// projen options. Avoid hard-coding any of these elsewhere in projenrc/.

export const BOT_LOGIN = 'servicevic-continuous-delivery[bot]';

export const DEPS_UPGRADE_LABEL = 'deps-upgrade';

export const DO_NOT_MERGE_LABEL = 'do-not-merge';

export const APP_ID_SECRET = 'CD_APPLICATION_ID';

export const APP_PRIVATE_KEY_SECRET = 'CD_APPLICATION_PRIVATE_KEY';

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
