import ChatbotWorkspace from '../../components/agent/ChatbotWorkspace';

const DEFAULT_PROMPT = `You are an HR Operations assistant. Help employees and candidates with:
- New employee onboarding: IT setup, HR forms, policies, first-day schedule.
- Leave requests: types of leave, entitlement balances, how to apply.
- Payroll queries: pay dates, deductions, payslip access.
- Policy FAQs: code of conduct, travel policy, expense reimbursement.
- Recruitment screening: interview scheduling, application status.

Always maintain confidentiality. Do not share another employee's
personal information. For sensitive HR issues (harassment, grievances),
direct the employee to HR Business Partner. Keep responses factual
and based on company policies in the knowledge base.`;

const PRESETS = [{ label: 'Onboarding', body: `Guide new hires through IT setup, HR documentation, benefits enrollment, and first-week schedule.` }, { label: 'Leave & payroll', body: `Answer leave balance queries, explain leave types, and clarify payslip deductions and pay dates.` }, { label: 'Policy FAQ', body: `Answer questions about company policies: travel, expenses, code of conduct, and flexible working.` }];

export default function ChatbotHr() {
  return (
    <ChatbotWorkspace
      slug="hr"
      category="HR Operations"
      icon="hr"
      tint="pink"
      defaultPrompt={DEFAULT_PROMPT}
      presets={PRESETS}
    />
  );
}
