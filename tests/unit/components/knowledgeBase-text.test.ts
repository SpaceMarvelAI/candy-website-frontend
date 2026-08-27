/**
 * Knowledge Base inline-text preview helpers.
 *
 * Context: the viewer showed "Preview not available for .txt files" for every
 * uploaded text document. The render already had a `content_text` branch, but
 * nothing ever populated it — the backend has no GET on
 * /v1/agents/{id}/knowledge/{kb_id} (only PATCH and DELETE), so the detail call
 * 405s. The fix fetches the bytes from the presigned URL the Download link
 * already uses, gated by the two checks below.
 */
import { describe, it, expect } from 'vitest';
import { extOf, isTextExt, MAX_INLINE_TEXT_BYTES } from '../../../src/components/agent/KnowledgeBase';

describe('extOf', () => {
  it('lowercases the extension', () => {
    expect(extOf('report.PDF')).toBe('pdf');
    expect(extOf('01_hospital_overview.TXT')).toBe('txt');
  });

  it('takes the last segment of a multi-dot name', () => {
    expect(extOf('archive.tar.gz')).toBe('gz');
    expect(extOf('03_patient_registration_and_intake.txt')).toBe('txt');
  });

  it('returns empty string when there is no extension', () => {
    expect(extOf('README')).toBe('');
    expect(extOf('')).toBe('');
  });
});

describe('isTextExt', () => {
  it('accepts the text types the viewer can render inline', () => {
    for (const ext of ['txt', 'md', 'csv', 'tsv', 'json', 'yaml', 'yml', 'log', 'xml', 'sql']) {
      expect(isTextExt(ext)).toBe(true);
    }
  });

  it('rejects binary and already-handled types', () => {
    // pdf and images have their own dedicated preview branches; the rest would
    // render as garbage inside a <pre>.
    for (const ext of ['pdf', 'png', 'jpg', 'docx', 'xlsx', 'zip', 'gz', 'mp3', '']) {
      expect(isTextExt(ext)).toBe(false);
    }
  });

  it('admits every file in the knowledge base that was failing', () => {
    const uploaded = [
      '01_hospital_overview.txt',
      '02_doctors_and_departments.txt',
      '03_patient_registration_and_intake.txt',
      '04_fees_and_payments.txt',
      '05_appointments_and_policies.txt',
    ];
    expect(uploaded.every(f => isTextExt(extOf(f)))).toBe(true);
  });
});

describe('MAX_INLINE_TEXT_BYTES', () => {
  it('admits the real documents, which are ~1-2 KB', () => {
    expect(1.2 * 1024).toBeLessThanOrEqual(MAX_INLINE_TEXT_BYTES);
    expect(1.6 * 1024).toBeLessThanOrEqual(MAX_INLINE_TEXT_BYTES);
  });

  it('refuses a file near the 50 MB upload ceiling', () => {
    // Dumping 50 MB into a <pre> would lock the tab.
    expect(50 * 1024 * 1024).toBeGreaterThan(MAX_INLINE_TEXT_BYTES);
  });
});
