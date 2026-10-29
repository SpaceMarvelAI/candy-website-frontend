/**
 * Verification section of the patient detail page.
 *
 * `latest_status: "verified"` means "the most recently created verification episode completed". It does
 * NOT prove the patient's identity: the API does not say which method produced it, and it can come from a
 * session that was never bound to the patient's registered phone. So the copy only ever says that a
 * verification was RECORDED, always with a timestamp and an explicit caveat, and never uses wording such
 * as "identity verified", "identity confirmed" or "patient authenticated". Internal detail (session kind,
 * factors) is deliberately not shown.
 */
import type { PatientVerification, VerificationEpisode, VerificationStatus } from '../../api/crm';
import { Badge, Card, fmtDateTime, type Tone } from './ui';

const HEADLINE: Record<VerificationStatus, { text: string; tone: Tone }> = {
  verified: { text: 'Verification recorded', tone: 'info' },
  pending:  { text: 'Verification pending', tone: 'warn' },
  failed:   { text: 'Verification attempt failed', tone: 'bad' },
  revoked:  { text: 'Verification revoked', tone: 'mute' },
};

function episodeTime(e: VerificationEpisode): string | null {
  if (e.status === 'verified') return e.verified_at ?? e.created_at;
  if (e.status === 'failed') return e.failed_at ?? e.created_at;
  if (e.status === 'revoked') return e.revoked_at ?? e.created_at;
  return e.created_at;
}

export function VerificationCard({ verification }: { verification: PatientVerification }) {
  const { latest_status: latest, episodes } = verification;
  const newestFirst = [...episodes].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const latestEpisode = newestFirst[0];
  const headline = latest ? HEADLINE[latest] : null;

  return (
    <Card title="Verification">
      <div style={{ padding: '16px 22px' }}>
        {headline ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Badge tone={headline.tone}>{headline.text}</Badge>
              {latestEpisode && (
                <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{fmtDateTime(episodeTime(latestEpisode))}</span>
              )}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '10px 0 0' }}>
              This shows that a verification session was recorded for this patient. It is not proof of the
              patient&rsquo;s identity.
            </p>
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>No verification has been recorded for this patient.</p>
        )}
      </div>
      {newestFirst.length > 0 && (
        <ul aria-label="Verification history" style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--border)' }}>
          {newestFirst.map((e) => (
            <li key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 22px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
              <span>{HEADLINE[e.status].text}</span>
              <span style={{ color: 'var(--text-3)' }}>{fmtDateTime(episodeTime(e))}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
