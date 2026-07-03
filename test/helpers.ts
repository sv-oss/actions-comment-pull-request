import { vi } from 'vitest';

export interface FakeComment {
  id: number;
  node_id: string;
  body: string;
  html_url: string;
  url: string;
  user: { login: string } | null;
  created_at: string;
  updated_at: string;
}

/**
 * Builds a plausible GitHub issue-comment payload. Only the fields the action
 * reads are meaningful; the rest carry deterministic defaults so assertions on
 * outputs are stable.
 */
export function makeComment(overrides: Partial<FakeComment> = {}): FakeComment {
  return {
    id: 100,
    node_id: 'NODE_100',
    body: 'existing body',
    html_url: 'https://github.com/o/r/issues/1#issuecomment-100',
    url: 'https://api.github.com/repos/o/r/issues/comments/100',
    user: { login: 'github-actions[bot]' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    ...overrides,
  };
}

/**
 * Creates a mock octokit whose `paginate.iterator` yields the supplied pages of
 * comments, and whose write endpoints echo back a resolvable comment so the
 * action's output-setting code has something to read.
 */
export function makeOctokit(options: {
  pages?: FakeComment[][];
  createReturn?: FakeComment;
  updateReturn?: FakeComment;
} = {}) {
  const pages = options.pages ?? [];

  const createComment = vi.fn(async () => ({ data: options.createReturn ?? makeComment({ id: 200 }) }));
  const updateComment = vi.fn(async () => ({ data: options.updateReturn ?? makeComment({ id: 100 }) }));
  const deleteComment = vi.fn(async () => ({ data: {} }));
  const createForIssueComment = vi.fn(async () => ({ data: {} }));
  const listComments = vi.fn();
  const graphql = vi.fn(async (_query: string, _vars: { subjectId: string }) => ({
    minimizeComment: { minimizedComment: { isMinimized: true } },
  }));

  const iterator = vi.fn(() => ({
    async *[Symbol.asyncIterator]() {
      for (const data of pages) {
        yield { data };
      }
    },
  }));

  return {
    graphql,
    rest: {
      issues: { listComments, createComment, updateComment, deleteComment },
      reactions: { createForIssueComment },
    },
    paginate: { iterator },
  };
}
