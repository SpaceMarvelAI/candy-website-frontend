import type { KnowledgeReport, ReportFilters } from '../../../api/analyticsReports';
import { fmtCount, fmtRate, humanize } from './format';
import { useReport } from './useReport';
import { BarRows, COLORS, DataTable, Note, ReportSection, SubHeading, Tile, TileGrid } from './ui';

export function KnowledgeSection({ filters, nonce }: { filters: ReportFilters; nonce: number }) {
  const state = useReport<KnowledgeReport>('knowledge-effectiveness', filters, nonce);
  return (
    <ReportSection
      id="report-knowledge"
      title="Knowledge-base effectiveness"
      subtitle="Of the questions the agent answered, how many were answered with no knowledge-base material retrieved (a gap)."
      state={state}
      definitions={['knowledge_gap', 'knowledge_gap_rate', 'retrieval_coverage']}
    >
      {d => {
        const m = d.metrics!;
        const c = (k: string) => ({ on: filters.compare, entry: d.comparison?.[k] });
        const weekly = d.bucket === 'week';
        return (
          <>
            <TileGrid>
              <Tile label="Answered questions" kind="count" value={fmtCount(m.answered_questions)} cmp={c('answered_questions')}
                accent={COLORS.brand} />
              <Tile label="With known retrieval" kind="count" value={fmtCount(m.known_retrieval)} cmp={c('known_retrieval')}
                sub={`${fmtCount(m.unknown_retrieval)} not recorded, left out of rates`} />
              <Tile label="Knowledge gaps" kind="count" value={fmtCount(m.knowledge_gaps)} cmp={c('knowledge_gaps')} good="down"
                accent={COLORS.warn} />
              <Tile label="Gap rate" kind="rate" value={fmtRate(m.knowledge_gap_rate)} cmp={c('knowledge_gap_rate')} good="down"
                sub="gaps / known retrieval" />
              <Tile label="Retrieval coverage" kind="rate" value={fmtRate(m.retrieval_coverage)} cmp={c('retrieval_coverage')} good="up"
                sub="answered with ≥ 1 chunk" />
            </TileGrid>
            {m.answered_questions === 0 ? (
              <div style={{ marginTop: 16 }}><Note>No answered questions in this period for the selected traffic.</Note></div>
            ) : m.known_retrieval === 0 ? (
              <div style={{ marginTop: 16 }}>
                <Note tone="warn">None of the {fmtCount(m.answered_questions)} answered questions recorded retrieval, so the gap
                  rate and coverage are unavailable. Missing retrieval data is not treated as zero.</Note>
              </div>
            ) : (
              <>
                <SubHeading>By channel</SubHeading>
                <DataTable
                  caption="Knowledge gaps by channel"
                  columns={[{ label: 'Channel' }, { label: 'Answered', align: 'right' }, { label: 'Known retrieval', align: 'right' },
                    { label: 'Gaps', align: 'right' }, { label: 'Gap rate', align: 'right' }]}
                  rows={(d.by_channel ?? []).map(r => [humanize(r.channel), fmtCount(r.answered_questions),
                    fmtCount(r.known_retrieval), fmtCount(r.knowledge_gaps), fmtRate(r.knowledge_gap_rate)])}
                  minWidth={480}
                />
                <SubHeading>By agent</SubHeading>
                <DataTable
                  caption="Knowledge gaps by agent"
                  columns={[{ label: 'Agent' }, { label: 'Answered', align: 'right' }, { label: 'Known retrieval', align: 'right' },
                    { label: 'Gaps', align: 'right' }, { label: 'Gap rate', align: 'right' }]}
                  rows={(d.by_agent ?? []).map(a => [
                    <span key="a" className="ph-mask">{a.agent_name || (a.agent_id ? `${a.agent_id.slice(0, 8)}…` : 'Deleted agent')}</span>,
                    fmtCount(a.answered_questions), fmtCount(a.known_retrieval), fmtCount(a.knowledge_gaps),
                    fmtRate(a.knowledge_gap_rate)])}
                  minWidth={480}
                />
                <SubHeading>{weekly ? 'Gaps by week (UTC)' : 'Gaps by day (UTC)'}</SubHeading>
                <BarRows
                  label={weekly ? 'Knowledge gaps by week' : 'Knowledge gaps by day'}
                  rows={(d.series ?? []).map(r => ({
                    label: weekly ? `Week of ${r.date}` : r.date,
                    value: `${r.knowledge_gaps} of ${r.known_retrieval} (${fmtRate(r.knowledge_gap_rate)})`,
                    segments: [{ name: 'Gaps', value: r.knowledge_gaps, color: COLORS.warn }],
                  }))}
                />
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                  Each row shows gaps of questions with known retrieval, and the gap rate. A rate over zero known
                  questions is "—". To see which questions had no match, use the list above.
                </p>
              </>
            )}
          </>
        );
      }}
    </ReportSection>
  );
}
