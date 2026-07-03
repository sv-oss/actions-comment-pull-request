import fs from 'node:fs';
import * as core from '@actions/core';
import * as github from '@actions/github';
import type { GetResponseDataTypeFromEndpointMethod } from '@octokit/types';

// See https://docs.github.com/en/rest/reactions#reaction-types
const REACTIONS = ['+1', '-1', 'laugh', 'confused', 'heart', 'hooray', 'rocket', 'eyes'] as const;
type Reaction = (typeof REACTIONS)[number];

export async function run() {
  try {
    const message: string = core.getInput('message');
    const filePath: string = core.getInput('file-path');
    const githubToken: string = core.getInput('github-token');
    const prNumber: string = core.getInput('pr-number');
    const commentTag: string = core.getInput('comment-tag');
    const reactions: string = core.getInput('reactions');
    const mode: string = core.getInput('mode');
    const createIfNotExists: boolean = core.getInput('create-if-not-exists') === 'true';
    const commentAuthor: string = core.getInput('comment-author');

    if (!message && !filePath && mode !== 'delete') {
      core.setFailed('Either "file-path" or "message" should be provided as input unless running as "delete".');
      return;
    }

    let content: string = message;
    if (!message && filePath) {
      content = fs.readFileSync(filePath, 'utf8');
    }

    const context = github.context;
    const issueNumber = parseInt(prNumber) || context.payload.pull_request?.number || context.payload.issue?.number;

    const octokit = github.getOctokit(githubToken);

    if (!issueNumber) {
      core.setFailed('No issue/pull request in input neither in current context.');
      return;
    }

    async function addReactions(commentId: number, reactionsList: string) {
      const validReactions = <Reaction[]>reactionsList
        .replace(/\s/g, '')
        .split(',')
        .filter((reaction) => REACTIONS.includes(<Reaction>reaction));

      await Promise.allSettled(
        validReactions.map(async (reactionContent) => {
          await octokit.rest.reactions.createForIssueComment({
            ...context.repo,
            comment_id: commentId,
            content: reactionContent,
          });
        }),
      );
    }

    function setCommentOutputs(comment: {
      id: number;
      body?: string | null | undefined;
      html_url: string;
      url: string;
      user?: { login: string } | null;
      created_at: string;
      updated_at: string;
    }) {
      core.setOutput('id', comment.id);
      core.setOutput('body', comment.body);
      core.setOutput('html-url', comment.html_url);
      core.setOutput('url', comment.url);
      core.setOutput('user-login', comment.user?.login ?? '');
      core.setOutput('created-at', comment.created_at);
      core.setOutput('updated-at', comment.updated_at);
    }

    async function createComment({
      owner,
      repo,
      issueNumber: createIssueNumber,
      body,
    }: {
      owner: string;
      repo: string;
      issueNumber: number;
      body: string;
    }) {
      const { data: comment } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: createIssueNumber,
        body,
      });

      setCommentOutputs(comment);

      await addReactions(comment.id, reactions);

      return comment;
    }

    async function updateComment({
      owner,
      repo,
      commentId,
      body,
    }: {
      owner: string;
      repo: string;
      commentId: number;
      body: string;
    }) {
      const { data: comment } = await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: commentId,
        body,
      });

      setCommentOutputs(comment);

      await addReactions(comment.id, reactions);

      return comment;
    }

    async function deleteComment({ owner, repo, commentId }: { owner: string; repo: string; commentId: number }) {
      const { data: comment } = await octokit.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: commentId,
      });

      return comment;
    }

    async function minimizeComment(nodeId: string) {
      try {
        await octokit.graphql<{ minimizeComment: { minimizedComment: { isMinimized: boolean } } }>(
          `mutation($subjectId: ID!) {
            minimizeComment(input: { subjectId: $subjectId, classifier: OUTDATED }) {
              minimizedComment { isMinimized }
            }
          }`,
          { subjectId: nodeId },
        );
      } catch (error) {
        // The REST list endpoint doesn't expose `isMinimized`, so we can't tell
        // up front which matches are already collapsed. GitHub rejects
        // re-minimizing an already-minimized comment; treat that as a no-op so
        // outdate stays idempotent across reruns.
        const minimizeError = error instanceof Error ? error.message : String(error);
        if (/already.*minimized|MINIMIZED_ALREADY/i.test(minimizeError)) {
          core.debug(`Comment ${nodeId} is already minimized; skipping.`);
          return;
        }
        throw error;
      }
    }

    const commentTagPattern = commentTag ? `<!-- service-victoria/actions-comment-pull-request "${commentTag}" -->` : null;
    const body = commentTagPattern ? `${content}\n${commentTagPattern}` : content;

    if (commentTagPattern) {
      type ListCommentsResponseDataType = GetResponseDataTypeFromEndpointMethod<
        typeof octokit.rest.issues.listComments
      >;
      const matchingComments: ListCommentsResponseDataType = [];
      for await (const { data: comments } of octokit.paginate.iterator(octokit.rest.issues.listComments, {
        ...context.repo,
        issue_number: issueNumber,
      })) {
        for (const c of comments as ListCommentsResponseDataType) {
          if (!c?.body?.includes(commentTagPattern)) continue;
          if (commentAuthor && c.user?.login !== commentAuthor) continue;
          matchingComments.push(c);
        }
      }
      const comment = matchingComments[0];

      if (comment) {
        if (mode === 'upsert') {
          await updateComment({
            ...context.repo,
            commentId: comment.id,
            body,
          });
          return;
        } else if (mode === 'recreate') {
          await deleteComment({
            ...context.repo,
            commentId: comment.id,
          });

          await createComment({
            ...context.repo,
            issueNumber,
            body,
          });
          return;
        } else if (mode === 'outdate') {
          // Collapse every previously-posted comment carrying this tag, not
          // just the first match, so a backlog of active comments (e.g. one per
          // push) all get marked outdated instead of only the oldest.
          for (const previous of matchingComments) {
            await minimizeComment(previous.node_id);
          }
          await createComment({
            ...context.repo,
            issueNumber,
            body,
          });
          return;
        } else if (mode === 'delete') {
          await deleteComment({
            ...context.repo,
            commentId: comment.id,
          });
          return;
        } else if (mode === 'delete-on-completion') {
          core.debug('Registering this comment to be deleted.');
        } else {
          core.setFailed(
            `Mode ${mode} is unknown. Please use 'upsert', 'recreate', 'outdate', 'delete' or 'delete-on-completion'.`,
          );
          return;
        }
      } else if (mode === 'delete') {
        core.info('No comment has been found with asked pattern. Nothing to delete.');
        return;
      } else if (createIfNotExists) {
        core.info('No comment has been found with asked pattern. Creating a new comment.');
      } else {
        core.info(
          'Not creating comment as the pattern has not been found. Use `create-if-not-exists: true` to create a new comment anyway.',
        );
        return;
      }
    }

    await createComment({
      ...context.repo,
      issueNumber,
      body,
    });
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

