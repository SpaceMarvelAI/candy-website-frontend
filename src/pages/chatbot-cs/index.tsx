import ChatbotWorkspace from '../../components/agent/ChatbotWorkspace';

const DEFAULT_PROMPT = `You are a Customer Support agent. Help customers with:
- Order status, tracking, and delivery queries.
- Returns, refunds, and exchange requests.
- Billing disputes and payment issues.
- Product information and recommendations.
- Account management and password resets.

Be warm, empathetic, and concise. If you can't resolve the issue,
collect the customer's contact info and create a support ticket.
Never promise refunds you can't guarantee — escalate instead.`;

const PRESETS = [{ label: 'E-commerce support', body: `Handle order tracking, returns, refund status, and product FAQs. Route billing issues to human agents.` }, { label: 'SaaS help desk', body: `Answer questions about features, pricing plans, integrations, and account settings. Log support tickets for bugs.` }, { label: 'Retail customer care', body: `Assist with in-store and online purchases, loyalty points, gift cards, and store policies.` }];

export default function ChatbotCs() {
  return (
    <ChatbotWorkspace
      slug="cs"
      category="Customer Support"
      icon="chat"
      tint="purple"
      defaultPrompt={DEFAULT_PROMPT}
      presets={PRESETS}
    />
  );
}
