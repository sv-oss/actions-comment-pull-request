# Comment Pull Request - GitHub Actions

> **Service Victoria fork.** This is the Service Victoria Platform Engineering maintained fork of [`thollander/actions-comment-pull-request`](https://github.com/thollander/actions-comment-pull-request), upgraded to `node24` and managed with [projen](https://github.com/projen/projen). The upstream action appears to be unmaintained and was about to break with the GitHub Actions `node20` purge.
>
> The action behaves identically to upstream **except** that the HTML comment marker used to identify/upsert PR comments has changed from `<!-- thollander/actions-comment-pull-request "tag" -->` to `<!-- sv-oss/actions-comment-pull-request "tag" -->`. Comments created by the upstream action will **not** be matched (upsert/delete/etc.) by this fork. See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md).

## What is it ?

A GitHub action that comments with a given message the pull request linked to the pushed branch.
You can even put dynamic data thanks to [Contexts and expression syntax](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/contexts-and-expression-syntax-for-github-actions).

## Usage

### Classic usage

```yml
on: pull_request

jobs:
  example_comment_pr:
    runs-on: ubuntu-latest
    name: An example job to comment a PR
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Comment PR
        uses: sv-oss/actions-comment-pull-request@v4
        with:
          message: |
            Hello world ! :wave:
```

### Comment a file content

Thanks to the `file-path` input, a file content can be commented.
You can either pass an absolute file-path or a relative one that will be by default retrieved from `GITHUB_WORKSPACE`.
(Note that if both a `message` and `file-path` are provided, `message` will take precedence.)

```yml
- name: PR comment with file
  uses: sv-oss/actions-comment-pull-request@v4
  with:
    file-path: /path/to/file.txt
```

### Setting reactions

You can also set some reactions on your comments through the `reactions` input.
It takes only valid reactions and adds it to the comment you've just created. (See <https://docs.github.com/en/rest/reactions#reaction-types>)

```yml
- name: PR comment with reactions
  uses: sv-oss/actions-comment-pull-request@v4
  with:
    message: |
      Hello world ! :wave:
    reactions: eyes, rocket
```

### Specifying which pull request to comment on

You can explicitly input which pull request should be commented on by passing the `pr-number` input.
That is particularly useful for manual workflow for instance (`workflow_run`).

```yml
...
- name: Comment PR
  uses: sv-oss/actions-comment-pull-request@v4
  with:
    message: |
      Hello world ! :wave:
    pr-number: 123 # This will comment on pull request #123
```

### Update a comment

Editing an existing comment is also possible thanks to the `comment-tag` input.

Thanks to this parameter, it will be possible to identify your comment and then to upsert on it.
If the comment is not found at first, it will create a new comment.

_That is particularly interesting while committing multiple times in a PR and that you just want to have the last execution report printed. It avoids flooding the PR._

```yml
...
- name: Comment PR with execution number
  uses: sv-oss/actions-comment-pull-request@v4
  with:
    message: |
      _(execution **${{ github.run_id }}** / attempt **${{ github.run_attempt }}**)_
    comment-tag: execution
```

Note: the input `mode` can be used to either `upsert` (by default) or `recreate` the comment (= delete and create)

### Delete a comment

Deleting a comment with a specific `comment-tag` is possible with the `mode: delete`. If a comment with the `comment-tag` exists, it will be deleted when ran.

```yml
...
- name: Delete a comment
  uses: sv-oss/actions-comment-pull-request@v4
  with:
    comment-tag: to_delete
    mode: delete
```

### Delete a comment on job completion

Deleting an existing comment on job completion is also possible thanks to the `comment-tag` input combined with `mode: delete-on-completion`.

This will delete the comment at the end of the job.

```yml
...
- name: Write a comment that will be deleted at the end of the job
  uses: sv-oss/actions-comment-pull-request@v4
  with:
    message: |
      The PR is being built...
    comment-tag: to_delete_on_completion
    mode: delete-on-completion
```

## Inputs

### Action inputs

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| `github-token` | Token that is used to create comments. Defaults to ${{ github.token }} | ✅ | |
| `message` | Comment body | | |
| `file-path` | Path of the file that should be commented | | |
| `reactions` | List of reactions for the comment (comma separated). See <https://docs.github.com/en/rest/reactions#reaction-types>  | | |
| `pr-number` | The number of the pull request where to create the comment | | current pull-request/issue number (deduced from context) |
| `comment-tag` | A tag on your comment that will be used to identify a comment in case of replacement | | |
| `mode` | Mode that will be used to update comment (upsert/recreate/outdate/delete/delete-on-completion). `outdate` collapses the previous tagged comment as "marked as outdated" via the GraphQL `minimizeComment` API and posts a fresh comment — useful when you want to preserve audit history. | | upsert |
| `create-if-not-exists` | Whether a comment should be created even if `comment-tag` is not found | | true |
| `comment-author` | Restrict the search by `comment-tag` to comments authored by this login (e.g. `github-actions[bot]`). When unset, any comment whose body contains the tag marker is matched — this can cause the action to mutate a human reply that happened to quote the marker. Recommended on PRs with active human discussion. | | |

## Outputs

### Action outputs

You can get some outputs from this actions :

| Name | Description |
| --- | --- |
| `id` | Comment id that was created, updated, or matched |
| `body` | Full comment body, including the `comment-tag` marker |
| `html-url` | HTML URL of the comment |
| `url` | REST API URL of the comment |
| `user-login` | Login of the user/bot that owns the comment |
| `created-at` | ISO 8601 timestamp of when the comment was originally created |
| `updated-at` | ISO 8601 timestamp of when the comment was last updated |

### Example output

```yaml
- name: Comment PR
  uses: sv-oss/actions-comment-pull-request@v4
  id: hello
  with:
    message: |
      Hello world ! :wave:
- name: Check outputs
  run: |
    echo "id        : ${{ steps.hello.outputs.id }}"
    echo "body      : ${{ steps.hello.outputs.body }}"
    echo "html-url  : ${{ steps.hello.outputs.html-url }}"
    echo "url       : ${{ steps.hello.outputs.url }}"
    echo "user      : ${{ steps.hello.outputs.user-login }}"
    echo "created   : ${{ steps.hello.outputs.created-at }}"
    echo "updated   : ${{ steps.hello.outputs.updated-at }}"
```

## Tips & gotchas

A few non-obvious things worth knowing before piping arbitrary content into `message:` or `file-path`.

### Body size limit

GitHub caps comment bodies at **65,536 characters**. The action does not truncate — exceeding the limit returns `422 Body is too long`. Easy to hit when piping `terraform plan`, `pytest -v` or build logs. Trim, paginate, or upload as a workflow artefact and link to it instead.

### `recreate` and `outdate` re-notify mentions

`mode: upsert` edits the existing comment in place and does **not** re-send notifications for `@mentions`. `mode: recreate` and `mode: outdate` post a fresh comment, which **does** re-notify everyone mentioned. Prefer `upsert` on long-running PRs to keep the noise down.

### Use `comment-author` on PRs with active discussion

When you set a `comment-tag`, the action's upsert search matches **any** comment whose body contains the tag marker. GitHub's _"Quote reply"_ button copies the marker (`<!-- sv-oss/actions-comment-pull-request "tag" -->`) into the human's reply — and the next run will then mutate that human reply instead of the bot's original comment.

Set `comment-author: github-actions[bot]` (or whatever bot owns the token you pass in) to restrict the search and avoid the collision:

```yaml
- uses: sv-oss/actions-comment-pull-request@v4
  with:
    message: ...
    comment-tag: terraform-plan
    comment-author: github-actions[bot]
```

### YAML `|` vs `>` for multi-line messages

Use the literal block scalar `|` (preserves newlines), not the folded scalar `>` (collapses newlines into spaces and destroys markdown formatting):

```yaml
# ✅ Right
message: |
  ## Build report
  - All checks passed

# ❌ Wrong — renders as a single line
message: >
  ## Build report
  - All checks passed
```

### Don't interpolate untrusted strings directly

Embedding values like `${{ github.event.pull_request.body }}` straight into `message:` will break YAML parsing if the source contains quotes, backslashes or newlines (and is also a [script-injection vector](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-an-intermediate-environment-variable)). Stage them through `env:` instead:

```yaml
- env:
    PR_BODY: ${{ github.event.pull_request.body }}
  uses: sv-oss/actions-comment-pull-request@v4
  with:
    message: |
      Original description:
      ${{ env.PR_BODY }}
```

### Suggested-change blocks don't work in issue comments

Triple-backtick `suggestion` blocks (the ones with the _"Apply suggestion"_ button) only render in **PR review comments**, not in issue comments. This action posts issue comments, so a `​```suggestion` block will render as a plain code block with no Apply button — that's a GitHub API limitation, not an action bug. Use a review-comment action if you need that affordance.

### Don't include the marker yourself

The action appends `<!-- sv-oss/actions-comment-pull-request "<tag>" -->` to whatever you put in `message:`. If your message contains the same marker string, the duplicate will confuse the upsert search. Pick a unique `comment-tag` and leave the marker generation to the action.

## Permissions

Depending on the permissions granted to your token, you may lack some rights.
To run successfully, this actions needs at least :

```yaml
permissions: 
   pull-requests: write 
```

Add this in case you get `Resource not accessible by integration` error.
See [jobs.<job_id>.permissions](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idpermissions) for more information.

> Note that, if the PR comes from a fork, it will have only read permission despite the permissions given in the action for the `pull_request` event.
> In this case, you may use the `pull_request_target` event. With this event, permissions can be given without issue (the difference is that it will execute the action from the target branch and not from the origin PR).

## Contributing

This repository is managed with [projen](https://github.com/projen/projen). **Do not edit generated files directly** (`package.json`, `tsconfig.json`, `action.yml`, anything under `.github/workflows/`, `.mergify.yml`, etc.). Instead, edit `.projenrc.ts` and run `npx projen`.

### Build

The build (`npx projen build`) bundles `src/index.ts` → `dist/index.js` and `src/cleanup-entry.ts` → `dist/cleanup/index.js` via [`tsup`](https://tsup.egoist.dev/) (esbuild). Both bundles are committed so the action can be consumed directly from a git ref.

```sh
npx projen build
```

### Test

```sh
npx projen test
```

### Compatibility mirror

`sv-oss/actions-comment-pull-request` is canonical. GitHub Actions copies its
source and tags to the private `service-victoria/actions-comment-pull-request`
repository for existing consumers. The private branch then applies a
version-controlled overlay that removes every workflow except its sync workflow
and removes `.github/settings.yml`. This prevents canonical CI, releases,
dependency upgrades, PR automation, and settings synchronization from running
downstream. The overlay also adds a notice to the private README directing new
users to this canonical repository.

The generated sync workflow is deliberately committed to the canonical
repository, where its repository guard makes it inert; this preserves the
workflow when the private mirror is force-reset to canonical `main`.

Configure the `SERVICE_VICTORIA_DISPATCH_TOKEN` secret in the canonical
repository with a narrowly scoped service-account fine-grained PAT or GitHub
App token that has **Contents: write** access only to the private mirror.
The private mirror reuses its existing `CD_APPLICATION_ID` and
`CD_APPLICATION_PRIVATE_KEY` secrets for the Service Victoria CD GitHub App.
Ensure that App has **Contents: write** permission and is in the private
repository's ruleset bypass list; treat its `main` branch and tags as read-only
because each sync overwrites them.
