/**
 * Unit tests for src/api/reportIssues.ts — the direct-to-S3 Report Issue client
 * (no Candy backend involved). Mocks @aws-sdk/client-s3's S3Client.send so these
 * run fully offline — no real bucket, no real credentials, no network.
 *
 * Schema correctness (ticket ID format, attachment key format, field shapes) is
 * verified for real against the live bucket by scripts/report-issues-smoke-test.mjs
 * and tests/e2e/core-flows.spec.ts — this file covers the pure logic instead:
 * validation, filtering, sorting, pagination.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { sendMock, fakeCommand } = vi.hoisted(() => {
  const fakeCommand = (name: string) =>
    vi.fn().mockImplementation(function (this: any, input: any) {
      this.command = name;
      this.input = input;
    });
  return { sendMock: vi.fn(), fakeCommand };
});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function S3Client() { return { send: sendMock }; }),
  ListObjectsV2Command: fakeCommand('ListObjectsV2Command'),
  GetObjectCommand: fakeCommand('GetObjectCommand'),
  PutObjectCommand: fakeCommand('PutObjectCommand'),
}));

import { listMyIssues, createIssue } from '../../../src/api/reportIssues';

function issueRecordBody(record: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  return { Body: { transformToByteArray: async () => bytes } };
}

const USER_A = 'user-aaaa';
const USER_B = 'user-bbbb';

function baseRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'MSP-20260101-AAAA',
    platform: 'candy',
    title: 'title',
    description: 'desc',
    email: 'a@candy.internal',
    name: 'a@candy.internal',
    status: 'open',
    attachments: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    client_context: { user_id: USER_A },
    ...overrides,
  };
}

beforeEach(() => {
  sendMock.mockReset();
});

describe('listMyIssues', () => {
  it('filters to only the given user_id', async () => {
    sendMock.mockImplementation(async (cmd: any) => {
      if (cmd.command === 'ListObjectsV2Command') {
        return { Contents: [{ Key: 'report-issues/T1/issue.json' }, { Key: 'report-issues/T2/issue.json' }] };
      }
      if (cmd.command === 'GetObjectCommand') {
        if (cmd.input.Key.includes('T1')) return issueRecordBody(baseRecord({ id: 'T1', client_context: { user_id: USER_A } }));
        return issueRecordBody(baseRecord({ id: 'T2', client_context: { user_id: USER_B } }));
      }
      throw new Error('unexpected command');
    });

    const issues = await listMyIssues(USER_A);
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('T1');
  });

  it('sorts newest first by createdAt', async () => {
    sendMock.mockImplementation(async (cmd: any) => {
      if (cmd.command === 'ListObjectsV2Command') {
        return { Contents: [{ Key: 'report-issues/OLD/issue.json' }, { Key: 'report-issues/NEW/issue.json' }] };
      }
      if (cmd.input.Key.includes('OLD')) {
        return issueRecordBody(baseRecord({ id: 'OLD', created_at: '2026-01-01T00:00:00.000Z' }));
      }
      return issueRecordBody(baseRecord({ id: 'NEW', created_at: '2026-06-01T00:00:00.000Z' }));
    });

    const issues = await listMyIssues(USER_A);
    expect(issues.map((i) => i.id)).toEqual(['NEW', 'OLD']);
  });

  it('skips unreadable/malformed records instead of failing the whole list', async () => {
    sendMock.mockImplementation(async (cmd: any) => {
      if (cmd.command === 'ListObjectsV2Command') {
        return { Contents: [{ Key: 'report-issues/BAD/issue.json' }, { Key: 'report-issues/GOOD/issue.json' }] };
      }
      if (cmd.input.Key.includes('BAD')) throw new Error('S3 GetObject failed');
      return issueRecordBody(baseRecord({ id: 'GOOD' }));
    });

    const issues = await listMyIssues(USER_A);
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('GOOD');
  });

  it('ignores records with no client_context (unattributable)', async () => {
    sendMock.mockImplementation(async (cmd: any) => {
      if (cmd.command === 'ListObjectsV2Command') {
        return { Contents: [{ Key: 'report-issues/NOCTX/issue.json' }] };
      }
      const { client_context, ...rest } = baseRecord({ id: 'NOCTX' });
      return issueRecordBody(rest);
    });

    const issues = await listMyIssues(USER_A);
    expect(issues).toHaveLength(0);
  });

  it('follows pagination via ContinuationToken', async () => {
    let call = 0;
    sendMock.mockImplementation(async (cmd: any) => {
      if (cmd.command === 'ListObjectsV2Command') {
        call += 1;
        if (call === 1) return { Contents: [{ Key: 'report-issues/P1/issue.json' }], NextContinuationToken: 'page2' };
        return { Contents: [{ Key: 'report-issues/P2/issue.json' }] };
      }
      const id = cmd.input.Key.includes('P1') ? 'P1' : 'P2';
      return issueRecordBody(baseRecord({ id }));
    });

    const issues = await listMyIssues(USER_A);
    expect(issues.map((i) => i.id).sort()).toEqual(['P1', 'P2']);
    expect(call).toBe(2);
  });
});

describe('createIssue', () => {
  const validInput = {
    title: 'Something broke',
    description: 'It broke when I clicked the button',
    files: [] as File[],
    userId: USER_A,
    email: 'a@candy.internal',
    pageUrl: 'https://app.candy.cx/dashboard',
    viewport: '1280x720',
    theme: 'light',
  };

  beforeEach(() => {
    sendMock.mockImplementation(async () => ({}));
  });

  it('rejects an empty title', async () => {
    await expect(createIssue({ ...validInput, title: '   ' })).rejects.toThrow(/required/i);
  });

  it('rejects an empty description', async () => {
    await expect(createIssue({ ...validInput, description: '' })).rejects.toThrow(/required/i);
  });

  it('rejects more than 5 attachments', async () => {
    const files = Array.from({ length: 6 }, (_, i) => new File(['x'], `f${i}.png`, { type: 'image/png' }));
    await expect(createIssue({ ...validInput, files })).rejects.toThrow(/max 5/i);
  });

  it('rejects a file over the 10 MB limit', async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    await expect(createIssue({ ...validInput, files: [big] })).rejects.toThrow(/10 MB/i);
  });

  it('generates a ticket id in MSP-YYYYMMDD-XXXX format', async () => {
    const issue = await createIssue(validInput);
    expect(issue.id).toMatch(/^MSP-\d{8}-[A-Z0-9]{4}$/);
  });

  it('sets platform to candy and status to open', async () => {
    const issue = await createIssue(validInput);
    expect(issue.platform).toBe('candy');
    expect(issue.status).toBe('open');
  });

  it('uploads one PutObjectCommand per attachment plus one for issue.json', async () => {
    const files = [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })];
    await createIssue({ ...validInput, files });

    const putCalls = sendMock.mock.calls.filter(([cmd]: any) => cmd.command === 'PutObjectCommand');
    expect(putCalls).toHaveLength(3); // 2 attachments + issue.json
    const issueJsonCall = putCalls.find(([cmd]: any) => cmd.input.Key.endsWith('/issue.json'));
    const body = JSON.parse(issueJsonCall[0].input.Body);
    expect(body.attachments).toHaveLength(2);
    expect(body.client_context.user_id).toBe(USER_A);
  });

  it('trims the title and description before saving', async () => {
    const issue = await createIssue({ ...validInput, title: '  spaced  ', description: '  also spaced  ' });
    expect(issue.title).toBe('spaced');
    expect(issue.description).toBe('also spaced');
  });
});
