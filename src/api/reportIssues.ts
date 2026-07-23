/**
 * Report Issue — cross-platform ticketing, direct to S3 (no Candy backend involved).
 *
 * MetaSpace and Finixy already write tickets into the shared `spacemarvel-content-scrum`
 * bucket under a `report-issues/` prefix. Candy reads/writes the SAME prefix with the
 * SAME schema, so a ticket filed here shows up in every product's list for this user,
 * and existing MetaSpace/Finixy tickets show up here too — the bucket itself is the
 * shared store, there is no separate database.
 *
 * Schema (reverse-engineered from live MetaSpace/Finixy tickets — must match exactly):
 *   report-issues/<TICKET_ID>/issue.json
 *   report-issues/<TICKET_ID>/attachments/<epoch_ms>-<4 lowercase alnum>.<ext>
 *   TICKET_ID = MSP-YYYYMMDD-XXXX — "MSP" is shared across all products; `platform`
 *   inside issue.json records which product a ticket came from, not the ID.
 *
 * `client_context.user_id` is the shared dashboard OIDC `sub` — the same id Candy's
 * own JWT carries as user_id — so "my issues across all products" is just a filter
 * on that one field.
 */
import {
  S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand,
} from '@aws-sdk/client-s3';

const BUCKET = import.meta.env.VITE_REPORT_ISSUES_BUCKET as string;
const REGION = import.meta.env.VITE_REPORT_ISSUES_REGION as string;
const PREFIX = 'report-issues';
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB/file

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: import.meta.env.VITE_REPORT_ISSUES_ACCESS_KEY_ID as string,
    secretAccessKey: import.meta.env.VITE_REPORT_ISSUES_SECRET_ACCESS_KEY as string,
  },
});

export interface ReportedIssue {
  id: string;
  platform: string;
  title: string;
  description: string;
  email: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attachmentKeys: string[]; // relative keys, e.g. "attachments/169...-ab12.png"
}

interface ClientContext {
  user_id: string;
  organization_id?: string | null;
  company_name?: string | null;
  organization_name?: string | null;
  is_super_admin?: boolean | null;
  access_type?: string | null;
  page_url?: string | null;
  user_agent?: string | null;
  viewport?: string | null;
  theme?: string | null;
}

interface IssueRecord {
  id: string;
  platform: string;
  title: string;
  description: string;
  email: string;
  name: string;
  status: string;
  attachments: string[];
  created_at: string;
  updated_at: string;
  client_context?: ClientContext;
}

const TICKET_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ATTACHMENT_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomChars(charset: string, len: number): string {
  return Array.from({ length: len }, () => charset[Math.floor(Math.random() * charset.length)]).join('');
}

function genTicketId(): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `MSP-${day}-${randomChars(TICKET_CHARS, 4)}`;
}

function genAttachmentKey(filename: string): string {
  const ext = (filename.match(/\.[^.]+$/)?.[0] || '.bin').toLowerCase();
  return `attachments/${Date.now()}-${randomChars(ATTACHMENT_CHARS, 4)}${ext}`;
}

async function readBody(body: any): Promise<Uint8Array> {
  return body.transformToByteArray();
}

/** Every issue this user (by dashboard user_id) has ever filed, across all products. */
export async function listMyIssues(userId: string): Promise<ReportedIssue[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const resp = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: `${PREFIX}/`, ContinuationToken: token,
    }));
    for (const obj of resp.Contents ?? []) {
      if (obj.Key?.endsWith('/issue.json')) keys.push(obj.Key);
    }
    token = resp.NextContinuationToken;
  } while (token);

  const issues: ReportedIssue[] = [];
  for (const key of keys) {
    try {
      const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      const bytes = await readBody(resp.Body);
      const data: IssueRecord = JSON.parse(new TextDecoder().decode(bytes));
      if (data.client_context?.user_id !== userId) continue;
      issues.push({
        id: data.id,
        platform: data.platform,
        title: data.title,
        description: data.description,
        email: data.email,
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        attachmentKeys: data.attachments ?? [],
      });
    } catch {
      // Unreadable/partial record — skip it rather than fail the whole list.
    }
  }
  issues.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return issues;
}

/** Fetch one attachment's bytes as a blob: URL for <img>. Caller must revoke it. */
export async function loadAttachment(ticketId: string, relKey: string): Promise<string> {
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${PREFIX}/${ticketId}/${relKey}` }));
  const bytes = await readBody(resp.Body);
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
}

export interface NewIssueInput {
  title: string;
  description: string;
  files: File[];
  userId: string;
  organizationId?: string | null;
  companyName?: string | null;
  email: string;
  pageUrl: string;
  viewport: string;
  theme: string;
}

export async function createIssue(input: NewIssueInput): Promise<ReportedIssue> {
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title || !description) throw new Error('Title and description are required.');
  if (input.files.length > MAX_ATTACHMENTS) throw new Error(`Max ${MAX_ATTACHMENTS} attachments.`);
  for (const f of input.files) {
    if (f.size > MAX_ATTACHMENT_BYTES) throw new Error(`'${f.name}' exceeds the 10 MB attachment limit.`);
  }

  const ticketId = genTicketId();
  const now = new Date().toISOString();
  const attachmentKeys: string[] = [];

  for (const file of input.files) {
    const rel = genAttachmentKey(file.name);
    const buf = new Uint8Array(await file.arrayBuffer());
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: `${PREFIX}/${ticketId}/${rel}`,
      Body: buf, ContentType: file.type || 'application/octet-stream',
    }));
    attachmentKeys.push(rel);
  }

  const record: IssueRecord = {
    id: ticketId,
    platform: 'candy',
    title,
    description,
    email: input.email,
    name: input.email,
    status: 'open',
    attachments: attachmentKeys,
    created_at: now,
    updated_at: now,
    client_context: {
      user_id: input.userId,
      organization_id: input.organizationId ?? null,
      company_name: input.companyName ?? null,
      organization_name: input.companyName ?? null,
      is_super_admin: null,
      access_type: null,
      page_url: input.pageUrl,
      user_agent: navigator.userAgent,
      viewport: input.viewport,
      theme: input.theme,
    },
  };

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: `${PREFIX}/${ticketId}/issue.json`,
    Body: JSON.stringify(record), ContentType: 'application/json',
  }));

  return {
    id: ticketId, platform: 'candy', title, description, email: input.email,
    status: 'open', createdAt: now, updatedAt: now, attachmentKeys,
  };
}
