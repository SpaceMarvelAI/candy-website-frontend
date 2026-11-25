import type { EscalationsReport, ReportFilters, ToolsReport } from '../../../api/analyticsReports';
import { DASH, fmtCount, fmtMs, fmtRate, humanize } from './format';
import { useReport } from './useReport';
import { BarRows, COLORS, DataTable, Note, ReportSection, SubHeading, Tile, TileGrid } from './ui';

interface Props { filters: ReportFilters; nonce: number }

const EVENT_COVERAGE =
  'Tool and escalation figures come from Phase 3 events, which exist only from that release onward (earlier ' +
  'activity has none) and, for tools, are recorded on a best-effort basis — so these counts can be lower than ' +
  'the session totals above.';

// ── Tools ─────────────────────────────────────────────────────────────────────
export function ToolsSection({ filters, nonce }: Props) {
  const state = useReport<ToolsReport>('tools', filters, nonce);
  return (
    <ReportSection
      id="report-tools"
      title="Tool usage"
      subtitle="One invocation is one attempt that finished — completed or failed. A started tool is not counted until it finishes."
      state={state}
      definitions={['tool_invocation', 'tool_success_rate']}
    >
      {d => {
        const m = d.metrics!;
        const c = (k: string) => ({ on: filters.compare, entry: d.comparison?.[k] });
        return (
          <>
            <TileGrid>
              <Tile label="Invocations" kind="count" value={fmtCount(m.invocations)} cmp={c('invocations')} accent={COLORS.brand} />
              <Tile label="Succeeded" kind="count" value={fmtCount(m.succeeded)} cmp={c('succeeded')} good="up" accent={COLORS.good} />
              <Tile label="Failed" kind="count" value={fmtCount(m.failed)} cmp={c('failed')} good="down" />
              <Tile label="Success rate" kind="rate" value={fmtRate(m.success_rate)} cmp={c('success_rate')} good="up" />
              <Tile label="Latency average" kind="ms" value={fmtMs(m.latency_avg_ms)} cmp={c('latency_avg_ms')} good="down"
                sub={`${fmtCount(m.latency_sample_size)} measured`} />
              <Tile label="Latency median" kind="ms" value={fmtMs(m.latency_p50_ms)} cmp={c('latency_p50_ms')} good="down" />
              <Tile label="Latency p95" kind="ms" value={fmtMs(m.latency_p95_ms)} cmp={c('latency_p95_ms')} good="down" />
            </TileGrid>
            {m.invocations === 0 ? (
              <div style={{ marginTop: 16 }}><Note>No tool invocations recorded in this period. {EVENT_COVERAGE}</Note></div>
            ) : (
              <>
                <SubHeading>By tool</SubHeading>
                <DataTable
                  caption="Tool invocations by tool"
                  columns={[{ label: 'Tool' }, { label: 'Invocations', align: 'right' }, { label: 'Succeeded', align: 'right' },
                    { label: 'Failed', align: 'right' }, { label: 'Success rate', align: 'right' },
                    { label: 'Latency avg', align: 'right' }, { label: 'Measured', align: 'right' }]}
                  rows={(d.by_tool ?? []).map(t => [t.tool, fmtCount(t.invocations), fmtCount(t.succeeded), fmtCount(t.failed),
                    fmtRate(t.success_rate), fmtMs(t.latency_avg_ms), fmtCount(t.latency_sample_size)])}
                  minWidth={640}
                />
                <SubHeading>By agent</SubHeading>
                <DataTable
                  caption="Tool invocations by agent"
                  columns={[{ label: 'Agent' }, { label: 'Invocations', align: 'right' }, { label: 'Succeeded', align: 'right' },
                    { label: 'Failed', align: 'right' }, { label: 'Success rate', align: 'right' }]}
                  rows={(d.by_agent ?? []).map(a => [
                    <span key="a" className="ph-mask">{a.agent_name || (a.agent_id ? `${a.agent_id.slice(0, 8)}…` : 'Deleted agent')}</span>,
                    fmtCount(a.invocations), fmtCount(a.succeeded), fmtCount(a.failed), fmtRate(a.success_rate)])}
                  minWidth={480}
                />
                {(d.failure_categories ?? []).length > 0 && (
                  <>
                    <SubHeading>Failure categories</SubHeading>
                    <BarRows
                      label="Failed tool invocations by category"
                      rows={(d.failure_categories ?? []).map(f => ({
                        label: humanize(f.category), value: String(f.failed),
                        segments: [{ name: 'Failed', value: f.failed, color: COLORS.bad }],
                      }))}
                    />
                  </>
                )}
                <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-3)' }}>{EVENT_COVERAGE}</p>
              </>
            )}
          </>
        );
      }}
    </ReportSection>
  );
}

// ── Escalations ───────────────────────────────────────────────────────────────
export function EscalationsSection({ filters, nonce }: Props) {
  const state = useReport<EscalationsReport>('escalations', filters, nonce);
  return (
    <ReportSection
      id="report-escalations"
      title="Escalations"
      subtitle="Escalations triggered, and the final result of delivering them. A delivery still being retried is neither delivered nor failed."
      state={state}
      definitions={['escalation', 'delivery_success_rate']}
    >
      {d => {
        const m = d.metrics!;
        const c = (k: string) => ({ on: filters.compare, entry: d.comparison?.[k] });
        const weekly = d.bucket === 'week';
        return (
          <>
            <TileGrid>
              <Tile label="Triggered" kind="count" value={fmtCount(m.triggered)} cmp={c('triggered')} accent={COLORS.warn} />
              <Tile label="Delivered" kind="count" value={fmtCount(m.delivered)} cmp={c('delivered')} good="up" accent={COLORS.good} />
              <Tile label="Delivery failed" kind="count" value={fmtCount(m.failed)} cmp={c('failed')} good="down" />
              <Tile label="Delivery success rate" kind="rate" value={fmtRate(m.delivery_success_rate)} cmp={c('delivery_success_rate')}
                good="up" sub={m.delivery_success_rate == null ? 'no delivery has finished' : undefined} />
            </TileGrid>
            {m.triggered === 0 && m.delivered === 0 && m.failed === 0 ? (
              <div style={{ marginTop: 16 }}><Note>No escalations recorded in this period. {EVENT_COVERAGE}</Note></div>
            ) : (
              <>
                <SubHeading>Reasons (predefined categories)</SubHeading>
                <DataTable
                  caption="Escalations by reason"
                  columns={[{ label: 'Reason' }, { label: 'Triggered', align: 'right' }]}
                  rows={(d.by_reason ?? []).map(r => [humanize(r.reason), fmtCount(r.triggered)])}
                  minWidth={280}
                />
                <SubHeading>{weekly ? 'Trend by week (UTC)' : 'Trend by day (UTC)'}</SubHeading>
                <BarRows
                  label={weekly ? 'Escalations by week' : 'Escalations by day'}
                  legend={[
                    { name: 'Triggered', value: 0, color: COLORS.warn },
                    { name: 'Delivered', value: 0, color: COLORS.good },
                    { name: 'Failed', value: 0, color: COLORS.bad },
                  ]}
                  rows={(d.series ?? []).map(r => ({
                    label: weekly ? `Week of ${r.date}` : r.date,
                    value: `${r.triggered} / ${r.delivered} / ${r.failed}`,
                    segments: [{ name: 'Triggered', value: r.triggered, color: COLORS.warn },
                               { name: 'Delivered', value: r.delivered, color: COLORS.good },
                               { name: 'Failed', value: r.failed, color: COLORS.bad }],
                  }))}
                />
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                  Values read triggered / delivered / failed. A delivery is dated when it finished, which can be a
                  later day than its escalation. A rate shown as "{DASH}" means no delivery has finished yet.
                </p>
              </>
            )}
          </>
        );
      }}
    </ReportSection>
  );
}
