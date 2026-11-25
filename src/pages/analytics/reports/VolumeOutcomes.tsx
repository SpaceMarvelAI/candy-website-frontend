import type { OutcomesReport, ReportFilters, VolumeReport } from '../../../api/analyticsReports';
import { fmtCount, fmtRate, fmtSeconds, humanize } from './format';
import { useReport } from './useReport';
import { BarRows, COLORS, DataTable, Note, ReportSection, StackBar, SubHeading, Tile, TileGrid } from './ui';

interface Props { filters: ReportFilters; nonce: number }

// ── Conversation volume ───────────────────────────────────────────────────────
export function VolumeSection({ filters, nonce }: Props) {
  const state = useReport<VolumeReport>('volume', filters, nonce);
  return (
    <ReportSection
      id="report-volume"
      title="Conversation volume"
      subtitle="Sessions count every chat session. Conversations count a resumed chain once, so a returning visitor is not a new conversation."
      state={state}
      definitions={['sessions', 'new_conversations', 'continuation_sessions', 'distinct_conversations']}
    >
      {d => {
        const m = d.metrics!;
        const c = (k: string) => ({ on: filters.compare, entry: d.comparison?.[k] });
        const weekly = d.bucket === 'week';
        const series = d.series ?? [];
        // The API leaves the new/continuation split null on days with no sessions (nothing to split) and on
        // databases without session-recovery tracking. Split the bars whenever any day carries a split; a day
        // with zero sessions is then genuinely 0 new + 0 continuation.
        const split = series.some(r => r.new_conversations != null && r.continuation_sessions != null);
        return (
          <>
            <TileGrid>
              <Tile label="Sessions" kind="count" value={fmtCount(m.sessions)} cmp={c('sessions')} accent={COLORS.brand} />
              <Tile label="New conversations" kind="count" value={fmtCount(m.new_conversations)} cmp={c('new_conversations')}
                sub="chains started in this period" />
              <Tile label="Continuation sessions" kind="count" value={fmtCount(m.continuation_sessions)} cmp={c('continuation_sessions')}
                sub="resumed after a close" />
              <Tile label="Distinct conversations" kind="count" value={fmtCount(m.distinct_conversations)} cmp={c('distinct_conversations')}
                sub="chains with any session" />
              <Tile label="Continuation share" kind="rate" value={fmtRate(m.continuation_share)} cmp={c('continuation_share')} />
            </TileGrid>
            {m.new_conversations == null && (
              <div style={{ marginTop: 12 }}>
                <Note>Conversation chains are not available: session recovery tracking is not enabled in this environment.</Note>
              </div>
            )}
            {m.sessions === 0 ? (
              <div style={{ marginTop: 16 }}><Note>No sessions in this period for the selected traffic.</Note></div>
            ) : (
              <>
                <SubHeading>{weekly ? 'Sessions by week (UTC, weeks start Monday)' : 'Sessions by day (UTC)'}</SubHeading>
                <BarRows
                  label={weekly ? 'Sessions by week' : 'Sessions by day'}
                  legend={split ? [
                    { name: 'New conversations', value: 0, color: COLORS.brand },
                    { name: 'Continuations', value: 0, color: COLORS.info },
                  ] : undefined}
                  rows={series.map(r => ({
                    label: weekly ? `Week of ${r.date}` : r.date,
                    value: String(r.sessions),
                    segments: split
                      ? [{ name: 'New', value: r.sessions === 0 ? 0 : (r.new_conversations ?? r.sessions), color: COLORS.brand },
                         { name: 'Continuation', value: r.sessions === 0 ? 0 : (r.continuation_sessions ?? 0), color: COLORS.info }]
                      : [{ name: 'Sessions', value: r.sessions, color: COLORS.brand }],
                  }))}
                />
                <SubHeading>By channel</SubHeading>
                <DataTable
                  caption="Sessions by channel"
                  columns={[{ label: 'Channel' }, { label: 'Sessions', align: 'right' }]}
                  rows={(d.by_channel ?? []).map(r => [humanize(r.channel), fmtCount(r.sessions)])}
                  minWidth={280}
                />
                {d.traffic_breakdown && (
                  <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                    All traffic in this window (ignores the Traffic filter): production {d.traffic_breakdown.production} ·
                    demo {d.traffic_breakdown.demo} · unclassified {d.traffic_breakdown.unclassified}.
                  </p>
                )}
              </>
            )}
          </>
        );
      }}
    </ReportSection>
  );
}

// ── Session outcomes ──────────────────────────────────────────────────────────
export function OutcomesSection({ filters, nonce }: Props) {
  const state = useReport<OutcomesReport>('outcomes', filters, nonce);
  return (
    <ReportSection
      id="report-outcomes"
      title="Session outcomes"
      subtitle="How ended sessions finished, from the lifecycle state (not the transcript). Active sessions are in no rate."
      state={state}
      definitions={['outcome', 'terminal_sessions', 'completion_rate', 'abandonment_rate', 'disconnect_rate', 'duration']}
    >
      {d => {
        const m = d.metrics!;
        const c = (k: string) => ({ on: filters.compare, entry: d.comparison?.[k] });
        return (
          <>
            <StackBar
              label="Ended sessions by outcome"
              segments={[
                { name: 'Completed', value: m.completed, color: COLORS.good },
                { name: 'Abandoned', value: m.abandoned, color: COLORS.warn },
                { name: 'Timed out', value: m.timed_out, color: COLORS.info },
                { name: 'Disconnected', value: m.disconnected, color: COLORS.bad },
              ]}
            />
            {m.terminal_sessions === 0 && (
              <div style={{ marginTop: 14 }}>
                <Note>No session has ended in this period, so completion and abandonment rates are unavailable.
                  {m.active_sessions > 0 && ` ${m.active_sessions} still active.`}</Note>
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <TileGrid>
                <Tile label="Completion rate" kind="rate" value={fmtRate(m.completion_rate)} cmp={c('completion_rate')} good="up"
                  accent={COLORS.good} sub={`of ${fmtCount(m.terminal_sessions)} ended`} />
                <Tile label="Abandonment rate" kind="rate" value={fmtRate(m.abandonment_rate)} cmp={c('abandonment_rate')} good="down" />
                <Tile label="Timed-out rate" kind="rate" value={fmtRate(m.timed_out_rate)} cmp={c('timed_out_rate')} good="down" />
                <Tile label="Disconnect rate" kind="rate" value={fmtRate(m.disconnect_rate)} cmp={c('disconnect_rate')} good="down" />
                <Tile label="Ended sessions" kind="count" value={fmtCount(m.terminal_sessions)} cmp={c('terminal_sessions')} />
                <Tile label="Active sessions" kind="count" value={fmtCount(m.active_sessions)} cmp={c('active_sessions')} sub="not in any rate" />
              </TileGrid>
            </div>
            <SubHeading>Duration (start → end)</SubHeading>
            <TileGrid>
              <Tile label="Average" kind="seconds" value={fmtSeconds(m.avg_duration_seconds)} cmp={c('avg_duration_seconds')}
                sub={`${fmtCount(m.duration_sample_size)} sessions with valid timestamps`} />
              <Tile label="Median" kind="seconds" value={fmtSeconds(m.median_duration_seconds)} cmp={c('median_duration_seconds')} />
              <Tile label="Completed, average" kind="seconds" value={fmtSeconds(m.completed_avg_duration_seconds)}
                cmp={c('completed_avg_duration_seconds')} sub="excludes idle waits" />
            </TileGrid>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              Timed-out sessions end when the idle sweeper closes them, so their duration includes the idle wait.
              Sessions without a valid end time are left out of durations, never counted as zero.
            </p>
          </>
        );
      }}
    </ReportSection>
  );
}
