import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeComment, makeOctokit } from './helpers';

const state = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  context: { repo: { owner: 'o', repo: 'r' }, payload: {} as Record<string, any> },
  octokit: {} as ReturnType<typeof import('./helpers').makeOctokit>,
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

// Imports of the module under test are placed after the vi.mock() calls above
// to keep the mock wiring visually adjacent; ordering has no runtime effect
// because vitest hoists vi.mock().
// eslint-disable-next-line import/order
import * as core from '@actions/core';
import { run } from '../src/cleanup';

const TAG = 'my-tag';
const MARKER = `<!-- service-victoria/actions-comment-pull-request "${TAG}" -->`;

beforeEach(() => {
  state.inputs = {};
  state.context = { repo: { owner: 'o', repo: 'r' }, payload: { pull_request: { number: 42 } } };
  state.octokit = makeOctokit();
});

function setInputs(inputs: Record<string, string>) {
  state.inputs = inputs;
}

describe('mode gating', () => {
  it('skips entirely when mode is not delete-on-completion', async () => {
    setInputs({ 'mode': 'upsert', 'comment-tag': TAG });
    await run();
    expect(core.debug).toHaveBeenCalledWith('This comment was not to be deleted on completion. Skipping');
    expect(state.octokit.paginate.iterator).not.toHaveBeenCalled();
  });

  it('skips when no comment-tag is provided', async () => {
    setInputs({ mode: 'delete-on-completion' });
    await run();
    expect(core.debug).toHaveBeenCalledWith(
      "No 'comment-tag' parameter passed in. Cannot search for something to delete.",
    );
    expect(state.octokit.paginate.iterator).not.toHaveBeenCalled();
  });
});

describe('issue number resolution', () => {
  it('fails when no issue number can be resolved', async () => {
    state.context.payload = {};
    setInputs({ 'mode': 'delete-on-completion', 'comment-tag': TAG });
    await run();
    expect(core.setFailed).toHaveBeenCalledWith('No issue/pull request in input neither in current context.');
  });

  it('prefers an explicit pr-number input', async () => {
    state.octokit = makeOctokit({ pages: [[makeComment({ id: 5, body: `x\n${MARKER}` })]] });
    setInputs({ 'mode': 'delete-on-completion', 'comment-tag': TAG, 'pr-number': '888' });
    await run();
    expect(state.octokit.paginate.iterator).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ issue_number: 888 }),
    );
  });
});

describe('deletion', () => {
  it('deletes every matching tagged comment across pages', async () => {
    state.octokit = makeOctokit({
      pages: [
        [makeComment({ id: 1, body: `a\n${MARKER}` }), makeComment({ id: 2, body: 'no marker here' })],
        [makeComment({ id: 3, body: `c\n${MARKER}` })],
      ],
    });
    setInputs({ 'mode': 'delete-on-completion', 'comment-tag': TAG });
    await run();
    const del = state.octokit.rest.issues.deleteComment;
    expect(del).toHaveBeenCalledTimes(2);
    const ids = del.mock.calls.map((c: any[]) => c[0].comment_id).sort((a: number, b: number) => a - b);
    expect(ids).toEqual([1, 3]);
  });

  it('deletes nothing when no comment carries the marker', async () => {
    state.octokit = makeOctokit({ pages: [[makeComment({ id: 1, body: 'nothing to see' })]] });
    setInputs({ 'mode': 'delete-on-completion', 'comment-tag': TAG });
    await run();
    expect(state.octokit.rest.issues.deleteComment).not.toHaveBeenCalled();
  });
});

describe('comment-author filter', () => {
  it('only deletes comments authored by the configured login', async () => {
    state.octokit = makeOctokit({
      pages: [
        [
          makeComment({ id: 1, body: `a\n${MARKER}`, user: { login: 'github-actions[bot]' } }),
          makeComment({ id: 2, body: `b\n${MARKER}`, user: { login: 'some-human' } }),
        ],
      ],
    });
    setInputs({
      'mode': 'delete-on-completion',
      'comment-tag': TAG,
      'comment-author': 'github-actions[bot]',
    });
    await run();
    const del = state.octokit.rest.issues.deleteComment;
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 1 }));
  });
});

describe('error handling', () => {
  it('reports the error message via setFailed when deletion throws', async () => {
    state.octokit = makeOctokit({ pages: [[makeComment({ id: 1, body: `a\n${MARKER}` })]] });
    state.octokit.rest.issues.deleteComment = vi.fn(async () => {
      throw new Error('cleanup boom');
    });
    setInputs({ 'mode': 'delete-on-completion', 'comment-tag': TAG });
    await run();
    expect(core.setFailed).toHaveBeenCalledWith('cleanup boom');
  });
});
