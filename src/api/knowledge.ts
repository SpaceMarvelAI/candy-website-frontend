import { api } from './client';

export interface KnowledgeDoc {
  id: string;
  filename: string;
  canonical_name: string | null;
  purpose_category: string | null;
  document_tags: string[];
  audience: string;
  summary: string | null;
  effective_date: string | null;
  version_label: string | null;
  status: string;
  classification_status: string;
  size_bytes: number;
  indexed_at: string | null;
  created_at: string;
}

export interface UploadResult {
  kb_document_id: string;
  filename: string;
  size_bytes: number;
  status: string;
}

export async function listKnowledge(agentId: string): Promise<KnowledgeDoc[]> {
  return api<KnowledgeDoc[]>(`/v1/agents/${agentId}/knowledge`);
}

export async function uploadKnowledgeFile(agentId: string, file: File): Promise<UploadResult[]> {
  const fd = new FormData();
  // Backend accepts the file under any of: file / files / filename
  fd.append('file', file, file.name);
  fd.append('mime_type', file.type || 'application/octet-stream');
  fd.append('size_bytes', String(file.size));
  return api<UploadResult[]>(`/v1/agents/${agentId}/knowledge/uploads`, {
    method: 'POST',
    body: fd,
  });
}

export async function getKnowledgeDoc(agentId: string, kbId: string): Promise<KnowledgeDoc & { content_text?: string }> {
  return api(`/v1/agents/${agentId}/knowledge/${kbId}`);
}

export async function deleteKnowledge(agentId: string, kbId: string): Promise<void> {
  await api(`/v1/agents/${agentId}/knowledge/${kbId}`, { method: 'DELETE' });
}

export interface CrawlOut {
  kb_document_id: string;
  filename:       string;
  status:         string;
  pages_scraped:  number;
  char_count:     number;
}

/**
 * Scrape a public website URL via Firecrawl and add the content as a
 * knowledge document for the agent. Backend pipeline:
 *   Firecrawl → markdown → S3 → Docling parse → classify → chunk → embed.
 */
export async function crawlWebsite(
  agentId: string,
  url: string,
  crawlDepth: number = 1,
): Promise<CrawlOut> {
  return api<CrawlOut>(
    `/v1/agents/${agentId}/knowledge/crawl`,
    { method: 'POST', body: { url, crawl_depth: crawlDepth } },
  );
}
