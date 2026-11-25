import type { CallMetrics, CallsReport, ReportFilters } from '../../../api/analyticsReports';
import { DASH, fmtCount, fmtMs, fmtRate, humanize } from './format';
import { useReport } from './useReport';
import { COLORS, DataTable, Note, ReportSection, StackBar, SubHeading, Tile, TileGrid } from './ui';

const hasCallMetrics = (m: CallsReport['metrics']): m is CallMetrics => !!m && 'initiated' in m;

export function CallsSection({ filters, nonce }: { filters: ReportFilters; nonce: number }) {
  const state = useReport<CallsReport>('calls', filters, nonce);
  return (
    <ReportSection
      id="report-calls"
      title="Calls and voice providers"
      subtitle="Real phone and WhatsApp calls (candy.calls). Call counts are separate from chat session counts."
      state={state}
      definitions={['call_terminal', 'call_completed', 'call_disconnected', 'call_completion_rate']}
    >
      {d => {
        if (!hasCallMetrics(d.metrics)) {
          return <Note>{d.note ?? 'Calls are production traffic; there are none for the selected traffic.'}</Note>;
        }
        const m = d.metrics;
        const c = (k: string) => ({ on: filters.compare, entry: d.comparison?.[k] });
        const stage = (name: string, s: NonNullable<CallsReport['latency']>['llm']) => [
          name,
          fmtCount(s.sample_size),
          s.sample_size === 0 ? 'Not measured' : fmtMs(s.avg_ms),
          s.sample_size === 0 ? 'Not measured' : fmtMs(s.p50_ms),
          s.sample_size === 0 ? 'Not measured' : (s.p95_ms === undefined ? DASH : fmtMs(s.p95_ms)),
        ];
        return (
          <>
            <StackBar
              label="Calls by outcome"
              unit="calls"
              segments={[
                { name: 'Completed', value: m.completed, color: COLORS.good },
                { name: 'Disconnected', value: m.disconnected, color: COLORS.warn },
                { name: 'Failed', value: m.failed, color: COLORS.bad },
                { name: 'No answer', value: m.no_answer, color: COLORS.info },
              ]}
            />
            <div style={{ marginTop: 16 }}>
              <TileGrid>
                <Tile label="Calls initiated" kind="count" value={fmtCount(m.initiated)} cmp={c('initiated')} accent={COLORS.brand} />
                <Tile label="Completed" kind="count" value={fmtCount(m.completed)} cmp={c('completed')} good="up" accent={COLORS.good} />
                <Tile label="Disconnected" kind="count" value={fmtCount(m.disconnected)} cmp={c('disconnected')} good="down"
                  sub="dropped without a provider hang-up" />
                <Tile label="Failed" kind="count" value={fmtCount(m.failed)} cmp={c('failed')} good="down" />
                <Tile label="No answer" kind="count" value={fmtCount(m.no_answer)} cmp={c('no_answer')} />
                <Tile label="Still open" kind="count" value={fmtCount(m.open)} cmp={c('open')} sub="not in the completion rate" />
                <Tile label="Completion rate" kind="rate" value={fmtRate(m.completion_rate)} cmp={c('completion_rate')} good="up"
                  sub={`of ${fmtCount(m.terminal)} finished`} />
                <Tile label="Average duration" kind="ms" value={fmtMs(m.avg_duration_ms)} cmp={c('avg_duration_ms')}
                  sub={`${fmtCount(m.duration_sample_size)} completed with an end time`} />
                <Tile label="Median duration" kind="ms" value={fmtMs(m.median_duration_ms)} cmp={c('median_duration_ms')} />
              </TileGrid>
            </div>
            {m.initiated === 0 ? (
              <div style={{ marginTop: 16 }}><Note>No calls in this period.</Note></div>
            ) : (
              <>
                <SubHeading>By channel</SubHeading>
                <DataTable
                  caption="Calls by channel"
                  columns={[{ label: 'Channel' }, { label: 'Initiated', align: 'right' }, { label: 'Completed', align: 'right' },
                    { label: 'Disconnected', align: 'right' }, { label: 'Failed', align: 'right' },
                    { label: 'No answer', align: 'right' }, { label: 'Completion', align: 'right' },
                    { label: 'Avg duration', align: 'right' }]}
                  rows={(d.by_channel ?? []).map(r => [humanize(r.channel), fmtCount(r.initiated), fmtCount(r.completed),
                    fmtCount(r.disconnected), fmtCount(r.failed), fmtCount(r.no_answer), fmtRate(r.completion_rate),
                    fmtMs(r.avg_duration_ms)])}
                  minWidth={680}
                />
              </>
            )}
            {d.latency && (
              <>
                <SubHeading>Per-turn latency by stage</SubHeading>
                <DataTable
                  caption="Call latency by stage"
                  columns={[{ label: 'Stage' }, { label: 'Turns measured', align: 'right' }, { label: 'Average', align: 'right' },
                    { label: 'Median', align: 'right' }, { label: 'p95', align: 'right' }]}
                  rows={[stage('LLM', d.latency.llm), stage('STT', d.latency.stt), stage('TTS', d.latency.tts)]}
                  minWidth={480}
                />
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                  "Not measured" means the provider path never recorded that stage — it is not zero.
                </p>
              </>
            )}
            {d.events && (
              <>
                <SubHeading>Call events</SubHeading>
                <DataTable
                  caption="Call events by type"
                  columns={[{ label: 'Event' }, { label: 'Count', align: 'right' }]}
                  rows={Object.entries(d.events.counts).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, fmtCount(v)])}
                  minWidth={280}
                  empty="No call events in this period."
                />
                {d.events.failure_categories.length > 0 && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                    Provider failures: {d.events.failure_categories.map(f => `${humanize(f.category)} ${f.failed}`).join(' · ')}.
                  </p>
                )}
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-3)' }}>{d.events.coverage}</p>
              </>
            )}
            {(d.unsupported ?? []).length > 0 && (
              <details style={{ marginTop: 14, fontSize: 12, color: 'var(--text-3)' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-2)' }}>What is not measured</summary>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
                  {d.unsupported!.map(u => <li key={u}>{u}</li>)}
                </ul>
              </details>
            )}
          </>
        );
      }}
    </ReportSection>
  );
}
