import { describe, expect, it, vi } from 'vitest';

// Mock the @actions modules so importing the source modules has no side effects.
vi.mock('@actions/core', () => ({
  getInput: vi.fn(() => ''),
  setFailed: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  setOutput: vi.fn(),
}));

vi.mock('@actions/github', () => ({
  context: { repo: { owner: 'o', repo: 'r' }, payload: {} },
  getOctokit: vi.fn(() => ({
    rest: {
      issues: { listComments: vi.fn(), deleteComment: vi.fn(), updateComment: vi.fn(), createComment: vi.fn() },
      reactions: { createForIssueComment: vi.fn() },
    },
    paginate: { iterator: vi.fn(() => ({ async *[Symbol.asyncIterator]() {} })) },
  })),
}));

describe('main module', () => {
  it('exports run() and can be imported without side effects', async () => {
    const mod = await import('../src/main');
    expect(typeof mod.run).toBe('function');
  });
});

describe('cleanup module', () => {
  it('exports run() and can be imported without side effects', async () => {
    const mod = await import('../src/cleanup');
    expect(typeof mod.run).toBe('function');
  });
});
