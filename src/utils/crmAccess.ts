/**
 * Role helper for CRM UX. The backend is the only authority — it redacts viewer responses and rejects
 * disallowed writes with 403 — so this only decides what to *offer*. It never unmasks or fills in data.
 *
 * Backend contract: reads → any role; writes → owner/admin/member/builder; viewer is restricted.
 * "member" is stored as "builder" by SSO, so the token may carry either spelling.
 */
const WORKING_ROLES = new Set(['owner', 'admin', 'member', 'builder']);

export function canWriteCrm(role: string | null | undefined): boolean {
  return !!role && WORKING_ROLES.has(role.toLowerCase());
}
/** Recording a consent entry is narrower than other writes: the backend allows owner / admin only. */
export function canRecordConsent(role: string | null | undefined): boolean {
  const r = role?.toLowerCase();
  return r === 'owner' || r === 'admin';
}
