import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeComment, makeOctokit } from './helpers';

const state = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  context: { repo: { owner: 'o', repo: 'r' }, payload: {} as Record<string, any> },
  octokit: {} as ReturnType<typeof import('./helpers').makeOctokit>,
  fileContents: '',
}));

vi.mock('@actions/core', () => ({
  getInput: vi.fn((name: string) => state.inputs[name] ?? ''),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@actions/github', () => ({
  get context() {
    return state.context;
  },
  getOctokit: vi.fn(() => state.octokit),
}));

vi.mock('fs', () => ({
  default: { readFileSync: vi.fn(() => state.fileContents) },
}));

// Imports of the module under test are placed after the vi.mock() calls above
// to keep the mock wiring visually adjacent; ordering has no runtime effect
// because vitest hoists vi.mock().
// eslint-disable-next-line import/order
import * as core from '@actions/core';
import { run } from '../src/main';

const TAG = 'my-tag';
const MARKER = `<!-- service-victoria/actions-comment-pull-request "${TAG}" -->`;

beforeEach(() => {
  state.inputs = {};
  state.context = { repo: { owner: 'o', repo: 'r' }, payload: { pull_request: { number: 42 } } };
  state.octokit = makeOctokit();
  state.fileContents = '';
});

function setInputs(inputs: Record<string, string>) {
  state.inputs = inputs;
}

describe('input validation', () => {
  it('fails when neither message nor file-path provided and mode is not delete', async () => {
    setInputs({ mode: 'upsert' });
    await run();
    expect(core.setFailed).toHaveBeenCalledWith(
      'Either "file-path" or "message" should be provided as input unless running as "delete".',
    );
    expect(state.octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('does not require message/file-path when mode is delete', async () => {
    setInputs({ 'mode': 'delete', 'comment-tag': TAG });
    await run();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('fails when no issue number can be resolved', async () => {
    state.context.payload = {};
    setInputs({ message: 'hi', mode: 'upsert' });
    await run();
    expect(core.setFailed).toHaveBeenCalledWith('No issue/pull request in input neither in current context.');
  });
});

describe('issue number resolution', () => {
  it('prefers explicit pr-number input over context', async () => {
    setInputs({ 'message': 'hi', 'pr-number': '777' });
    await run();
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 777 }),
    );
  });

  it('falls back to pull_request number from context', async () => {
    setInputs({ message: 'hi' });
    await run();
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 42 }),
    );
  });

  it('falls back to issue number from context', async () => {
    state.context.payload = { issue: { number: 99 } };
    setInputs({ message: 'hi' });
    await run();
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 99 }),
    );
  });
});

describe('message sourcing', () => {
  it('reads file-path when message is empty', async () => {
    const fs = (await import('fs')).default;
    state.fileContents = 'from file';
    setInputs({ 'file-path': '/tmp/msg.txt' });
    await run();
    expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/msg.txt', 'utf8');
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'from file' }),
    );
  });

  it('prefers message over file-path when both provided', async () => {
    state.fileContents = 'from file';
    setInputs({ 'message': 'from input', 'file-path': '/tmp/msg.txt' });
    await run();
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'from input' }),
    );
  });
});

describe('creating without a comment-tag', () => {
  it('always creates a new comment (no lookup)', async () => {
    setInputs({ message: 'hello' });
    await run();
    expect(state.octokit.paginate.iterator).not.toHaveBeenCalled();
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'o', repo: 'r', issue_number: 42, body: 'hello' }),
    );
  });
});

describe('comment-tag body marker', () => {
  it('appends the service-victoria marker to the body', async () => {
    setInputs({ 'message': 'hello', 'comment-tag': TAG, 'create-if-not-exists': 'true' });
    await run();
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: `hello\n${MARKER}` }),
    );
  });
});

describe('upsert mode', () => {
  it('updates the existing tagged comment', async () => {
    state.octokit = makeOctokit({ pages: [[makeComment({ id: 55, body: `old\n${MARKER}` })]] });
    setInputs({ 'message': 'new', 'comment-tag': TAG, 'mode': 'upsert' });
    await run();
    expect(state.octokit.rest.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 55, body: `new\n${MARKER}` }),
    );
    expect(state.octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });
});

describe('recreate mode', () => {
  it('deletes the existing comment then creates a fresh one', async () => {
    state.octokit = makeOctokit({ pages: [[makeComment({ id: 55, body: `old\n${MARKER}` })]] });
    setInputs({ 'message': 'new', 'comment-tag': TAG, 'mode': 'recreate' });
    await run();
    expect(state.octokit.rest.issues.deleteComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 55 }),
    );
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: `new\n${MARKER}` }),
    );
  });
});

describe('outdate mode', () => {
  it('minimizes the previous comment via graphql then creates a new one', async () => {
    state.octokit = makeOctokit({ pages: [[makeComment({ id: 55, node_id: 'NODE_55', body: `old\n${MARKER}` })]] });
    setInputs({ 'message': 'new', 'comment-tag': TAG, 'mode': 'outdate' });
    await run();
    expect(state.octokit.graphql).toHaveBeenCalledWith(expect.stringContaining('minimizeComment'), {
      subjectId: 'NODE_55',
    });
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: `new\n${MARKER}` }),
    );
    expect(state.octokit.rest.issues.deleteComment).not.toHaveBeenCalled();
  });

  it('minimizes EVERY matching comment across pages, not just the first', async () => {
    state.octokit = makeOctokit({
      pages: [
        [
          makeComment({ id: 1, node_id: 'NODE_1', body: `a\n${MARKER}` }),
          makeComment({ id: 2, node_id: 'NODE_2', body: 'unrelated comment' }),
        ],
        [makeComment({ id: 3, node_id: 'NODE_3', body: `c\n${MARKER}` })],
      ],
    });
    setInputs({ 'message': 'new', 'comment-tag': TAG, 'mode': 'outdate' });
    await run();
    const minimizedIds = state.octokit.graphql.mock.calls.map((c: any[]) => c[1].subjectId).sort();
    expect(minimizedIds).toEqual(['NODE_1', 'NODE_3']);
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalledTimes(1);
  });

  it('respects the comment-author filter when minimizing', async () => {
    state.octokit = makeOctokit({
      pages: [
        [
          makeComment({ id: 1, node_id: 'NODE_1', body: `a\n${MARKER}`, user: { login: 'github-actions[bot]' } }),
          makeComment({ id: 2, node_id: 'NODE_2', body: `b\n${MARKER}`, user: { login: 'some-human' } }),
        ],
      ],
    });
    setInputs({ 'message': 'new', 'comment-tag': TAG, 'mode': 'outdate', 'comment-author': 'github-actions[bot]' });
    await run();
    const minimizedIds = state.octokit.graphql.mock.calls.map((c: any[]) => c[1].subjectId);
    expect(minimizedIds).toEqual(['NODE_1']);
  });

  it('treats an already-minimized comment as a no-op and still creates the new comment', async () => {
    state.octokit = makeOctokit({
      pages: [
        [
          makeComment({ id: 1, node_id: 'NODE_1', body: `a\n${MARKER}` }),
          makeComment({ id: 2, node_id: 'NODE_2', body: `b\n${MARKER}` }),
        ],
      ],
    });
    state.octokit.graphql = vi.fn(async (_query: string, vars: { subjectId: string }) => {
      if (vars.subjectId === 'NODE_1') {
        throw new Error('Could not resolve to a node: this comment has already been minimized.');
      }
      return { minimizeComment: { minimizedComment: { isMinimized: true } } };
    });
    setInputs({ 'message': 'new', 'comment-tag': TAG, 'mode': 'outdate' });
    await run();
    expect(state.octokit.graphql).toHaveBeenCalledTimes(2);
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: `new\n${MARKER}` }),
    );
  });

  it('propagates non-"already minimized" graphql errors via setFailed', async () => {
    state.octokit = makeOctokit({ pages: [[makeComment({ id: 1, node_id: 'NODE_1', body: `a\n${MARKER}` })]] });
    state.octokit.graphql = vi.fn(async () => {
      throw new Error('API rate limit exceeded');
    });
    setInputs({ 'message': 'new', 'comment-tag': TAG, 'mode': 'outdate' });
    await run();
    expect(core.setFailed).toHaveBeenCalledWith('API rate limit exceeded');
    expect(state.octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });
});

describe('delete mode', () => {
  it('deletes the matching tagged comment', async () => {
    state.octokit = makeOctokit({ pages: [[makeComment({ id: 55, body: `old\n${MARKER}` })]] });
    setInputs({ 'comment-tag': TAG, 'mode': 'delete' });
    await run();
    expect(state.octokit.rest.issues.deleteComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 55 }),
    );
    expect(state.octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('logs and does nothing when no matching comment exists', async () => {
    state.octokit = makeOctokit({ pages: [[]] });
    setInputs({ 'comment-tag': TAG, 'mode': 'delete' });
    await run();
    expect(core.info).toHaveBeenCalledWith('No comment has been found with asked pattern. Nothing to delete.');
    expect(state.octokit.rest.issues.deleteComment).not.toHaveBeenCalled();
    expect(state.octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });
});

describe('delete-on-completion mode', () => {
  it('creates a new comment when a tagged comment already exists (deletion deferred to cleanup)', async () => {
    state.octokit = makeOctokit({ pages: [[makeComment({ id: 55, body: `old\n${MARKER}` })]] });
    setInputs({ 'message': 'new', 'comment-tag': TAG, 'mode': 'delete-on-completion' });
    await run();
    expect(core.debug).toHaveBeenCalledWith('Registering this comment to be deleted.');
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: `new\n${MARKER}` }),
    );
    expect(state.octokit.rest.issues.deleteComment).not.toHaveBeenCalled();
  });
});

describe('unknown mode', () => {
  it('fails when a matching comment exists but the mode is unrecognised', async () => {
    state.octokit = makeOctokit({ pages: [[makeComment({ id: 55, body: `old\n${MARKER}` })]] });
    setInputs({ 'message': 'new', 'comment-tag': TAG, 'mode': 'bogus' });
    await run();
    expect(core.setFailed).toHaveBeenCalledWith(
      "Mode bogus is unknown. Please use 'upsert', 'recreate', 'outdate', 'delete' or 'delete-on-completion'.",
    );
    expect(state.octokit.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(state.octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });
});

describe('create-if-not-exists behaviour', () => {
  it('creates a new comment when the tag is not found and create-if-not-exists is true', async () => {
    state.octokit = makeOctokit({ pages: [[]] });
    setInputs({ 'message': 'new', 'comment-tag': TAG, 'mode': 'upsert', 'create-if-not-exists': 'true' });
    await run();
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: `new\n${MARKER}` }),
    );
  });

  it('does nothing when the tag is not found and create-if-not-exists is false', async () => {
    state.octokit = makeOctokit({ pages: [[]] });
    setInputs({ 'message': 'new', 'comment-tag': TAG, 'mode': 'upsert', 'create-if-not-exists': 'false' });
    await run();
    expect(state.octokit.rest.issues.createComment).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith(
      'Not creating comment as the pattern has not been found. Use `create-if-not-exists: true` to create a new comment anyway.',
    );
  });
});

describe('comment-author filter', () => {
  it('ignores a tag match authored by a different login', async () => {
    state.octokit = makeOctokit({
      pages: [[makeComment({ id: 55, body: `old\n${MARKER}`, user: { login: 'some-human' } })]],
    });
    setInputs({
      'message': 'new',
      'comment-tag': TAG,
      'mode': 'upsert',
      'create-if-not-exists': 'true',
      'comment-author': 'github-actions[bot]',
    });
    await run();
    // No author match -> treated as "not found" -> creates instead of updating.
    expect(state.octokit.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(state.octokit.rest.issues.createComment).toHaveBeenCalled();
  });

  it('matches when the author login matches', async () => {
    state.octokit = makeOctokit({
      pages: [[makeComment({ id: 55, body: `old\n${MARKER}`, user: { login: 'github-actions[bot]' } })]],
    });
    setInputs({
      'message': 'new',
      'comment-tag': TAG,
      'mode': 'upsert',
      'comment-author': 'github-actions[bot]',
    });
    await run();
    expect(state.octokit.rest.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 55 }),
    );
  });
});

describe('reactions', () => {
  it('applies only valid reactions, trimming whitespace and dropping invalid ones', async () => {
    setInputs({ message: 'hi', reactions: '+1, rocket , not-a-reaction,heart' });
    await run();
    const react = state.octokit.rest.reactions.createForIssueComment;
    expect(react).toHaveBeenCalledTimes(3);
    const contents = react.mock.calls.map((c: any[]) => c[0].content).sort();
    expect(contents).toEqual(['+1', 'heart', 'rocket']);
    expect(react).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 200 }));
  });

  it('applies no reactions when none are provided', async () => {
    setInputs({ message: 'hi' });
    await run();
    expect(state.octokit.rest.reactions.createForIssueComment).not.toHaveBeenCalled();
  });
});

describe('outputs', () => {
  it('sets all comment outputs from the created comment', async () => {
    state.octokit = makeOctokit({
      createReturn: makeComment({
        id: 321,
        body: 'created body',
        html_url: 'https://html',
        url: 'https://api',
        user: { login: 'bot-user' },
        created_at: '2024-05-01T00:00:00Z',
        updated_at: '2024-05-02T00:00:00Z',
      }),
    });
    setInputs({ message: 'hi' });
    await run();
    expect(core.setOutput).toHaveBeenCalledWith('id', 321);
    expect(core.setOutput).toHaveBeenCalledWith('body', 'created body');
    expect(core.setOutput).toHaveBeenCalledWith('html-url', 'https://html');
    expect(core.setOutput).toHaveBeenCalledWith('url', 'https://api');
    expect(core.setOutput).toHaveBeenCalledWith('user-login', 'bot-user');
    expect(core.setOutput).toHaveBeenCalledWith('created-at', '2024-05-01T00:00:00Z');
    expect(core.setOutput).toHaveBeenCalledWith('updated-at', '2024-05-02T00:00:00Z');
  });

  it('emits an empty user-login when the comment has no user', async () => {
    state.octokit = makeOctokit({ createReturn: makeComment({ user: null }) });
    setInputs({ message: 'hi' });
    await run();
    expect(core.setOutput).toHaveBeenCalledWith('user-login', '');
  });
});

describe('error handling', () => {
  it('reports the error message via setFailed when an API call throws', async () => {
    state.octokit = makeOctokit();
    state.octokit.rest.issues.createComment = vi.fn(async () => {
      throw new Error('boom');
    });
    setInputs({ message: 'hi' });
    await run();
    expect(core.setFailed).toHaveBeenCalledWith('boom');
  });
});
