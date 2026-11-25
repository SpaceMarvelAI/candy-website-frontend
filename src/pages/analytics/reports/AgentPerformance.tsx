import type { AgentPerformanceReport, ReportFilters } from '../../../api/analyticsReports';
import { DASH, fmtCount, fmtMs, fmtRate } from './format';
import { useReport } from './useReport';
import { Note, ReportSection, Tile, TileGrid, DataTable } from './ui';

export function AgentPerformanceSection({ filters, nonce }: { filters: ReportFilters; nonce: number }) {
  const state = useReport<AgentPerformanceReport>('agent-performance', filters, nonce);
  return (
    <ReportSection
      id="report-agent-performance"
      title="Agent performance"
      subtitle="Each session, call and event belongs to the agent recorded on it. Outcome columns cover ended sessions only."
      state={state}
      definitions={['agent_attribution', 'completion_rate', 'tool_success_rate']}
    >
      {d => {
        const m = d.metrics!;
        const c = (k: string) => ({ on: filters.compare, entry: d.comparison?.[k] });
        const agents = d.agents ?? [];
        return (
          <>
            <TileGrid>
              <Tile label="Agents" kind="count" value={fmtCount(m.agents)} />
              <Tile label="Sessions" kind="count" value={fmtCount(m.sessions)} cmp={c('sessions')} />
              <Tile label="Ended sessions" kind="count" value={fmtCount(m.terminal_sessions)} cmp={c('terminal_sessions')} />
              <Tile label="Completion rate" kind="rate" value={fmtRate(m.completion_rate)} cmp={c('completion_rate')} good="up" />
            </TileGrid>
            <div style={{ marginTop: 16 }}>
              <DataTable
                caption="Agent performance"
                minWidth={1080}
                empty="No agents found for this company."
                columns={[
                  { label: 'Agent' }, { label: 'Sessions', align: 'right' }, { label: 'Completed', align: 'right' },
                  { label: 'Abandoned', align: 'right' }, { label: 'Timed out', align: 'right' },
                  { label: 'Disconnected', align: 'right' }, { label: 'Completion', align: 'right' },
                  { label: 'Escalation', align: 'right' }, { label: 'Chat turns', align: 'right' },
                  { label: 'Voice turns', align: 'right' }, { label: 'Turn failures', align: 'right' },
                  { label: 'Response avg', align: 'right' }, { label: 'Response median', align: 'right' },
                  { label: 'Tool calls', align: 'right' }, { label: 'Tool success', align: 'right' },
                ]}
                rows={agents.map(a => [
                  <span key="n" className="ph-mask" style={{ fontWeight: 500, color: 'var(--text-1)' }}>{a.name || DASH}</span>,
                  fmtCount(a.sessions), fmtCount(a.completed), fmtCount(a.abandoned), fmtCount(a.timed_out),
                  fmtCount(a.disconnected), fmtRate(a.completion_rate),
                  a.escalation_rate == null ? DASH : `${fmtRate(a.escalation_rate)} (${fmtCount(a.escalated_sessions)})`,
                  fmtCount(a.chat_turns), fmtCount(a.voice_turns),
                  a.turn_failure_rate == null ? DASH : `${fmtRate(a.turn_failure_rate)} (${fmtCount(a.turns_failed)})`,
                  fmtMs(a.response_time_avg_ms),
                  a.response_time_median_ms == null ? DASH : `${fmtMs(a.response_time_median_ms)} (n=${a.response_time_sample_size})`,
                  fmtCount(a.tool_invocations), fmtRate(a.tool_success_rate),
                ])}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <Note>
                "—" means not measured or not defined — never zero. Turn failures, response time and tool columns come from
                Phase 3 events, which only exist from that release onward, so an agent without events shows "—".
                Rates over zero ended sessions are also "—". There is no resolution or satisfaction metric: nothing
                records whether a goal was met.
              </Note>
            </div>
          </>
        );
      }}
    </ReportSection>
  );
}
