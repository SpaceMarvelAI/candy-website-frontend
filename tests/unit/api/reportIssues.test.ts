/**
 * Tests for src/api/reportIssues.ts — the direct-to-S3 Report Issue client
 * (shared `report-issues/` bucket prefix with MetaSpace/Finixy, no Candy backend
 * involved). The AWS SDK is mocked so these run fully offline — no real bucket,
 * no real credentials, no network.
 *
 * Schema correctness (ticket ID format, attachment key format, field shapes) is
 * also verified for real against the live bucket by
 * scripts/report-issues-smoke-test.mjs and tests/e2e/core-flows.spec.ts — this
 * file covers the pure logic instead: validation, filtering, sorting, pagination.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('VITE_REPORT_ISSUES_BUCKET', 'test-bucket');
vi.stubEnv('VITE_REPORT_ISSUES_REGION', 'ap-south-1');
vi.stubEnv('VITE_REPORT_ISSUES_ACCESS_KEY_ID', 'key');
vi.stubEnv('VITE_REPORT_ISSUES_SECRET_ACCESS_KEY', 'secret');

// reportIssues.ts constructs its S3Client at module-load time, so mockSend
// must exist before vi.mock's hoisted factory runs — vi.hoisted() guarantees
// that ordering (a plain `const` here would still run after hoisting).
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function S3Client() {
    // @ts-expect-error test double, not a real S3Client
    this.send = mockSend;
  }),
  ListObjectsV2Command: vi.fn().mockImplementation(function ListObjectsV2Command(input: unknown) {
    // @ts-expect-error test double
    this.input = input;
    // @ts-expect-error test double — tag so handlers can branch by command type
    this.__type = 'list';
  }),
  GetObjectCommand: vi.fn().mockImplementation(function GetObjectCommand(input: unknown) {
    // @ts-expect-error test double
    this.input = input;
    // @ts-expect-error test double
    this.__type = 'get';
  }),
  PutObjectCommand: vi.fn().mockImplementation(function PutObjectCommand(input: unknown) {
    // @ts-expect-error test double
    this.input = input;
    // @ts-expect-error test double
    this.__type = 'put';
  }),
}));

import { listMyIssues, loadAttachment, createIssue } from '../../../src/api/reportIssues';

function issueBody(record: Record<string, unknown>) {
  return { transformToByteArray: async () => new TextEncoder().encode(JSON.stringify(record)) };
}

function fullRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'MSP-20260101-AAAA',
    platform: 'candy',
    title: 'title',
    description: 'desc',
    email: 'a@candy.internal',
    status: 'open',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    attachments: [],
    client_context: { user_id: 'u1' },
    ...overrides,
  };
}

beforeEach(() => {
  mockSend.mockReset();
});

describe('listMyIssues', () => {
  it('returns only issues matching the given userId, newest first', async () => {
    mockSend.mockImplementation(async (cmd: any) => {
      if (cmd.__type === 'list') {
        return { Contents: [{ Key: 'report-issues/MSP-1/issue.json' }, { Key: 'report-issues/MSP-2/issue.json' }] };
      }
      if (cmd.__type === 'get') {
        if (cmd.input.Key.includes('MSP-1')) {
          return { Body: issueBody(fullRecord({ id: 'MSP-1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })) };
        }
        return { Body: issueBody(fullRecord({ id: 'MSP-2', created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' })) };
      }
      throw new Error('unexpected command');
    });
    const issues = await listMyIssues('u1');
    expect(issues).toHaveLength(2);
    expect(issues[0].id).toBe('MSP-2'); // newest first
    expect(issues[1].id).toBe('MSP-1');
  });

  it('excludes issues belonging to a different user', async () => {
    mockSend.mockImplementation(async (cmd: any) => {
      if (cmd.__type === 'list') return { Contents: [{ Key: 'report-issues/MSP-1/issue.json' }] };
      return { Body: issueBody(fullRecord({ id: 'MSP-1', platform: 'metaspace', client_context: { user_id: 'someone-else' } })) };
    });
    const issues = await listMyIssues('u1');
    expect(issues).toHaveLength(0);
  });

  it('ignores records with no client_context (unattributable)', async () => {
    mockSend.mockImplementation(async (cmd: any) => {
      if (cmd.__type === 'list') return { Contents: [{ Key: 'report-issues/NOCTX/issue.json' }] };
      const { client_context, ...rest } = fullRecord({ id: 'NOCTX' });
      return { Body: issueBody(rest) };
    });
    const issues = await listMyIssues('u1');
    expect(issues).toHaveLength(0);
  });

  it('paginates via ContinuationToken', async () => {
    let listCalls = 0;
    mockSend.mockImplementation(async (cmd: any) => {
      if (cmd.__type === 'list') {
        listCalls++;
        if (listCalls === 1) return { Contents: [{ Key: 'report-issues/MSP-1/issue.json' }], NextContinuationToken: 'tok2' };
        return { Contents: [{ Key: 'report-issues/MSP-2/issue.json' }] };
      }
      const id = cmd.input.Key.includes('MSP-1') ? 'MSP-1' : 'MSP-2';
      return { Body: issueBody(fullRecord({ id })) };
    });
    const issues = await listMyIssues('u1');
    expect(listCalls).toBe(2);
    expect(issues).toHaveLength(2);
  });

  it('skips unreadable/partial records rather than failing the whole list', async () => {
    mockSend.mockImplementation(async (cmd: any) => {
      if (cmd.__type === 'list') return { Contents: [{ Key: 'report-issues/MSP-1/issue.json' }, { Key: 'report-issues/MSP-2/issue.json' }] };
      if (cmd.input.Key.includes('MSP-1')) throw new Error('corrupt object');
      return { Body: issueBody(fullRecord({ id: 'MSP-2' })) };
    });
    const issues = await listMyIssues('u1');
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('MSP-2');
  });

  it('ignores non-issue.json keys under the prefix', async () => {
    mockSend.mockImplementation(async (cmd: any) => {
      if (cmd.__type === 'list') return { Contents: [{ Key: 'report-issues/MSP-1/attachments/img.png' }] };
      throw new Error('should not GET a non-issue.json key');
    });
    const issues = await listMyIssues('u1');
    expect(issues).toEqual([]);
  });
});

describe('loadAttachment', () => {
  it('fetches the object and returns a blob: URL', async () => {
    mockSend.mockResolvedValue({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } });
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock-url') });
    const url = await loadAttachment('MSP-1', 'attachments/img.png');
    expect(url).toBe('blob:mock-url');
    vi.unstubAllGlobals();
  });
});

describe('createIssue', () => {
  const baseInput = {
    title: 'Bug report', description: 'Something broke', files: [] as File[],
    userId: 'u1', email: 'a@x.com', pageUrl: '/dashboard', viewport: '1920x1080', theme: 'dark',
  };

  it('rejects an empty title or description', async () => {
    await expect(createIssue({ ...baseInput, title: '  ' })).rejects.toThrow('Title and description are required.');
    await expect(createIssue({ ...baseInput, description: '' })).rejects.toThrow('Title and description are required.');
  });

  it('rejects more than 5 attachments', async () => {
    const files = Array.from({ length: 6 }, (_, i) => new File(['x'], `f${i}.png`));
    await expect(createIssue({ ...baseInput, files })).rejects.toThrow('Max 5 attachments.');
  });

  it('rejects an attachment over 10MB', async () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.png');
    await expect(createIssue({ ...baseInput, files: [big] })).rejects.toThrow(/exceeds the 10 MB/);
  });

  it('creates an issue and returns it with a generated ticket id', async () => {
    mockSend.mockResolvedValue({});
    const result = await createIssue(baseInput);
    expect(result.id).toMatch(/^MSP-\d{8}-[A-Z0-9]{4}$/);
    expect(result.platform).toBe('candy');
    expect(result.status).toBe('open');
    expect(result.attachmentKeys).toEqual([]);
  });

  it('trims the title and description before saving', async () => {
    mockSend.mockResolvedValue({});
    const result = await createIssue({ ...baseInput, title: '  spaced  ', description: '  also spaced  ' });
    expect(result.title).toBe('spaced');
    expect(result.description).toBe('also spaced');
  });

  it('uploads each attachment before writing issue.json', async () => {
    const calls: string[] = [];
    mockSend.mockImplementation(async (cmd: any) => { calls.push(cmd.__type); return {}; });
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    const result = await createIssue({ ...baseInput, files: [file] });
    expect(calls).toEqual(['put', 'put']); // 1 attachment upload + 1 issue.json write
    expect(result.attachmentKeys).toHaveLength(1);
    expect(result.attachmentKeys[0]).toMatch(/^attachments\/\d+-[a-z0-9]{4}\.png$/);
  });

  it('writes client_context.user_id into issue.json for cross-product filtering', async () => {
    const puts: any[] = [];
    mockSend.mockImplementation(async (cmd: any) => {
      if (cmd.__type === 'put') puts.push(cmd.input);
      return {};
    });
    await createIssue({ ...baseInput, userId: 'u-42' });
    const issueJsonPut = puts.find((p) => p.Key.endsWith('/issue.json'));
    const body = JSON.parse(issueJsonPut.Body);
    expect(body.client_context.user_id).toBe('u-42');
  });
});
