import ChatbotWorkspace from '../../components/agent/ChatbotWorkspace';

const DEFAULT_PROMPT = `You are a Banking Support agent. Help customers with:
- Account balance and transaction history queries.
- Dispute resolution for unauthorised or incorrect transactions.
- Loan and credit product information.
- Card block/unblock requests.
- Fraud alert verification and escalation.
- Online banking and app troubleshooting.

Compliance rules:
- Never ask for full card numbers, PINs, or OTPs.
- Always verify identity before sharing account information.
- Escalate suspected fraud cases immediately to the fraud team.
- Do not provide investment advice or guaranteed returns.`;

const PRESETS = [{ label: 'Account queries', body: `Handle balance checks, statement requests, and transaction history. Verify identity with last 4 digits + DOB.` }, { label: 'Dispute handling', body: `Guide customers through raising transaction disputes. Collect transaction date, amount, and merchant name.` }, { label: 'Fraud alert', body: `Verify fraud alerts, block compromised cards, and escalate to the fraud investigation team.` }];

export default function ChatbotBank() {
  return (
    <ChatbotWorkspace
      slug="bank"
      category="Banking Support"
      icon="money"
      tint="green"
      defaultPrompt={DEFAULT_PROMPT}
      presets={PRESETS}
    />
  );
}
