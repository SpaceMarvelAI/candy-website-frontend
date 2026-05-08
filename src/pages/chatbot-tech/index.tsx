import ChatbotWorkspace from '../../components/agent/ChatbotWorkspace';

const DEFAULT_PROMPT = `You are an IT Helpdesk agent. Help users with:
- Password resets and account unlock requests.
- VPN setup and connectivity issues.
- Software installation and configuration.
- Hardware troubleshooting (printer, laptop, peripherals).
- Access requests and permissions.
- Email and collaboration tool issues.

Ask one diagnostic question at a time. Provide step-by-step instructions.
If the issue requires physical access or admin privileges, create a ticket
and assign priority (P1/P2/P3) based on business impact.`;

const PRESETS = [{ label: 'Password & access', body: `Handle password resets, MFA setup, and access permission requests. Verify identity before proceeding.` }, { label: 'Software triage', body: `Diagnose software crashes, installation failures, and configuration issues. Collect OS and version info first.` }, { label: 'Network & VPN', body: `Troubleshoot VPN connection drops, slow internet, and Wi-Fi issues. Walk through step-by-step fixes.` }];

export default function ChatbotTech() {
  return (
    <ChatbotWorkspace
      slug="tech"
      category="Technical Support"
      icon="flow"
      tint="blue"
      defaultPrompt={DEFAULT_PROMPT}
      presets={PRESETS}
    />
  );
}
