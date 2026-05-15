/**
 * api/automations.ts — escalation config CRUD + presets
 */
import { api } from './client';

export type TriggerType = 'escalation' | 'demo_booking' | 'both';
export type AuthType    = 'none' | 'bearer' | 'api_key' | 'basic';
export type AssigneeMode = 'fixed' | 'round_robin' | 'by_agent' | 'by_language';

export interface AutomationConfig {
  id:               string;
  agent_id:         string;
  company_id:       string;
  app_type:         string;
  display_name:     string;
  webhook_url:      string;
  http_method:      string;
  headers_template: Record<string, string>;
  body_template:    Record<string, any>;
  auth_type:        AuthType;
  auth_config:      Record<string, string>;
  trigger_type:     TriggerType;
  assignee_mode:    AssigneeMode;
  assignee_config:  Record<string, any>;
  is_active:        boolean;
  created_at:       string;
  updated_at:       string;
}

export interface AutomationPreset {
  app_type:         string;
  display_name:     string;
  description:      string;
  webhook_url_hint: string;
  auth_type:        AuthType;
  body_template:    Record<string, any>;
  headers_template: Record<string, string>;
}

export interface CreateAutomationBody {
  app_type:         string;
  display_name?:    string;
  webhook_url:      string;
  http_method?:     string;
  body_template:    Record<string, any>;
  headers_template?: Record<string, string>;
  auth_type:        AuthType;
  auth_config?:     Record<string, string>;
  trigger_type:     TriggerType;
  assignee_mode?:   AssigneeMode;
  assignee_config?: Record<string, any>;
  trigger_agent_slugs?: string[];
  is_active?:       boolean;
}

export const listAutomations = (agentId: string) =>
  api<AutomationConfig[]>(`/v1/escalations/configs?agent_id=${agentId}`);

export const createAutomation = (agentId: string, body: CreateAutomationBody) =>
  api<AutomationConfig>('/v1/escalations/configs', {
    method: 'POST',
    body: JSON.stringify({ ...body, agent_id: agentId }),
  });

export const updateAutomation = (id: string, body: Partial<CreateAutomationBody>) =>
  api<AutomationConfig>(`/v1/escalations/configs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteAutomation = (id: string) =>
  api<void>(`/v1/escalations/configs/${id}`, { method: 'DELETE' });

export const testAutomation = (id: string, dryRun = true) =>
  api<{ success: boolean; status_code?: number; response?: string; error?: string }>(
    `/v1/escalations/configs/${id}/test`,
    { method: 'POST', body: JSON.stringify({ dry_run: dryRun }) },
  );

export const listPresets = () =>
  api<AutomationPreset[]>('/v1/escalations/presets');
