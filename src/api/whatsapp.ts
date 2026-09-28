import { api } from './client';

export interface WhatsAppAccount {
  id:                    string;
  agent_id:              string;
  phone_number_id:       string;
  display_phone_number:  string | null;
  waba_id:               string | null;
  is_active:              boolean;
}

export interface ConnectWhatsAppBody {
  phone_number_id:       string;
  display_phone_number?: string;
  waba_id?:              string;
  app_id?:               string;
  access_token:          string;   // sent once, never returned — see backend docstring
}

export async function listWhatsAppAccounts(agentId: string): Promise<WhatsAppAccount[]> {
  return api<WhatsAppAccount[]>(`/v1/agents/${agentId}/whatsapp-accounts`);
}

export async function connectWhatsAppAccount(
  agentId: string,
  body: ConnectWhatsAppBody,
): Promise<WhatsAppAccount> {
  return api<WhatsAppAccount>(`/v1/agents/${agentId}/whatsapp-accounts`, {
    method: 'POST',
    body,
  });
}

export async function disconnectWhatsAppAccount(agentId: string, accountId: string): Promise<void> {
  await api(`/v1/agents/${agentId}/whatsapp-accounts/${accountId}`, { method: 'DELETE' });
}
