# Migration guide

## From `thollander/actions-comment-pull-request@v3` to `service-victoria/actions-comment-pull-request@v1`

Drop-in compatible **except** for one behavioural change:

### Comment marker change (breaking)

The HTML marker used to identify a comment for upsert/delete via the `comment-tag` input changed:

- **Old:** `<!-- thollander/actions-comment-pull-request "your-tag" -->`
- **New:** `<!-- service-victoria/actions-comment-pull-request "your-tag" -->`

This means PR comments previously created by the upstream `thollander` action will **not** be found by this fork — `mode: upsert` will create a new comment alongside the old one, and `mode: delete` / `delete-on-completion` will not delete the old one.

If this matters for an in-flight PR, manually delete or edit the old comment when cutting over.

### Update `uses:` references

Replace every:

```yaml
uses: thollander/actions-comment-pull-request@v3
```

with:

```yaml
uses: service-victoria/actions-comment-pull-request@v1
```

### Runtime

This fork runs on `node24` instead of `node20`. No workflow changes required — GitHub-hosted runners support it.

---

## From v2 to v3 (upstream)

### Parameters

- From `filePath` to `file-path`
- From `GITHUB_TOKEN` to `github-token`
- From `pr_number` to `pr-number`
- From `comment_tag` to `comment-tag`
- From `create_if_not_exists` to `create-if-not-exists`

### Mode

`delete` now deletes a comment immediately. To delete the comment at the end of the job, use `delete-on-completion` mode.
