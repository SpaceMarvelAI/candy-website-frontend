/**
 * Shared inline-style tokens.
 *
 * These three patterns were each redefined per-file with drifting values
 * (sectionHeader existed 4x with marginBottom 12/14/16, sectionTitle with
 * fontSize 13.5/14, pill with two different sizes). One definition here.
 */
import type { CSSProperties } from 'react';

/** Row above a card's content: title group on the left, actions on the right. */
export const sectionHeader: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginBottom: 14,
};

/** The <h3> inside a sectionHeader. */
export const sectionTitle: CSSProperties = {
  fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0,
};

/** Small count/meta badge sitting next to a sectionTitle. */
export const sectionPill: CSSProperties = {
  fontSize: 11, fontWeight: 500, color: 'var(--text-3)',
  padding: '3px 8px', borderRadius: 99,
  background: 'var(--card-bg)', border: '1px solid var(--border)',
};
