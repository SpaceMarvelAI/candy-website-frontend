import { createAgent, type Agent } from './agents';
import { attachSkill } from './skills';
import type { HealthcareUseCase } from '../data/healthcareUseCases';

/**
 * Create a healthcare agent for a use case and attach its skills.
 *
 * Every use case is a `health`-domain agent (so it inherits the healthcare
 * guardrails / emergency intercept / medical STT automatically on the
 * backend). The use case's `skills` — including its hc_<key> collector — are
 * attached so the agent can run the flow immediately. The user then
 * customises (prompt, skills, number, publish) in the builder.
 *
 * Skill attach failures are collected, not thrown: the agent is created
 * either way, and the builder shows the true attached set.
 */
export async function createHealthcareAgent(
  uc: HealthcareUseCase,
  name: string,
): Promise<{ agent: Agent; attached: string[]; failed: string[] }> {
  const agent = await createAgent({
    use_case_slug: 'health',
    name: name.trim() || uc.title,
    call_direction: uc.direction, // inbound | outbound | both
  });

  const attached: string[] = [];
  const failed: string[] = [];
  for (const slug of uc.skills) {
    try {
      await attachSkill(agent.id, slug, slug.startsWith('hc_') ? { status: 'active' } : {});
      attached.push(slug);
    } catch {
      failed.push(slug);
    }
  }
  return { agent, attached, failed };
}
